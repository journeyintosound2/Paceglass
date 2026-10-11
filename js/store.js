// Data model and persistence. Everything lives on the device in localStorage.
//
// state = {
//   version: 1,
//   settings: { ... see defaultSettings },
//   days: { "YYYY-MM-DD": { entries: [Entry], manual: number, note: string, logged: true } }
// }
// Entry = { id, t: ISO timestamp, label, std, presetId? }
//
// A day's total is the sum of its entries plus `manual`, the amount added or removed by hand
// in the calendar. A day that exists with `logged: true` and a total of 0 is an alcohol-free day.
// A day with no record is "not filled in", which is different from alcohol-free.

import { todayKey } from './dates.js';
import { roundStd } from './drinks.js';

export const STORAGE_KEY = 'paceglass:v1';
export const SCHEMA_VERSION = 1;

export function defaultSettings(now = new Date()) {
  return {
    goalMode: 'cutback', // 'cutback' | 'break' | 'stop'
    weeklyLimit: 10, // NHMRC guideline: no more than 10 a week
    dailyLimit: 4, // and no more than 4 on any one day
    afDaysPerWeek: 3,
    baselinePerWeek: 20, // what a typical week looked like before starting
    costPerDrink: 7, // AUD per standard drink, for "money not spent"
    startDate: todayKey(now),
    weekStartsOn: 1,
    reasons: '', // the user's own "why", shown back to them during cravings
    plan: null, // step-down plan, see js/plan.js
    onboarded: false,
  };
}

export function createState(now = new Date()) {
  return { version: SCHEMA_VERSION, settings: defaultSettings(now), days: {} };
}

// ---------- persistence ----------

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Storage key for one signed-in person, so two people sharing a device never see each other's log. */
export function userStorageKey(uid) {
  return `${STORAGE_KEY}:${uid}`;
}

export function hasStoredState(storage, key = STORAGE_KEY) {
  try {
    return Boolean(safeStorage(storage)?.getItem(key));
  } catch {
    return false;
  }
}

export function load(storage, now = new Date(), key = STORAGE_KEY) {
  const s = safeStorage(storage);
  try {
    const raw = s?.getItem(key);
    if (!raw) return createState(now);
    return migrate(JSON.parse(raw), now);
  } catch {
    return createState(now);
  }
}

/** Save locally. `touch` stamps savedAt, which decides which copy wins when syncing with the cloud. */
export function save(state, storage, key = STORAGE_KEY, { touch = true } = {}) {
  const s = safeStorage(storage);
  if (touch) state.savedAt = Date.now();
  try {
    s?.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(storage, key) {
  try {
    safeStorage(storage)?.removeItem(key);
  } catch { /* ignore */ }
}

/**
 * Pick between the copy on this device and the copy in the cloud: the most recently saved wins.
 * Returns 'local', 'remote' or 'same'.
 */
export function newerCopy(localSavedAt, remoteSavedAt) {
  const l = Number(localSavedAt) || 0;
  const r = Number(remoteSavedAt) || 0;
  if (l === r) return 'same';
  return l > r ? 'local' : 'remote';
}

export function hasAnyData(state) {
  return Boolean(state && (Object.keys(state.days || {}).length || state.settings?.onboarded));
}

export function migrate(data, now = new Date()) {
  if (!data || typeof data !== 'object' || typeof data.days !== 'object') {
    throw new Error('This file is not a Paceglass backup.');
  }
  const state = createState(now);
  state.settings = { ...state.settings, ...(data.settings || {}) };
  if (Number.isFinite(Number(data.savedAt))) state.savedAt = Number(data.savedAt);
  for (const [key, day] of Object.entries(data.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day) continue;
    state.days[key] = {
      entries: Array.isArray(day.entries)
        ? day.entries
            .filter((e) => e && Number.isFinite(Number(e.std)))
            .map((e) => ({ ...e, std: roundStd(Number(e.std)) }))
        : [],
      manual: Number.isFinite(Number(day.manual)) ? roundStd(Number(day.manual)) : 0,
      note: typeof day.note === 'string' ? day.note : '',
      logged: true,
    };
  }
  return state;
}

export function exportJSON(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text, now = new Date()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Paceglass backup.');
  }
  return migrate(data, now);
}

// ---------- reading ----------

export function getDay(state, key) {
  return state.days[key] || null;
}

export function sumEntries(day) {
  return day ? day.entries.reduce((n, e) => n + e.std, 0) : 0;
}

export function dayTotal(day) {
  if (!day) return 0;
  return Math.max(0, roundStd(sumEntries(day) + (day.manual || 0)));
}

export function isLogged(day) {
  return !!(day && day.logged);
}

export function isAlcoholFree(day) {
  return isLogged(day) && dayTotal(day) === 0;
}

// ---------- writing (mutate and return state) ----------

function ensureDay(state, key) {
  if (!state.days[key]) state.days[key] = { entries: [], manual: 0, note: '', logged: true };
  return state.days[key];
}

let idCounter = 0;
function newId(now) {
  idCounter = (idCounter + 1) % 1000;
  return `${now.getTime().toString(36)}${idCounter.toString(36)}`;
}

export function addEntry(state, key, { label, std, presetId }, now = new Date()) {
  const day = ensureDay(state, key);
  const entry = { id: newId(now), t: now.toISOString(), label, std: roundStd(std) };
  if (presetId) entry.presetId = presetId;
  day.entries.push(entry);
  return entry;
}

export function removeEntry(state, key, id) {
  const day = state.days[key];
  if (!day) return null;
  const i = day.entries.findIndex((e) => e.id === id);
  if (i === -1) return null;
  return day.entries.splice(i, 1)[0];
}

/** Set a day's total from the calendar. Logged drinks are kept; the difference goes in `manual`. */
export function setDayTotal(state, key, total) {
  const day = ensureDay(state, key);
  const t = Math.max(0, roundStd(Number(total) || 0));
  day.manual = roundStd(t - sumEntries(day));
  return day;
}

export function markAlcoholFree(state, key) {
  const day = ensureDay(state, key);
  day.entries = [];
  day.manual = 0;
  return day;
}

export function setNote(state, key, note) {
  ensureDay(state, key).note = String(note || '').slice(0, 500);
}

export function clearDay(state, key) {
  delete state.days[key];
}

export function updateSettings(state, patch) {
  state.settings = { ...state.settings, ...patch };
  return state.settings;
}
