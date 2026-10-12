// Paceglass app: renders the four screens and wires up interactions.
// State lives in store.js; numbers come from stats.js; plans from plan.js; messages from insights.js.

import {
  addDays, daysBetween, formatDay, formatMonth, formatShortDay, formatTime, fromKey,
  monthGrid, startOfWeek, toKey, todayKey, weekdayLetters,
} from './dates.js';
import { DRINK_ICON_IDS, PRESETS, defaultDrinks, guessIcon, moveItem, standardDrinks } from './drinks.js';
import { DRINK_ICONS, drinkIconSVG } from './drink-icons.js';
import { glassSVG, setGlassLevel } from './glass.js';
import {
  CRAVING_TIPS, CUTBACK, MILD_WITHDRAWAL_SIGNS, PHASES, PLAN_SAFETY_TEXT, SAFETY_TEXT, SUPPORT,
  URGENT_WITHDRAWAL_SIGNS, needsWithdrawalCaution, paceNote, phaseForHours, phaseIndex,
  planStageFor, shouldSuggestPlan, todayMessage,
} from './insights.js';
import { glassLimitOn, limitsOn } from './limits.js';
import {
  PACES, buildPlan, isHeavy, planEnd, planPosition, recordCheckin, repeatPreviousStep, slowDown,
} from './plan.js';
import {
  STORAGE_KEY, addEntry, clearDay, createState, dayTotal, exportJSON, hasAnyData, hasStoredState, importJSON,
  isLogged, load, markAlcoholFree, migrate, newerCopy, removeEntry, removeStored, save, setDayTotal, setNote,
  updateSettings, userStorageKey,
} from './store.js';
import { cloudEnabled, friendlyError, getBackend } from './cloud.js';
import { isCodeShape, normaliseCode } from './codes.js';
import {
  currentAfStreak, hoursAlcoholFree, longestAfStreak, missingDays, monthSummary, planProgress,
  recentWeeks, savings, summariseRange, weekSummary,
} from './stats.js';

// ---------------------------------------------------------------- state

let state = createState();
const ui = {
  tab: 'today',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  editingDay: null,
  onboardStep: 0,
  deleteArmed: false,
  endPlanArmed: false,
  planDraft: null,
  editingDrinks: false,
  resetDrinksArmed: false,
  suppressClickUntil: 0,
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const money = (n) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const s = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const shortDate = (key) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(fromKey(key));

// Signed-in session when the cloud is set up (see js/cloud.js). In local-only mode user is null.
const session = {
  backend: null,
  user: null, // { uid, email } of the code's hidden sign-in account
  wantCode: false,
  memberId: null, // the person; their log is saved under this
  name: '',
  storageKey: STORAGE_KEY,
  offline: false,
  sync: 'idle', // 'idle' | 'saving' | 'saved' | 'error' | 'offline'
  saveTimer: null,
  pending: null,
};

/** Save on this device, and to the person's account when signed in. */
function persist() {
  if (!save(state, undefined, session.storageKey)) toast('Couldn\'t save on this device. Check storage isn\'t full or blocked.');
  scheduleCloudSave();
}

function commit() {
  persist();
  render();
}

function today() { return todayKey(); }

function glassRef(key = today()) { return glassLimitOn(state, key); }

function dayKind(key, t = today()) {
  if (daysBetween(t, key) > 0) return 'future';
  const day = state.days[key];
  if (!isLogged(day)) return 'empty';
  const total = dayTotal(day);
  if (total === 0) return 'af';
  return total > glassRef(key) ? 'over' : 'drink';
}

function dayLabel(key) {
  const kind = dayKind(key);
  const total = dayTotal(state.days[key]);
  const when = formatShortDay(key);
  if (kind === 'future') return `${when}, upcoming`;
  if (kind === 'empty') return `${when}, not filled in`;
  if (kind === 'af') return `${when}, alcohol-free`;
  return `${when}, ${fmt(total)} standard ${s(total, 'drink')}${kind === 'over' ? ', over the limit' : ''}`;
}

function glassForDay(key, opts = {}) {
  const total = dayTotal(state.days[key]);
  return glassSVG({ level: total / glassRef(key), kind: dayKind(key), ...opts });
}

/** "My drinks": the person's own list, starting from the defaults until they edit it. */
function myDrinks() {
  const d = state.settings.drinks;
  return Array.isArray(d) && d.length ? d : defaultDrinks(state.settings.customPresets || []);
}

function setMyDrinks(list) {
  updateSettings(state, { drinks: list });
}

// Kept for older code paths: everything that lists drinks uses the person's list.
const allPresets = myDrinks;

function selectedPreset() {
  const list = myDrinks();
  return list.find((p) => p.id === state.settings.lastPresetId) || list[0];
}

const pencilIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>';
const gripIcon = '<svg class="grip" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';

function drinkChipInner(p) {
  return `${drinkIconSVG(p.icon || guessIcon(p), { size: 28 })}<span class="chip-text"><b>${esc(p.label)}</b><span>${fmt(p.std)} std</span></span>`;
}

function drinksSection(preset) {
  const list = myDrinks();
  if (ui.editingDrinks) {
    return `
    <section class="block drinks-block">
      <div class="block-head">
        <h2>My drinks</h2>
        <button class="btn btn-sm btn-primary" type="button" data-action="drinks-edit" aria-pressed="true">Done</button>
      </div>
      <p class="tiny">Tap a drink to change it. Hold and drag to move it. Tap × to remove it.</p>
      <div class="chip-grid editing" role="list" aria-label="My drinks, in order">
        ${list.map((p) => `
          <div class="chip-wrap" role="listitem">
            <button class="chip" type="button" data-action="drink-edit" data-id="${esc(p.id)}" aria-label="Change ${esc(p.label)}">
              ${drinkChipInner(p)}${gripIcon}
            </button>
            ${list.length > 1 ? `<button class="chip-x" type="button" data-action="drink-remove" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.label)}">${xIcon(14)}</button>` : ''}
          </div>`).join('')}
        <div class="chip-wrap" role="listitem">
          <button class="chip add-chip" type="button" data-action="drink-new" aria-label="Add a drink">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
      <button class="link-btn reset-drinks" type="button" data-action="drinks-reset">${ui.resetDrinksArmed ? 'Tap again to go back to the standard list' : 'Go back to the standard list'}</button>
    </section>`;
  }
  return `
    <section class="block drinks-block">
      <div class="block-head">
        <h2>My drinks</h2>
        <button class="icon-btn icon-btn-sm" type="button" data-action="drinks-edit" aria-pressed="false" aria-label="Edit my drinks" title="Edit my drinks">${pencilIcon}</button>
      </div>
      <div class="chips" role="group" aria-label="Choose what you're drinking">
        ${list.map((p) => `
          <button class="chip" type="button" data-action="choose" data-id="${esc(p.id)}" aria-pressed="${p.id === preset.id}">
            ${drinkChipInner(p)}
          </button>`).join('')}
        <button class="chip" type="button" data-action="open-custom"><span class="chip-text"><b>Something else</b><span>Size and strength</span></span></button>
      </div>
    </section>`;
}

/** Built-in drink names read naturally in lower case ("a schooner"); the user's own names stay as typed. */
function drinkName(d) {
  const builtIn = PRESETS.some((p) => p.id === (d.presetId || d.id) && p.label === d.label);
  return builtIn ? d.label.toLowerCase() : d.label;
}

const articleFor = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const xIcon = (size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const closeBtn = (id) => `<button class="icon-btn" type="button" data-action="close-sheet" data-id="${id}" aria-label="Close">${xIcon(20)}</button>`;
const list = (items) => `<ul>${items.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>`;

function cautionBlock({ withPlanButton = false } = {}) {
  return `<div class="caution" role="note">
    <h3>Stopping after heavy drinking</h3>
    <p>${esc(SAFETY_TEXT)}</p>
    <p>National Alcohol and Other Drug Hotline: <a href="tel:1800250015">1800 250 015</a></p>
    ${withPlanButton ? '<button class="btn btn-sm btn-quiet" type="button" data-action="open-plan">Cut down gradually instead</button>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- render: Today

function renderToday() {
  const t = today();
  const day = state.days[t];
  const total = dayTotal(day);
  const preset = selectedPreset();
  const msg = todayMessage(state, t);
  const pace = paceNote(state, t);
  const missing = missingDays(state, t);
  const { weekStartsOn } = state.settings;
  const weekStart = startOfWeek(t, weekStartsOn);
  const letters = weekdayLetters(weekStartsOn);
  const entries = day?.entries || [];
  const manual = day?.manual || 0;
  const ref = glassRef(t);
  const lim = limitsOn(state, t);

  $('#view-today').innerHTML = `
    <header class="page-head">
      <span class="badge">${esc(formatDay(t))}</span>
      <h1 id="today-title">Today</h1>
    </header>

    ${needsWithdrawalCaution(state) ? cautionBlock({ withPlanButton: !state.settings.plan }) : ''}
    ${checkinCard(t)}
    ${!needsWithdrawalCaution(state) && shouldSuggestPlan(state) ? suggestPlanCard() : ''}

    ${missing.length ? `
      <div class="notice">
        <span>${missing.length === 1 ? `${esc(formatShortDay(missing[0]))} isn't filled in yet.` : `${missing.length} recent days aren't filled in yet.`}</span>
        <button class="btn btn-sm btn-quiet" type="button" data-action="goto-missing" data-key="${missing[0]}">Fill in</button>
      </div>` : ''}

    <section class="card hero-card">
      <button class="pour" type="button" data-action="pour" aria-describedby="pour-label">
        ${glassSVG({ level: total / ref, kind: total > ref ? 'over' : 'drink' })}
        <span class="pour-count"><span class="n num" id="today-total">${fmt(total)}</span><span class="u">standard ${s(total, 'drink')} today</span></span>
        <span class="ripple"></span>
      </button>
      <p class="pour-label" id="pour-label">Tap the glass to add ${esc(articleFor(preset.label))} ${esc(drinkName(preset))}
        <span>${fmt(preset.std)} standard ${s(preset.std, 'drink')}${lim.daily > 0 ? `. Today's limit is ${lim.daily}.` : ''}</span></p>
      <p class="pace" id="pace">${esc(pace || '')}</p>
      <p class="message ${msg.tone}" aria-live="polite" id="today-msg">${esc(msg.text)}</p>
    </section>

    ${drinksSection(preset)}

    <section class="card block">
      <h2>Today's drinks</h2>
      ${entries.length || manual ? `
        <ul class="log">
          ${entries.slice().reverse().map((e) => `
            <li>
              <time datetime="${esc(e.t)}">${esc(formatTime(e.t))}</time>
              <span>${esc(e.label)}</span>
              <span class="std">${fmt(e.std)}</span>
              <button class="remove" type="button" data-action="remove-entry" data-key="${t}" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.label)} at ${esc(formatTime(e.t))}">${xIcon()}</button>
            </li>`).join('')}
          ${manual ? `<li><time></time><span>Changed by hand</span><span class="std">${manual > 0 ? '+' : ''}${fmt(manual)}</span><span></span></li>` : ''}
        </ul>` : day ? `
        <p class="muted">Today is marked alcohol-free.</p>` : `
        <p class="muted">${lim.fromPlan && lim.afDays === 0
          ? 'Nothing yet. Log each drink as you have it. While you\'re stepping down from heavy drinking, keep each day steady: a sudden alcohol-free day can bring on withdrawal.'
          : 'Nothing yet. If today stays alcohol-free, mark it so it counts towards your streak.'}</p>
        <button class="btn btn-sm btn-quiet" type="button" data-action="mark-af" data-key="${t}">Mark today alcohol-free</button>`}
    </section>

    ${state.settings.plan ? planCard(t) : ''}

    <section class="card block">
      <h2>This week</h2>
      <div class="week-strip">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const k = addDays(weekStart, i);
          return `<button type="button" class="d ${k === t ? 'is-today' : ''}" data-action="edit-day" data-key="${k}" ${daysBetween(t, k) > 0 ? 'disabled' : ''} aria-label="${esc(dayLabel(k))}">
            ${glassForDay(k)}<span>${letters[i]}</span></button>`;
        }).join('')}
      </div>
      ${state.settings.plan ? '' : weekMeter(t)}
    </section>
  `;
}

function weekMeter(t) {
  const week = weekSummary(state, t, t);
  const { goalMode, weeklyLimit, afDaysPerWeek } = state.settings;
  if (goalMode !== 'cutback') {
    return `<div class="week-line"><span><b class="num">${week.afDays}</b> alcohol-free ${s(week.afDays, 'day')} this week</span>
      <span><b class="num">${currentAfStreak(state, t)}</b> in a row</span></div>`;
  }
  return `
    <div class="meter ${week.total > weeklyLimit ? 'over' : ''}" role="img" aria-label="${fmt(week.total)} of ${weeklyLimit} standard drinks this week">
      <i style="width:${Math.min(100, weeklyLimit ? (week.total / weeklyLimit) * 100 : 0)}%"></i>
    </div>
    <div class="week-line"><span><b class="num">${fmt(week.total)}</b> of ${weeklyLimit} for the week</span>
      <span><b class="num">${week.afDays}</b> of ${afDaysPerWeek} alcohol-free ${s(afDaysPerWeek, 'day')}</span></div>`;
}

function afDaysText(n) {
  if (n === 0) return 'No alcohol-free days yet: keep each day steady.';
  if (n >= 7) return 'This is an alcohol-free week.';
  return `Aim for ${n} alcohol-free ${s(n, 'day')} this week.`;
}

function planCard(t) {
  const plan = state.settings.plan;
  const pos = planPosition(plan, t);
  if (!pos) return '';
  const step = pos.step;
  if (pos.status === 'upcoming') {
    return `<section class="card plan-card">
      <span class="badge teal">Plan starts ${esc(formatShortDay(plan.startDate))}</span>
      <h2>First step: up to ${step.weekly} a week</h2>
      <p class="muted">No more than ${step.daily} on any day.</p>
      <button class="btn btn-sm btn-quiet" type="button" data-action="goto-insights">See the whole plan</button>
    </section>`;
  }
  const done = summariseRange(state, step.start, addDays(step.start, 6), t);
  const pct = step.weekly ? Math.min(100, (done.total / step.weekly) * 100) : (done.total > 0 ? 100 : 0);
  const daysLeft = Math.max(0, 6 - pos.dayInStep);
  return `<section class="card plan-card">
    <div class="plan-top">
      <span class="badge teal">${pos.status === 'complete' ? 'Plan complete' : `Step ${pos.index + 1} of ${plan.steps.length}`}</span>
      <button class="link-btn" type="button" data-action="goto-insights">See plan</button>
    </div>
    <h2>${step.weekly === 0 ? 'Alcohol-free this week' : `Up to ${step.weekly} this ${pos.status === 'complete' ? 'week' : 'step'}`}</h2>
    <p class="muted">${step.daily > 0 ? `No more than ${step.daily} on any day. ` : ''}${esc(afDaysText(step.afDays))}</p>
    <div class="meter ${done.total > step.weekly ? 'over' : ''}" role="img" aria-label="${fmt(done.total)} of ${step.weekly} so far">
      <i style="width:${pct}%"></i>
    </div>
    <div class="week-line"><span><b class="num">${fmt(done.total)}</b> of ${step.weekly} so far</span>
      <span>${pos.status === 'complete' ? 'Keep it steady' : daysLeft === 0 ? 'Last day of this step' : `${daysLeft} ${s(daysLeft, 'day')} left in this step`}</span></div>
    <button class="btn btn-sm btn-quiet" type="button" data-action="open-symptoms">I'm getting withdrawal symptoms</button>
  </section>`;
}

/** At the start of a new step, look back at the last one and offer to repeat it if it was hard. */
function checkinCard(t) {
  const plan = state.settings.plan;
  if (!plan) return '';
  const pos = planPosition(plan, t);
  if (!pos || pos.status !== 'active' || pos.index === 0 || pos.dayInStep > 2) return '';
  if (plan.checkins?.[pos.index]) return '';
  const prog = planProgress(state, t);
  const prev = prog.steps[pos.index - 1];
  const cur = prog.steps[pos.index];
  if (!prev.actual || prev.actual.loggedDays < 4) {
    return `<section class="card checkin">
      <h2>How did the last step go?</h2>
      <p>Only ${prev.actual?.loggedDays || 0} of last step's 7 days are filled in. Fill in the rest so the plan can keep up with you.</p>
      <div class="btn-row">
        <button class="btn btn-sm btn-primary" type="button" data-action="goto-missing" data-key="${prev.start}">Fill in days</button>
        <button class="btn btn-sm btn-plain" type="button" data-action="checkin" data-value="skipped" data-i="${pos.index}">Not now</button>
      </div>
    </section>`;
  }
  if (prev.met) {
    return `<section class="card checkin good">
      <h2>Step ${pos.index} done</h2>
      <p>${fmt(prev.actual.total)} of the ${prev.weekly} planned. This step comes down to ${cur.weekly}${cur.daily ? `, with no more than ${cur.daily} on any day` : ''}.</p>
      <button class="btn btn-sm btn-primary" type="button" data-action="checkin" data-value="kept" data-i="${pos.index}">Got it</button>
    </section>`;
  }
  return `<section class="card checkin">
    <h2>Last step was harder</h2>
    <p>You had ${fmt(prev.actual.total)}, over the ${prev.weekly} planned. That happens. You can repeat that step for another week before coming down to ${cur.weekly}, or carry on with the plan.</p>
    <div class="btn-row">
      <button class="btn btn-sm btn-primary" type="button" data-action="repeat-step" data-i="${pos.index}">Repeat that step</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="checkin" data-value="kept" data-i="${pos.index}">Carry on</button>
    </div>
  </section>`;
}

function suggestPlanCard() {
  const { baselinePerWeek, weeklyLimit, goalMode } = state.settings;
  const to = goalMode === 'cutback' ? weeklyLimit : 0;
  return `<section class="card suggest">
    <h2>Make it a step at a time</h2>
    <p>Going from ${baselinePerWeek} a week to ${to === 0 ? 'none' : to} in one go is a big jump. A step-down plan brings it down a little each week, which is easier and safer.</p>
    <button class="btn btn-sm btn-primary" type="button" data-action="open-plan">Build a step-down plan</button>
  </section>`;
}

// ---------------------------------------------------------------- render: Calendar

function renderCalendar() {
  const t = today();
  const { calYear: y, calMonth: m } = ui;
  const weeks = monthGrid(y, m, state.settings.weekStartsOn);
  const sum = monthSummary(state, y, m, t);
  const isCurrentMonth = y === new Date().getFullYear() && m === new Date().getMonth();

  $('#view-calendar').innerHTML = `
    <section class="card cal-card">
      <div class="month-nav">
        <button class="icon-btn" type="button" data-action="month" data-dir="-1" aria-label="Previous month">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h1 id="calendar-title">${esc(formatMonth(y, m))}</h1>
        <button class="icon-btn" type="button" data-action="month" data-dir="1" aria-label="Next month" ${isCurrentMonth ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div class="cal" role="grid" aria-labelledby="calendar-title">
        ${weekdayLetters(state.settings.weekStartsOn).map((l) => `<div class="dow" aria-hidden="true">${l}</div>`).join('')}
        ${weeks.flat().map((k) => {
          if (!k) return '<div aria-hidden="true"></div>';
          const future = daysBetween(t, k) > 0;
          const kind = dayKind(k, t);
          return `<button class="cell ${k === t ? 'is-today' : ''}" type="button" data-action="edit-day" data-key="${k}"
            ${future ? 'disabled' : ''} aria-label="${esc(dayLabel(k))}">
            <span class="date" aria-hidden="true">${fromKey(k).getDate()}</span>
            ${glassForDay(k)}
            <span class="amt" aria-hidden="true">${kind === 'drink' || kind === 'over' ? fmt(dayTotal(state.days[k])) : ''}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="legend" aria-label="Key">
        <span>${glassSVG({ kind: 'af' })} Alcohol-free</span>
        <span>${glassSVG({ kind: 'drink', level: 0.6 })} Within the day's limit</span>
        <span>${glassSVG({ kind: 'over', level: 1 })} Over it</span>
        <span>${glassSVG({ kind: 'empty' })} Not filled in</span>
      </div>
    </section>

    <div class="tiles">
      <div class="tile"><b class="num">${fmt(sum.total)}</b><span>standard drinks</span></div>
      <div class="tile"><b class="num">${sum.afDays}</b><span>alcohol-free ${s(sum.afDays, 'day')}</span></div>
      <div class="tile"><b class="num">${sum.overDays}</b><span>${s(sum.overDays, 'day')} over the limit</span></div>
      <div class="tile"><b class="num">${sum.loggedDays}</b><span>${s(sum.loggedDays, 'day')} filled in</span></div>
    </div>
    <p class="tiny">Tap any day to fill it in or change it.</p>
  `;
}

// ---------------------------------------------------------------- render: Insights

function phaseWhen(p, i) {
  const next = PHASES[i + 1];
  const d = (h) => Math.round(h / 24);
  if (!next) return `${d(p.fromHours)}+ days`;
  if (p.fromHours === 0) return 'First 24 hours';
  return `Days ${d(p.fromHours) + 1} to ${d(next.fromHours)}`;
}

function gainsHard(gains, hard) {
  return `<div class="gains"><h4>What you might notice</h4>${list(gains)}</div>
    <div class="hard"><h4>What might feel hard</h4>${list(hard)}</div>`;
}

function renderInsights() {
  const t = today();
  const { goalMode, baselinePerWeek, weeklyLimit, plan } = state.settings;
  const hours = hoursAlcoholFree(state);
  const phase = phaseForHours(hours);
  const pi = phaseIndex(phase.id);
  const streak = currentAfStreak(state, t);
  const best = longestAfStreak(state);
  const sv = savings(state, t);
  const days = Math.floor(hours / 24);
  const stretchN = hours < 24 ? Math.floor(hours) : days;
  const stretchUnit = hours < 24 ? s(stretchN, 'hour') : s(stretchN, 'day');

  $('#view-insights').innerHTML = `
    <header class="page-head">
      <span class="badge">Insights</span>
      <h1 id="insights-title">What's changing</h1>
      <p class="lede">The gains you might notice, and what might feel hard right now.</p>
    </header>

    ${needsWithdrawalCaution(state) ? cautionBlock({ withPlanButton: !plan }) : ''}

    ${plan ? planInsights(t) : ''}

    <div class="tiles">
      <div class="tile"><b class="num">${fmt(Math.max(0, sv.drinks))}</b><span>fewer drinks than before</span></div>
      <div class="tile"><b class="num">${money(Math.max(0, sv.dollars))}</b><span>not spent on alcohol</span></div>
      <div class="tile"><b class="num">${Math.max(0, sv.kilojoules).toLocaleString('en-AU')}</b><span>kilojoules not consumed</span></div>
      <div class="tile"><b class="num">${streak}</b><span>alcohol-free days in a row</span></div>
    </div>
    <p class="tiny">Compared with your usual ${baselinePerWeek} a week, over the ${sv.days} ${s(sv.days, 'day')} you've filled in since you started. Kilojoules are from the alcohol alone.</p>

    ${plan ? '' : `
    <section class="card block">
      <h2>Week by week</h2>
      <div class="chart" id="week-chart">${weekChart(recentWeeks(state, t, 8), goalMode === 'cutback' ? weeklyLimit : null, baselinePerWeek)}</div>
      <p class="chart-readout" id="chart-readout" aria-live="polite">${esc(weekReadout(recentWeeks(state, t, 8).at(-1)))}</p>
    </section>`}

    ${goalMode === 'cutback' && !plan ? `
    <section class="card block">
      <h2>Cutting back</h2>
      <div class="phase-body">${gainsHard(CUTBACK.gains, CUTBACK.hard)}</div>
      ${shouldSuggestPlan(state) ? '' : '<button class="btn btn-sm btn-quiet" type="button" data-action="open-plan">Build a step-down plan</button>'}
    </section>` : ''}

    <section class="card block">
      ${plan && hours < 24 ? '' : `<div class="stretch">
        <span class="big num">${stretchN}</span>
        <span class="lbl">${stretchUnit} alcohol-free</span>
        <span class="muted small">${dayTotal(state.days[t]) > 0
          ? `You've had a drink today, so this restarts. Your longest run of alcohol-free days is ${best}.`
          : `Since your last logged drink. Your longest run of alcohol-free days is ${best}.`}</span>
      </div>`}
      <h2>Alcohol-free stretches</h2>
      <p class="muted small">What tends to happen the longer you go without a drink. Tap a stage to read it.</p>
      <ol class="timeline">
        ${PHASES.map((p, i) => `
          <li class="${i < pi ? 'done' : i === pi ? 'now' : ''}">
            <details ${i === pi && !plan ? 'open' : ''}>
              <summary><span class="t">${esc(p.title)}</span><span class="when">${esc(phaseWhen(p, i))}</span></summary>
              <div class="phase-body">
                ${gainsHard(p.gains, p.hard)}
                ${p.safety ? '<p class="tiny">If you\'ve been drinking heavily, withdrawal symptoms such as shaking, sweating or confusion can peak around now. Get medical help, or call 000 in an emergency.</p>' : ''}
              </div>
            </details>
          </li>`).join('')}
      </ol>
    </section>

    <section class="card block">
      <h2>Support</h2>
      <ul class="list-plain support">
        ${SUPPORT.map((x) => `<li><div><div class="name">${esc(x.name)}</div><div class="detail">${esc(x.detail)}</div></div>
          ${x.phone ? `<a class="btn btn-sm btn-quiet" href="tel:${x.phone.replace(/\s/g, '')}">${esc(x.phone)}</a>` : `<a class="btn btn-sm btn-quiet" href="${esc(x.url)}" target="_blank" rel="noopener">Open</a>`}</li>`).join('')}
      </ul>
      <button class="btn btn-quiet btn-block" type="button" data-action="open-craving">Ride out a craving</button>
      <p class="fineprint">Paceglass offers general information, not medical advice. If you're worried about your drinking or how you feel, talk to your GP.</p>
    </section>
  `;
}

function planInsights(t) {
  const prog = planProgress(state, t);
  const { plan, pos } = prog;
  const stage = planStageFor(plan, pos.index);
  return `
    <section class="card block plan-insights">
      <div class="plan-top">
        <span class="badge teal">${pos.status === 'upcoming' ? `Starts ${esc(formatShortDay(plan.startDate))}` : pos.status === 'complete' ? 'Plan complete' : `Step ${pos.index + 1} of ${plan.steps.length}`}</span>
        <span class="tiny">${PACES[plan.pace].label} pace</span>
      </div>
      <h2>Your step-down plan</h2>
      <p class="muted small">From ${plan.currentPerWeek} a week to ${plan.targetPerWeek === 0 ? 'alcohol-free' : `${plan.targetPerWeek} a week`}, finishing ${esc(formatShortDay(planEnd(plan)))}.</p>
      <div class="chart" id="plan-chart">${planChart(prog)}</div>
      <p class="chart-readout" id="plan-readout" aria-live="polite">${esc(stepReadout(prog.steps[pos.index]))}</p>

      <div class="stage">
        <h3>${esc(stage.title)}</h3>
        <p class="tiny">${esc(stage.when)}</p>
        <div class="phase-body">${gainsHard(stage.gains, stage.hard)}</div>
      </div>

      <details class="steps-detail">
        <summary>All ${plan.steps.length} steps</summary>
        <ol class="steps">
          ${prog.steps.map((st) => `
            <li class="${st.status}${st.index === pos.index ? ' now' : ''}">
              <span class="sn">${st.index + 1}</span>
              <span class="sd">${esc(shortDate(st.start))} to ${esc(shortDate(st.end))}</span>
              <span class="sl">${st.weekly === 0 ? 'Alcohol-free' : `${st.weekly} a week, ${st.daily} a day${st.afDays ? `, ${st.afDays} AF` : ''}`}</span>
              <span class="sa">${st.actual && st.actual.loggedDays ? `${fmt(st.actual.total)} ${st.met ? '✓' : ''}` : ''}</span>
            </li>`).join('')}
        </ol>
      </details>

      <div class="btn-row">
        <button class="btn btn-sm btn-quiet" type="button" data-action="open-symptoms">I'm getting withdrawal symptoms</button>
        <button class="btn btn-sm btn-plain" type="button" data-action="open-plan">Change plan</button>
      </div>
    </section>`;
}

function stepReadout(st) {
  if (!st) return '';
  const label = `Step ${st.index + 1}, ${shortDate(st.start)} to ${shortDate(st.end)}`;
  const planned = st.weekly === 0 ? 'planned alcohol-free' : `planned up to ${st.weekly}`;
  if (!st.actual || !st.actual.loggedDays) return `${label}: ${planned}.`;
  return `${label}: ${fmt(st.actual.total)} so far, ${planned}. ${st.actual.loggedDays} of 7 days filled in.`;
}

function weekReadout(w) {
  if (!w) return '';
  if (!w.loggedDays) return `Week of ${formatShortDay(w.start)}: nothing filled in.`;
  return `Week of ${formatShortDay(w.start)}: ${fmt(w.total)} standard ${s(w.total, 'drink')}, ${w.afDays} alcohol-free ${s(w.afDays, 'day')}, ${w.loggedDays} of 7 days filled in.`;
}

function niceTicks(max) {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepV = [1, 2, 5, 10].map((mm) => mm * mag).find((v) => v >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max; v += stepV) out.push(Math.round(v * 10) / 10);
  return out;
}

function roundedBar(x, base, top, w) {
  const h = base - top;
  if (h <= 0) return '';
  const r = Math.min(4, h);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

function weekChart(weeks, limit, baseline) {
  const W = 340, H = 170, padL = 30, padR = 64, padT = 10, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB, base = padT + ih;
  const max = Math.max(4, ...weeks.map((w) => w.total), limit || 0, baseline || 0) * 1.1;
  const y = (v) => base - (v / max) * ih;
  const step = iw / weeks.length;
  const bw = Math.min(26, step - 8);
  const bars = weeks.map((w, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const over = limit != null && w.total > limit;
    const label = i % 2 === (weeks.length - 1) % 2 ? `<text class="axis-lbl" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(shortDate(w.start))}</text>` : '';
    const path = roundedBar(x, base, y(w.total), bw);
    return `<g class="bar-group ${i === weeks.length - 1 ? 'active' : ''}" tabindex="0" role="button" data-action="chart-week" data-i="${i}" aria-label="${esc(weekReadout(w))}">
      ${path ? `<path class="bar ${over ? 'over' : ''}" d="${path}"/>` : ''}
      <rect class="bar-hit" x="${padL + i * step}" y="${padT}" width="${step}" height="${ih + padB}"/>${label}</g>`;
  }).join('');
  const ref = (v, name) => v == null ? '' : `<line class="ref" x1="${padL}" x2="${padL + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="ref-lbl" x="${padL + iw + 6}" y="${y(v) + 4}">${esc(name)} ${fmt(v)}</text>`;
  const tooClose = limit != null && baseline != null && Math.abs(y(limit) - y(baseline)) < 14;
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Standard drinks per week for the last 8 weeks">
    ${niceTicks(max).map((v) => `<line class="grid" x1="${padL}" x2="${padL + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis-lbl" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${bars}${ref(limit, 'Limit')}${tooClose ? '' : ref(baseline, 'Before')}
  </svg>`;
}

/** Plan chart: planned level per step as a pale bar, what actually happened as a solid bar inside it. */
function planChart(prog) {
  const { steps, plan } = prog;
  const W = 340, H = 170, padL = 30, padR = 8, padT = 10, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB, base = padT + ih;
  const max = Math.max(4, plan.currentPerWeek, ...steps.map((st) => st.actual?.total || 0)) * 1.08;
  const y = (v) => base - (v / max) * ih;
  const step = iw / steps.length;
  const bw = Math.max(4, Math.min(22, step - 4));
  const every = Math.ceil(steps.length / 6);
  const bars = steps.map((st, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const planned = roundedBar(x, base, y(st.weekly), bw);
    const act = st.actual && st.actual.loggedDays ? roundedBar(x + bw * 0.2, base, y(st.actual.total), bw * 0.6) : '';
    const over = st.actual && st.actual.total > st.weekly;
    const label = i % every === 0 ? `<text class="axis-lbl" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${i + 1}</text>` : '';
    return `<g class="bar-group ${st.status === 'current' ? 'active' : ''}" tabindex="0" role="button" data-action="chart-step" data-i="${i}" aria-label="${esc(stepReadout(st))}">
      ${planned ? `<path class="bar planned" d="${planned}"/>` : `<rect class="bar planned" x="${x}" y="${base - 2}" width="${bw}" height="2"/>`}
      ${act ? `<path class="bar ${over ? 'over' : 'actual'}" d="${act}"/>` : ''}
      <rect class="bar-hit" x="${padL + i * step}" y="${padT}" width="${step}" height="${ih + padB}"/>${label}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Planned and actual standard drinks for each step of the plan">
    ${niceTicks(max).map((v) => `<line class="grid" x1="${padL}" x2="${padL + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis-lbl" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${bars}
  </svg>
  <div class="chart-key"><span><i class="k planned"></i>Planned</span><span><i class="k actual"></i>What you had</span><span><i class="k over"></i>Over the plan</span></div>`;
}

// ---------------------------------------------------------------- render: Settings

function renderSettings() {
  const st = state.settings;
  const plan = st.plan;
  const pos = plan ? planPosition(plan, today()) : null;
  $('#view-settings').innerHTML = `
    <header class="page-head">
      <span class="badge">Settings</span>
      <h1 id="settings-title">Your goal and data</h1>
    </header>

    ${session.user ? `
    <section class="card block">
      <h2>Your account</h2>
      <p>Signed in${session.name ? ` as <b>${esc(session.name)}</b>` : ''} with your personal code.</p>
      <p class="small muted" id="sync-status">${esc(syncText())}</p>
      <div class="btn-row">
        <button class="btn btn-sm btn-quiet" type="button" data-action="sign-out">Sign out</button>
      </div>
    </section>` : cloudEnabled() ? `
    <section class="card block">
      <h2>Your account</h2>
      <p>You're using Paceglass without signing in. Your log is kept on this device only.</p>
      <p class="small muted">If you have a personal code, sign in to back up your log and use it on other devices. What you've logged so far comes with you.</p>
      <button class="btn btn-sm btn-primary" type="button" data-action="guest-sign-in">Sign in with a code</button>
    </section>` : ''}

    <section class="card block">
      <h2>Step-down plan</h2>
      ${plan ? `
        <p>${pos.status === 'complete' ? 'Complete.' : pos.status === 'upcoming' ? `Starts ${esc(formatShortDay(plan.startDate))}.` : `Step ${pos.index + 1} of ${plan.steps.length}: up to ${pos.step.weekly} a week.`}
          From ${plan.currentPerWeek} to ${plan.targetPerWeek === 0 ? 'alcohol-free' : `${plan.targetPerWeek} a week`} by ${esc(formatShortDay(planEnd(plan)))}.</p>
        <div class="btn-row">
          <button class="btn btn-sm btn-quiet" type="button" data-action="open-plan">Change plan</button>
          <button class="btn btn-sm btn-danger" type="button" data-action="end-plan">${ui.endPlanArmed ? 'Tap again to end the plan' : 'End plan'}</button>
        </div>` : `
        <p class="muted small">Bring your drinking down a little each week, with limits that change as you go. Recommended if you drink a lot now.</p>
        <button class="btn btn-sm btn-primary" type="button" data-action="open-plan">Build a step-down plan</button>`}
    </section>

    <form class="card settings-group" id="settings-form" autocomplete="off">
      <fieldset class="field">
        <legend class="label">What are you aiming for?</legend>
        ${goalOptions(st.goalMode, 'goalMode')}
      </fieldset>

      <div class="field-row">
        <div class="field">
          <label for="baselinePerWeek">Usual drinks a week</label>
          <input class="input" id="baselinePerWeek" name="baselinePerWeek" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.baselinePerWeek)}">
          <span class="hint">Before you started</span>
        </div>
        <div class="field">
          <label for="costPerDrink">Cost per drink</label>
          <div class="input-affix" data-prefix="$"><input class="input" id="costPerDrink" name="costPerDrink" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(st.costPerDrink)}"></div>
          <span class="hint">Per standard drink</span>
        </div>
      </div>

      ${st.goalMode === 'cutback' && !plan ? `
      <div class="field-row three">
        <div class="field">
          <label for="weeklyLimit">Weekly limit</label>
          <input class="input" id="weeklyLimit" name="weeklyLimit" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.weeklyLimit)}">
        </div>
        <div class="field">
          <label for="dailyLimit">Daily limit</label>
          <input class="input" id="dailyLimit" name="dailyLimit" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.dailyLimit)}">
        </div>
        <div class="field">
          <label for="afDaysPerWeek">AF days</label>
          <input class="input" id="afDaysPerWeek" name="afDaysPerWeek" type="number" inputmode="numeric" min="0" max="7" step="1" value="${esc(st.afDaysPerWeek)}">
        </div>
      </div>
      <p class="hint">Australian guidelines: no more than 10 a week and no more than 4 on any day.</p>` : ''}
      ${plan ? '<p class="hint">Your limits come from your step-down plan and change each step.</p>' : ''}

      <div class="field">
        <label for="startDate">Start date</label>
        <input class="input" id="startDate" name="startDate" type="date" max="${today()}" value="${esc(st.startDate)}">
      </div>

      <div class="field">
        <label for="reasons">Why you're doing this</label>
        <textarea class="textarea" id="reasons" name="reasons" maxlength="600" placeholder="Better sleep. More patience with the kids. Saving for the trip.">${esc(st.reasons)}</textarea>
        <span class="hint">Shown back to you when you open the craving timer.</span>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="weekStartsOn">Weeks start on</label>
          <select class="select" id="weekStartsOn" name="weekStartsOn">
            <option value="1" ${st.weekStartsOn == 1 ? 'selected' : ''}>Monday</option>
            <option value="0" ${st.weekStartsOn == 0 ? 'selected' : ''}>Sunday</option>
          </select>
        </div>
        <div class="field">
          <label for="theme">Appearance</label>
          <select class="select" id="theme" name="theme">
            <option value="system" ${!st.theme || st.theme === 'system' ? 'selected' : ''}>Match device</option>
            <option value="light" ${st.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </div>
      </div>
    </form>

    <section class="card block">
      <h2>Your data</h2>
      <p class="muted small">${session.user
        ? 'Your log is saved to your account, so it\'s backed up and you can sign in on another device. Paceglass doesn\'t show it to anyone else, including admins. You can also save a copy as a file.'
        : 'Everything stays on this device. Nothing is sent anywhere. Save a backup now and then, especially before changing phones or clearing your browser.'}</p>
      <div class="btn-row">
        <button class="btn btn-sm btn-quiet" type="button" data-action="export">Save a backup</button>
        <label class="btn btn-sm btn-quiet" for="import-file">Restore a backup</label>
        <input id="import-file" type="file" accept="application/json,.json" class="visually-hidden">
      </div>
      <button class="btn btn-sm btn-danger" type="button" data-action="delete-all">${ui.deleteArmed ? 'Tap again to delete everything' : 'Delete all data'}</button>
    </section>

    <section class="block about">
      <h2>About</h2>
      <p class="small muted">A standard drink in Australia is 10 grams of alcohol. The Australian guidelines recommend no more than 10 standard drinks a week and no more than 4 on any one day to reduce the risk of harm.</p>
      <p class="fineprint">Paceglass is a prototype and offers general information, not medical advice. The pace note is not a blood alcohol estimate. Never use it to decide whether you're safe to drive. Version 0.5.0.</p>
      <a class="admin-link" href="admin.html">Admin console</a>
    </section>
  `;
}

function goalOptions(current, name) {
  const opts = [
    ['cutback', 'Cut back', 'Drink less, with limits or a step-down plan'],
    ['break', 'Take a break', 'A stretch alcohol-free, like a dry month'],
    ['stop', 'Stop drinking', 'Go alcohol-free for good'],
  ];
  return `<div class="segmented">${opts.map(([v, title, sub]) => `
    <label><input type="radio" name="${name}" value="${v}" ${current === v ? 'checked' : ''}><b>${title}</b><span>${sub}</span></label>`).join('')}</div>`;
}

// ---------------------------------------------------------------- sheets

function openSheet(id) {
  const d = document.getElementById(id);
  if (!d.open) d.showModal();
  return d;
}

function closeSheet(id) {
  const d = document.getElementById(id);
  if (d.open) d.close();
}

function sheetHead(id, titleId, title) {
  return `<div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-head"><h2 id="${titleId}">${esc(title)}</h2>${closeBtn(id)}</div>`;
}

function renderDaySheet() {
  const key = ui.editingDay;
  if (!key) return;
  const day = state.days[key];
  const total = dayTotal(day);
  const entries = day?.entries || [];
  const manual = day?.manual || 0;
  const lim = limitsOn(state, key);
  $('#sheet-day').innerHTML = `
    <div class="sheet-inner">
      ${sheetHead('sheet-day', 'day-title', key === today() ? 'Today' : formatShortDay(key))}
      <div class="stepper">
        <button type="button" data-action="day-step" data-step="-1" aria-label="One fewer">−</button>
        <div class="stepper-val">
          <label class="visually-hidden" for="day-total">Standard drinks</label>
          <input id="day-total" class="n num" type="number" inputmode="decimal" min="0" step="0.1" value="${isLogged(day) ? fmt(total) : ''}" placeholder="–">
          <span class="u">standard drinks${lim.daily > 0 ? `, limit ${lim.daily}` : ''}</span>
        </div>
        <button type="button" data-action="day-step" data-step="1" aria-label="One more">+</button>
      </div>

      <button class="btn ${isLogged(day) && total === 0 ? 'btn-primary' : 'btn-quiet'} btn-block" type="button" data-action="mark-af" data-key="${key}">
        ${isLogged(day) && total === 0 ? 'Alcohol-free day' : 'Mark as alcohol-free'}</button>

      <div class="block">
        <h3 class="small">Add a drink</h3>
        <div class="chips">
          ${myDrinks().map((p) => `<button class="chip" type="button" data-action="day-add" data-id="${esc(p.id)}">${drinkChipInner(p)}</button>`).join('')}
        </div>
      </div>

      ${entries.length || manual ? `
      <ul class="log">
        ${entries.map((e) => `<li><time>${esc(formatTime(e.t))}</time><span>${esc(e.label)}</span><span class="std">${fmt(e.std)}</span>
          <button class="remove" type="button" data-action="remove-entry" data-key="${key}" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.label)}">${xIcon()}</button></li>`).join('')}
        ${manual ? `<li><time></time><span>Changed by hand</span><span class="std">${manual > 0 ? '+' : ''}${fmt(manual)}</span><span></span></li>` : ''}
      </ul>` : ''}

      <div class="field">
        <label for="day-note">Note</label>
        <textarea class="textarea" id="day-note" maxlength="500" placeholder="How did the day go? What helped?">${esc(day?.note || '')}</textarea>
      </div>

      <div class="btn-row">
        ${isLogged(day) ? `<button class="btn btn-plain" type="button" data-action="clear-day" data-key="${key}">Clear this day</button>` : ''}
        <button class="btn btn-primary" type="button" data-action="close-sheet" data-id="sheet-day">Done</button>
      </div>
    </div>`;
}

/**
 * The drink sheet, used three ways:
 *  'oneoff' "Something else": log a drink that isn't in the list, optionally saving it
 *  'new'    the + tile in edit mode: add a drink to the list
 *  'edit'   tapping a drink in edit mode: change it, move it or remove it
 */
function renderCustomSheet(mode = 'oneoff', drink = null) {
  const d = drink || { label: '', volumeMl: 330, abv: 6, icon: '' };
  const icon = d.icon || guessIcon(d);
  const list = myDrinks();
  const idx = drink ? list.findIndex((x) => x.id === drink.id) : -1;
  const title = mode === 'edit' ? 'Change drink' : mode === 'new' ? 'Add a drink' : 'Something else';
  $('#sheet-custom').innerHTML = `
    <form class="sheet-inner" id="custom-form" data-mode="${mode}" data-id="${esc(drink?.id || '')}">
      ${sheetHead('sheet-custom', 'custom-title', title)}
      <fieldset class="field">
        <legend class="label">Icon</legend>
        <div class="icon-picker" data-touched="${drink ? 'true' : 'false'}">
          ${DRINK_ICONS.map((i) => `
            <label class="icon-choice">
              <input type="radio" name="icon" value="${i.id}" ${i.id === icon ? 'checked' : ''}>
              ${drinkIconSVG(i.id, { size: 32 })}
              <span>${esc(i.label)}</span>
            </label>`).join('')}
        </div>
      </fieldset>
      <div class="field">
        <label for="c-name">Name</label>
        <input class="input" id="c-name" name="name" placeholder="Craft IPA" maxlength="30" value="${esc(d.label)}">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="c-ml">Size (ml)</label>
          <input class="input" id="c-ml" name="ml" type="number" inputmode="decimal" min="1" step="1" value="${esc(d.volumeMl ?? '')}" required>
        </div>
        <div class="field">
          <label for="c-abv">Alcohol (%)</label>
          <input class="input" id="c-abv" name="abv" type="number" inputmode="decimal" min="0.1" max="80" step="0.1" value="${esc(d.abv ?? '')}" required>
        </div>
      </div>
      <p class="muted small">Check the label: Australian drinks show the alcohol percentage and the number of standard drinks.</p>
      <p>That's <span class="calc-result num" id="c-std">${fmt(standardDrinks(d.volumeMl, d.abv))}</span> standard drinks.</p>
      ${mode === 'oneoff' ? '<label class="check"><input type="checkbox" name="keep" checked> Save it to my drinks</label>' : ''}
      ${mode === 'edit' ? `
        <div class="btn-row move-row">
          <button class="btn btn-sm btn-quiet" type="button" data-action="drink-move" data-dir="-1" ${idx <= 0 ? 'disabled' : ''}>Move earlier</button>
          <button class="btn btn-sm btn-quiet" type="button" data-action="drink-move" data-dir="1" ${idx >= list.length - 1 ? 'disabled' : ''}>Move later</button>
        </div>` : ''}
      <div class="btn-row">
        ${mode === 'edit' && list.length > 1 ? `<button class="btn btn-danger" type="button" data-action="drink-remove" data-id="${esc(drink.id)}">Remove</button>` : ''}
        <button class="btn btn-primary" type="submit">${mode === 'edit' ? 'Save' : mode === 'new' ? 'Add to my drinks' : 'Add this drink'}</button>
      </div>
    </form>`;
}

function openDrinkSheet(mode, drink) {
  renderCustomSheet(mode, drink);
  openSheet('sheet-custom');
  if (mode !== 'edit') $('#c-name').focus();
}

/** Remove a drink from the list, with an undo. */
function removeDrink(id) {
  const list = myDrinks();
  if (list.length <= 1) return;
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) return;
  const removed = list[i];
  setMyDrinks(list.filter((x) => x.id !== id));
  commit();
  toast(`Removed ${removed.label}`, 'Undo', () => {
    const now = myDrinks().slice();
    now.splice(Math.min(i, now.length), 0, removed);
    setMyDrinks(now);
    commit();
  });
}

// ---- reordering "My drinks" by holding and dragging (touch) or dragging (mouse)

let drag = null;

function startDrag() {
  if (!drag) return;
  drag.active = true;
  drag.wrap.classList.add('dragging');
  document.body.classList.add('drag-active');
  if (navigator.vibrate) navigator.vibrate(10);
}

function endDrag(commitOrder) {
  if (!drag) return;
  clearTimeout(drag.timer);
  const wasActive = drag.active;
  drag.wrap.classList.remove('dragging');
  document.body.classList.remove('drag-active');
  if (wasActive && commitOrder) {
    const ids = [...document.querySelectorAll('.chip-grid.editing .chip[data-id]')].map((c) => c.dataset.id);
    const byId = new Map(myDrinks().map((x) => [x.id, x]));
    const reordered = ids.map((x) => byId.get(x)).filter(Boolean);
    if (reordered.length === byId.size) setMyDrinks(reordered);
    ui.suppressClickUntil = Date.now() + 400;
    commit();
  }
  drag = null;
}

document.addEventListener('pointerdown', (ev) => {
  const chip = ev.target.closest('.chip-grid.editing .chip[data-id]');
  if (!chip || ev.button > 0) return;
  drag = { chip, wrap: chip.closest('.chip-wrap'), x: ev.clientX, y: ev.clientY, id: ev.pointerId, mouse: ev.pointerType === 'mouse', active: false, timer: null };
  if (!drag.mouse) drag.timer = setTimeout(startDrag, 280); // hold, then drag
});

document.addEventListener('pointermove', (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  const moved = Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y);
  if (!drag.active) {
    if (drag.mouse && moved > 5) startDrag();
    else if (!drag.mouse && moved > 10) { endDrag(false); return; } // moved before the hold: not a drag
    if (!drag || !drag.active) return;
  }
  ev.preventDefault();
  const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.chip-grid.editing .chip-wrap');
  if (!over || over === drag.wrap || !over.querySelector('.chip[data-id]')) return;
  const wraps = [...drag.wrap.parentElement.children];
  if (wraps.indexOf(drag.wrap) < wraps.indexOf(over)) over.after(drag.wrap);
  else over.before(drag.wrap);
});

document.addEventListener('pointerup', (ev) => { if (drag && ev.pointerId === drag.id) endDrag(true); });
document.addEventListener('pointercancel', () => endDrag(false));
document.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.chip-grid.editing')) ev.preventDefault(); });

// ---- plan builder

function estimatedCurrentPerWeek() {
  const t = today();
  const r = summariseRange(state, addDays(t, -14), addDays(t, -1), t);
  if (r.loggedDays >= 7) return { value: Math.round((r.total / r.loggedDays) * 7), fromLog: true };
  return { value: Math.round(Number(state.settings.baselinePerWeek) || 0), fromLog: false };
}

function newPlanDraft() {
  const existing = state.settings.plan;
  const est = estimatedCurrentPerWeek();
  const target = existing ? existing.targetPerWeek : state.settings.goalMode === 'cutback' ? 10 : 0;
  return {
    currentPerWeek: existing ? Math.max(est.value, 0) || existing.currentPerWeek : est.value,
    fromLog: est.fromLog,
    targetChoice: target === 0 ? 'zero' : target === 10 ? 'guideline' : 'custom',
    customTarget: target || 14,
    afDaysTarget: existing ? Math.min(6, existing.afDaysTarget) : 2,
    pace: existing ? existing.pace : 'steady',
    startDate: today(),
  };
}

function draftTarget(d) {
  if (d.targetChoice === 'zero') return 0;
  if (d.targetChoice === 'guideline') return 10;
  return Math.max(0, Math.round(Number(d.customTarget) || 0));
}

function renderPlanSheet() {
  const d = ui.planDraft;
  const heavy = isHeavy(d.currentPerWeek);
  $('#sheet-plan').innerHTML = `
    <form class="sheet-inner" id="plan-form" autocomplete="off">
      ${sheetHead('sheet-plan', 'plan-title', state.settings.plan ? 'Change your plan' : 'Build a step-down plan')}
      <p class="muted small">Paceglass works out a week-by-week plan that brings your drinking down a little at a time. Each step has its own weekly and daily limit. You can change the plan whenever you need to.</p>

      <div class="field">
        <label for="pf-current">How many standard drinks in a usual week right now?</label>
        <input class="input" id="pf-current" name="currentPerWeek" type="number" inputmode="numeric" min="1" max="500" step="1" value="${esc(d.currentPerWeek)}">
        <span class="hint" id="pf-current-hint">${currentHint(d)}</span>
      </div>

      <fieldset class="field">
        <legend class="label">Where do you want to get to?</legend>
        <div class="segmented">
          <label><input type="radio" name="targetChoice" value="guideline" ${d.targetChoice === 'guideline' ? 'checked' : ''}><b>10 a week</b><span>The Australian guideline</span></label>
          <label><input type="radio" name="targetChoice" value="custom" ${d.targetChoice === 'custom' ? 'checked' : ''}><b>My own number</b><span>
            <input class="input input-inline" name="customTarget" type="number" inputmode="numeric" min="0" step="1" value="${esc(d.customTarget)}" aria-label="Target drinks a week"> a week</span></label>
          <label><input type="radio" name="targetChoice" value="zero" ${d.targetChoice === 'zero' ? 'checked' : ''}><b>Alcohol-free</b><span>Step down to none</span></label>
        </div>
      </fieldset>

      <div class="field" id="pf-af-field" ${d.targetChoice === 'zero' ? 'hidden' : ''}>
        <label for="pf-af">Alcohol-free days each week by the end</label>
        <select class="select" id="pf-af" name="afDaysTarget">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(d.afDaysTarget) === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <span class="hint">These are only added once you're down to about 4 a day.</span>
      </div>

      <fieldset class="field">
        <legend class="label">How quickly?</legend>
        <div class="segmented" id="pf-paces">${paceOptions(d, heavy)}</div>
      </fieldset>

      <div class="field">
        <label for="pf-start">Start on</label>
        <input class="input" id="pf-start" name="startDate" type="date" min="${today()}" value="${esc(d.startDate)}">
      </div>

      <div id="pf-caution">${heavy ? planCaution() : ''}</div>

      <div class="preview card" id="pf-preview">${planPreview(d)}</div>

      <div class="btn-row">
        <button class="btn btn-plain" type="button" data-action="close-sheet" data-id="sheet-plan">Cancel</button>
        <button class="btn btn-primary" type="submit">${state.settings.plan ? 'Use this plan' : 'Start this plan'}</button>
      </div>
    </form>`;
}

function currentHint(d) {
  const perDay = (Number(d.currentPerWeek) || 0) / 7;
  const base = `About ${fmt(perDay)} a day.`;
  return d.fromLog ? `${base} Worked out from what you've logged in the last two weeks.` : `${base} A rough guess is fine.`;
}

function paceOptions(d, heavy) {
  return Object.entries(PACES).map(([id, p]) => {
    const disabled = heavy && p.notForHeavy;
    return `<label class="${disabled ? 'disabled' : ''}"><input type="radio" name="pace" value="${id}" ${d.pace === id && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <b>${p.label}</b><span>${disabled ? 'Not recommended from heavy drinking' : p.detail}</span></label>`;
  }).join('');
}

function planCaution() {
  return `<div class="caution" role="note">
    <h3>Talk to your GP first</h3>
    <p>${esc(PLAN_SAFETY_TEXT)}</p>
    <p>National Alcohol and Other Drug Hotline: <a href="tel:1800250015">1800 250 015</a></p>
  </div>`;
}

function draftPlan(d) {
  return buildPlan({
    currentPerWeek: Number(d.currentPerWeek) || 0,
    targetPerWeek: draftTarget(d),
    pace: d.pace,
    afDaysTarget: Number(d.afDaysTarget) || 0,
    startDate: d.startDate || today(),
  });
}

function planPreview(d) {
  if (!(Number(d.currentPerWeek) > 0)) return '<p class="muted small">Enter how much you drink now to see your plan.</p>';
  const target = draftTarget(d);
  if (Number(d.currentPerWeek) <= target) {
    return `<p class="small">You're already at or under ${target} a week. You don't need a step-down plan. Set your limits in Settings instead.</p>`;
  }
  const plan = draftPlan(d);
  const n = plan.steps.length;
  const maxW = plan.currentPerWeek;
  return `
    <h3>${n} ${s(n, 'week')}, finishing ${esc(formatShortDay(planEnd(plan)))}</h3>
    <div class="mini-steps" aria-hidden="true">
      ${plan.steps.map((st) => `<i style="height:${Math.max(3, (st.weekly / maxW) * 100)}%"></i>`).join('')}
    </div>
    <ol class="steps compact">
      ${plan.steps.map((st, i) => `<li><span class="sn">${i + 1}</span><span class="sd">${esc(shortDate(st.start))}</span>
        <span class="sl">${st.weekly === 0 ? 'Alcohol-free' : `${st.weekly} a week, up to ${st.daily} a day${st.afDays ? `, ${st.afDays} AF ${s(st.afDays, 'day')}` : ''}`}</span></li>`).join('')}
    </ol>`;
}

function readPlanForm(f) {
  const d = ui.planDraft;
  const num = (v, fb) => { const x = parseFloat(v); return Number.isFinite(x) && x >= 0 ? x : fb; };
  d.currentPerWeek = num(f.currentPerWeek.value, 0);
  d.targetChoice = f.querySelector('input[name="targetChoice"]:checked')?.value || 'guideline';
  d.customTarget = num(f.customTarget.value, 0);
  d.afDaysTarget = num(f.afDaysTarget.value, 0);
  const pace = f.querySelector('input[name="pace"]:checked')?.value;
  if (pace) d.pace = pace;
  if (isHeavy(d.currentPerWeek) && PACES[d.pace].notForHeavy) d.pace = 'steady';
  d.startDate = f.startDate.value || today();
}

function refreshPlanForm(f) {
  const d = ui.planDraft;
  const heavy = isHeavy(d.currentPerWeek);
  $('#pf-current-hint').textContent = currentHint(d);
  $('#pf-af-field').hidden = d.targetChoice === 'zero';
  $('#pf-paces').innerHTML = paceOptions(d, heavy);
  $('#pf-caution').innerHTML = heavy ? planCaution() : '';
  $('#pf-preview').innerHTML = planPreview(d);
}

function openPlanBuilder() {
  ui.planDraft = newPlanDraft();
  renderPlanSheet();
  closeSheet('sheet-symptoms');
  openSheet('sheet-plan');
}

function renderSymptomsSheet() {
  const plan = state.settings.plan;
  const pos = plan ? planPosition(plan, today()) : null;
  const backTo = pos && pos.index > 0 ? plan.steps[pos.index - 1].weekly : plan?.currentPerWeek;
  $('#sheet-symptoms').innerHTML = `
    <div class="sheet-inner">
      ${sheetHead('sheet-symptoms', 'symptoms-title', 'Withdrawal symptoms')}
      <div class="urgent" role="alert">
        <h3>Call 000 now if you or someone with you has:</h3>
        ${list(URGENT_WITHDRAWAL_SIGNS)}
        <a class="btn btn-sm btn-urgent" href="tel:000">Call 000</a>
      </div>
      <div class="block">
        <h3>Milder symptoms</h3>
        ${list(MILD_WITHDRAWAL_SIGNS)}
        <p>These usually mean the plan is moving faster than your body can keep up with. The advice is to go back up to the last level that felt OK, hold there for a week, then come down more slowly, about 10% a week.</p>
      </div>
      ${plan && pos?.status === 'active' ? `
        <button class="btn btn-primary btn-block" type="button" data-action="slow-plan">Slow my plan down</button>
        <p class="tiny">This step goes back to ${backTo} a week for a week, then the plan continues at the gentle pace.</p>` : ''}
      <p class="small">Talk to your GP as well. They can help, and some people need medication to cut down safely. National Alcohol and Other Drug Hotline: <a href="tel:1800250015">1800 250 015</a>, free and 24/7.</p>
    </div>`;
}

// ---- craving timer

let cravingTimer = null;
const CRAVING_SECS = 15 * 60;
const RING_C = 2 * Math.PI * 100;

function renderCravingSheet() {
  const reasons = state.settings.reasons?.trim();
  $('#sheet-craving').innerHTML = `
    <div class="sheet-inner">
      ${sheetHead('sheet-craving', 'craving-title', 'Ride out a craving')}
      <p class="muted small">Cravings rise, peak and fade, usually within 15 to 30 minutes. Give this one 15 minutes before you decide anything.</p>
      <div class="craving-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true"><circle class="track" cx="110" cy="110" r="100"/>
          <circle class="prog" id="crave-prog" cx="110" cy="110" r="100" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg>
        <span class="time num" id="crave-time" role="timer" aria-live="off">15:00</span>
      </div>
      <p class="craving-tip" id="crave-tip" aria-live="polite">${esc(CRAVING_TIPS[0])}</p>
      <button class="btn btn-primary btn-block" type="button" data-action="crave-toggle" id="crave-btn">Start 15 minutes</button>
      ${reasons ? `<div><h3 class="small">Your reasons</h3><p class="reasons-quote">${esc(reasons)}</p></div>` : ''}
      <p class="small muted">Need to talk to someone? The National Alcohol and Other Drug Hotline is free and open 24/7: <a href="tel:1800250015">1800 250 015</a>.</p>
    </div>`;
}

function toggleCraving() {
  const btn = $('#crave-btn');
  if (cravingTimer) {
    clearInterval(cravingTimer.id);
    cravingTimer = null;
    btn.textContent = 'Start 15 minutes';
    return;
  }
  const end = Date.now() + CRAVING_SECS * 1000;
  let tipI = 0;
  btn.textContent = 'Stop';
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const el = $('#crave-time');
    if (!el) return;
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('#crave-prog').setAttribute('stroke-dashoffset', String(RING_C * (1 - left / CRAVING_SECS)));
    const want = Math.floor((CRAVING_SECS - left) / 45) % CRAVING_TIPS.length;
    if (want !== tipI) { tipI = want; $('#crave-tip').textContent = CRAVING_TIPS[tipI]; }
    if (left === 0) {
      clearInterval(cravingTimer.id);
      cravingTimer = null;
      btn.textContent = 'Start again';
      $('#crave-tip').textContent = 'Fifteen minutes done. How strong is the urge now? Whatever you decide, you gave yourself space to choose.';
    }
  };
  cravingTimer = { id: setInterval(tick, 1000) };
  tick();
}

// ---------------------------------------------------------------- onboarding

function renderOnboarding() {
  const st = state.settings;
  const step = ui.onboardStep;
  const dots = `<div class="progress-dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (step === 0) {
    body = `
      <div class="onboard-mark">${glassSVG({ kind: 'drink', level: 0.45 })}</div>
      <h2 id="onboard-title">Welcome to Paceglass</h2>
      <p class="muted">Log your drinks as you go, see your month at a glance, and learn what changes when you drink less. ${session.user ? 'Your log is private to your account.' : 'Everything stays on this phone.'}</p>
      <fieldset class="field">
        <legend class="label">What are you aiming for?</legend>
        ${goalOptions(st.goalMode, 'ob-goal')}
      </fieldset>`;
  } else if (step === 1) {
    body = `
      <h2 id="onboard-title">Your numbers</h2>
      <p class="muted">A standard drink is 10 grams of alcohol: about a middy of full-strength beer, a small glass of wine or a nip of spirits. A rough guess is fine.</p>
      <div class="field">
        <label for="ob-baseline">In a usual week right now, how many standard drinks do you have?</label>
        <input class="input" id="ob-baseline" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.baselinePerWeek)}">
        <span class="hint">If you drink a lot now, you'll be offered a step-down plan next.</span>
      </div>
      ${st.goalMode === 'cutback' ? `
      <div class="field-row three">
        <div class="field"><label for="ob-weekly">Weekly limit</label>
          <input class="input" id="ob-weekly" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.weeklyLimit)}"></div>
        <div class="field"><label for="ob-daily">Daily limit</label>
          <input class="input" id="ob-daily" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.dailyLimit)}"></div>
        <div class="field"><label for="ob-af">AF days</label>
          <input class="input" id="ob-af" type="number" inputmode="numeric" min="0" max="7" step="1" value="${esc(st.afDaysPerWeek)}"></div>
      </div>
      <p class="hint">Your goal. The Australian guidelines are no more than 10 a week and no more than 4 on any day.</p>` : ''}`;
  } else {
    body = `
      <h2 id="onboard-title">Almost done</h2>
      <div class="field">
        <label for="ob-cost">Roughly what does one standard drink cost you?</label>
        <div class="input-affix" data-prefix="$"><input class="input" id="ob-cost" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(st.costPerDrink)}"></div>
        <span class="hint">Used to show money not spent. A schooner at the pub is often $8 to $12; bottle-shop drinks are often $2 to $4.</span>
      </div>
      <div class="field">
        <label for="ob-reasons">Why are you doing this? (optional)</label>
        <textarea class="textarea" id="ob-reasons" maxlength="600" placeholder="Better sleep. More patience with the kids. Saving for the trip.">${esc(st.reasons)}</textarea>
      </div>
      ${needsWithdrawalCaution(state) ? cautionBlock() : ''}
      <p class="fineprint">Paceglass offers general information, not medical advice.</p>`;
  }
  $('#sheet-onboarding').innerHTML = `
    <div class="sheet-inner onboard-step">
      ${dots}
      ${body}
      <div class="btn-row">
        ${step > 0 ? '<button class="btn btn-plain" type="button" data-action="ob-back">Back</button>' : ''}
        <button class="btn btn-primary" type="button" data-action="ob-next">${step < 2 ? 'Continue' : 'Start tracking'}</button>
      </div>
    </div>`;
}

function readOnboardingStep() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const st = state.settings;
  if (ui.onboardStep === 0) {
    applyGoalMode(document.querySelector('input[name="ob-goal"]:checked')?.value || 'cutback');
  } else if (ui.onboardStep === 1) {
    updateSettings(state, {
      baselinePerWeek: num('ob-baseline', st.baselinePerWeek),
      weeklyLimit: num('ob-weekly', st.weeklyLimit),
      dailyLimit: num('ob-daily', st.dailyLimit),
      afDaysPerWeek: Math.min(7, num('ob-af', st.afDaysPerWeek)),
    });
  } else {
    updateSettings(state, {
      costPerDrink: num('ob-cost', st.costPerDrink),
      reasons: document.getElementById('ob-reasons')?.value || '',
    });
  }
}

function applyGoalMode(mode) {
  const patch = { goalMode: mode };
  if (mode === 'cutback' && state.settings.goalMode !== 'cutback') {
    Object.assign(patch, { weeklyLimit: 10, dailyLimit: 4, afDaysPerWeek: 3 });
  } else if (mode !== 'cutback') {
    Object.assign(patch, { afDaysPerWeek: 7 });
  }
  updateSettings(state, patch);
}

// ---------------------------------------------------------------- actions

function pour() {
  const t = today();
  const p = selectedPreset();
  const entry = addEntry(state, t, { label: p.label, std: p.std, presetId: p.id });
  persist();

  // Animate the existing glass rather than re-rendering it, so the liquid visibly rises.
  const total = dayTotal(state.days[t]);
  const btn = $('.pour');
  if (!btn) { commit(); return; }
  const ref = glassRef(t);
  setGlassLevel($('.pour .glass-svg'), total / ref, total > ref ? 'over' : 'drink');
  btn.classList.remove('rippling'); void btn.offsetWidth; btn.classList.add('rippling');
  if (navigator.vibrate) navigator.vibrate(12);
  $('#today-total').textContent = fmt(total);
  setTimeout(() => { renderToday(); $('.pour')?.focus({ preventScroll: true }); }, 450);

  toast(`Added ${drinkName(p)} (${fmt(p.std)})`, 'Undo', () => {
    removeEntry(state, t, entry.id);
    if (!state.days[t].entries.length && !state.days[t].manual && !state.days[t].note) clearDay(state, t);
    commit();
  });
}

function setTab(tab) {
  ui.tab = tab;
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
  ui.deleteArmed = false;
  ui.endPlanArmed = false;
  ui.editingDrinks = false;
  ui.resetDrinksArmed = false;
  render();
  window.scrollTo({ top: 0 });
  try { sessionStorage.setItem('paceglass:tab', tab); } catch { /* private mode */ }
}

function editDay(key) {
  ui.editingDay = key;
  renderDaySheet();
  openSheet('sheet-day');
}

let toastTimer = null;
function toast(text, actionLabel, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  el.hidden = false;
  if (actionLabel) el.querySelector('button').onclick = () => { el.hidden = true; action(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('.tabbar button');
  if (tabBtn) return setTab(tabBtn.dataset.tab);

  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, key, id } = el.dataset;

  switch (action) {
    case 'pour': return pour();
    case 'choose':
      updateSettings(state, { lastPresetId: id });
      return commit();
    case 'open-custom':
      openDrinkSheet('oneoff');
      return;
    case 'drinks-edit':
      ui.editingDrinks = !ui.editingDrinks;
      ui.resetDrinksArmed = false;
      renderToday();
      $('.drinks-block [data-action="drinks-edit"]')?.focus();
      return;
    case 'drink-edit':
      if (Date.now() < ui.suppressClickUntil) return;
      openDrinkSheet('edit', myDrinks().find((x) => x.id === id));
      return;
    case 'drink-new':
      openDrinkSheet('new');
      return;
    case 'drink-remove':
      closeSheet('sheet-custom');
      removeDrink(id);
      return;
    case 'drink-move': {
      const f = $('#custom-form');
      const formId = f?.dataset.id;
      const list = myDrinks();
      const i = list.findIndex((x) => x.id === formId);
      if (i === -1) return;
      // Keep whatever's been typed in the sheet; only the position is saved now.
      const draft = {
        ...list[i],
        label: f.name.value,
        volumeMl: f.ml.value,
        abv: f.abv.value,
        icon: f.querySelector('input[name="icon"]:checked')?.value || list[i].icon,
      };
      setMyDrinks(moveItem(list, i, i + Number(el.dataset.dir)));
      commit();
      renderCustomSheet('edit', draft);
      const again = $(`#custom-form [data-action="drink-move"][data-dir="${el.dataset.dir}"]`);
      (again && !again.disabled ? again : $('#custom-form [type="submit"]'))?.focus();
      return;
    }
    case 'drinks-reset':
      if (!ui.resetDrinksArmed) { ui.resetDrinksArmed = true; renderToday(); return; }
      ui.resetDrinksArmed = false;
      setMyDrinks(defaultDrinks());
      commit();
      toast('My drinks is back to the standard list');
      return;
    case 'remove-entry': {
      const removed = removeEntry(state, key, id);
      commit();
      if (ui.editingDay) renderDaySheet();
      if (removed) toast(`Removed ${drinkName(removed)}`, 'Undo', () => {
        state.days[key] ||= { entries: [], manual: 0, note: '', logged: true };
        state.days[key].entries.push(removed);
        state.days[key].entries.sort((a, b) => a.t.localeCompare(b.t));
        commit(); if (ui.editingDay) renderDaySheet();
      });
      return;
    }
    case 'mark-af':
      markAlcoholFree(state, key);
      commit();
      if (ui.editingDay) renderDaySheet();
      toast(key === today() ? 'Today is marked alcohol-free' : `${formatShortDay(key)} marked alcohol-free`);
      return;
    case 'goto-missing':
      ui.calYear = fromKey(key).getFullYear(); ui.calMonth = fromKey(key).getMonth();
      setTab('calendar');
      return editDay(key);
    case 'goto-insights': return setTab('insights');
    case 'edit-day': return editDay(key);
    case 'day-step': {
      const k = ui.editingDay;
      const cur = isLogged(state.days[k]) ? dayTotal(state.days[k]) : 0;
      const step = Number(el.dataset.step);
      setDayTotal(state, k, Math.max(0, step > 0 ? Math.floor(cur + 1) : Math.ceil(cur - 1)));
      commit(); renderDaySheet();
      return;
    }
    case 'day-add': {
      const p = allPresets().find((x) => x.id === id);
      if (!p) return;
      const k = ui.editingDay;
      // Time-stamp past-day drinks at 7pm that day rather than now.
      const at = k === today() ? new Date() : new Date(fromKey(k).setHours(19, 0, 0, 0));
      addEntry(state, k, { label: p.label, std: p.std, presetId: p.id }, at);
      commit(); renderDaySheet();
      return;
    }
    case 'clear-day':
      clearDay(state, key);
      commit(); renderDaySheet();
      return;
    case 'close-sheet':
      closeSheet(id);
      return;
    case 'month': {
      const d = new Date(ui.calYear, ui.calMonth + Number(el.dataset.dir), 1);
      ui.calYear = d.getFullYear(); ui.calMonth = d.getMonth();
      return renderCalendar();
    }
    case 'chart-week': return selectChartWeek(Number(el.dataset.i));
    case 'chart-step': return selectChartStep(Number(el.dataset.i));
    case 'open-craving':
      renderCravingSheet(); openSheet('sheet-craving');
      return;
    case 'crave-toggle': return toggleCraving();
    case 'open-plan': return openPlanBuilder();
    case 'open-symptoms':
      renderSymptomsSheet(); openSheet('sheet-symptoms');
      return;
    case 'slow-plan': {
      const pos = planPosition(state.settings.plan, today());
      updateSettings(state, { plan: slowDown(state.settings.plan, pos.index) });
      commit();
      closeSheet('sheet-symptoms');
      toast(`Plan slowed down. This step is back to ${state.settings.plan.steps[pos.index].weekly}.`);
      return;
    }
    case 'repeat-step': {
      const i = Number(el.dataset.i);
      updateSettings(state, { plan: repeatPreviousStep(state.settings.plan, i) });
      commit();
      toast(`Repeating step ${i}. Up to ${state.settings.plan.steps[i].weekly} this week.`);
      return;
    }
    case 'checkin':
      updateSettings(state, { plan: recordCheckin(state.settings.plan, Number(el.dataset.i), el.dataset.value) });
      return commit();
    case 'end-plan':
      if (!ui.endPlanArmed) { ui.endPlanArmed = true; renderSettings(); return; }
      ui.endPlanArmed = false;
      updateSettings(state, { plan: null });
      commit();
      toast('Plan ended. Your limits are back to the ones in Settings.');
      return;
    case 'sign-out':
      signOutNow();
      return;
    case 'refresh-app':
      refreshApp(el);
      return;
    case 'export':
      download(`paceglass-backup-${today()}.json`, exportJSON(state));
      toast('Backup saved');
      return;
    case 'delete-all':
      if (!ui.deleteArmed) { ui.deleteArmed = true; renderSettings(); return; }
      state = createState();
      persist();
      ui.deleteArmed = false;
      ui.onboardStep = 0;
      render();
      renderOnboarding(); openSheet('sheet-onboarding');
      return;
    case 'ob-next':
      readOnboardingStep();
      if (ui.onboardStep < 2) { ui.onboardStep++; renderOnboarding(); $('#sheet-onboarding').scrollTop = 0; return; }
      updateSettings(state, { onboarded: true, startDate: state.settings.startDate || today() });
      commit();
      closeSheet('sheet-onboarding');
      if (shouldSuggestPlan(state)) openPlanBuilder();
      return;
    case 'ob-back':
      readOnboardingStep();
      ui.onboardStep = Math.max(0, ui.onboardStep - 1);
      renderOnboarding();
      return;
  }
});

function selectChartWeek(i) {
  const weeks = recentWeeks(state, today(), 8);
  $('#chart-readout').textContent = weekReadout(weeks[i]);
  document.querySelectorAll('#week-chart .bar-group').forEach((g) => g.classList.toggle('active', Number(g.dataset.i) === i));
}

function selectChartStep(i) {
  const prog = planProgress(state, today());
  $('#plan-readout').textContent = stepReadout(prog.steps[i]);
  document.querySelectorAll('#plan-chart .bar-group').forEach((g) => g.classList.toggle('active', Number(g.dataset.i) === i));
}

document.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.bar-group');
  if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
document.addEventListener('focusin', (ev) => {
  const g = ev.target.closest?.('.bar-group');
  if (!g) return;
  if (g.dataset.action === 'chart-step') selectChartStep(Number(g.dataset.i));
  else selectChartWeek(Number(g.dataset.i));
});

// Inputs that save or update as you type.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'day-total') {
    const v = parseFloat(t.value);
    if (Number.isFinite(v) && v >= 0) { setDayTotal(state, ui.editingDay, v); persist(); render(); }
    return;
  }
  if (t.id === 'day-note') { setNote(state, ui.editingDay, t.value); persist(); return; }
  if (t.closest('#custom-form')) {
    const f = t.closest('#custom-form');
    $('#c-std').textContent = fmt(standardDrinks(f.ml.value, f.abv.value));
    const picker = f.querySelector('.icon-picker');
    if (t.name === 'icon') { picker.dataset.touched = 'true'; return; }
    // Until they pick an icon themselves, suggest one from the name and strength.
    if (picker.dataset.touched !== 'true') {
      const guess = guessIcon({ label: f.name.value, abv: f.abv.value, volumeMl: f.ml.value });
      const radio = f.querySelector(`input[name="icon"][value="${guess}"]`);
      if (radio) radio.checked = true;
    }
    return;
  }
  const pf = t.closest('#plan-form');
  if (pf) {
    if (t.name === 'customTarget') pf.querySelector('input[name="targetChoice"][value="custom"]').checked = true;
    readPlanForm(pf);
    refreshPlanForm(pf);
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'day-total') { renderDaySheet(); return; }
  if (t.id === 'import-file') return importFile(t.files?.[0]);
  const pf = t.closest('#plan-form');
  if (pf) { readPlanForm(pf); refreshPlanForm(pf); return; }
  const form = t.closest('#settings-form');
  if (!form) return;
  const name = t.name;
  if (name === 'goalMode') { applyGoalMode(t.value); commit(); renderSettings(); return; }
  if (name === 'reasons' || name === 'startDate' || name === 'theme') {
    if (name === 'startDate' && !t.value) return;
    updateSettings(state, { [name]: t.value });
    if (name === 'theme') applyTheme();
    return commit();
  }
  const v = parseFloat(t.value);
  if (!Number.isFinite(v) || v < 0) return;
  updateSettings(state, { [name]: name === 'afDaysPerWeek' ? Math.min(7, Math.round(v)) : v });
  persist();
});

document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'plan-form') {
    ev.preventDefault();
    readPlanForm(ev.target);
    const d = ui.planDraft;
    const target = draftTarget(d);
    if (!(d.currentPerWeek > target)) { refreshPlanForm(ev.target); return; }
    const plan = draftPlan(d);
    const last = plan.steps[plan.steps.length - 1];
    updateSettings(state, {
      plan,
      goalMode: 'cutback',
      baselinePerWeek: state.settings.plan ? state.settings.baselinePerWeek : plan.currentPerWeek,
      weeklyLimit: target,
      dailyLimit: last.daily,
      afDaysPerWeek: last.afDays,
    });
    commit();
    closeSheet('sheet-plan');
    toast(`Plan set: ${plan.steps.length} weeks to ${target === 0 ? 'alcohol-free' : `${target} a week`}`);
    return;
  }
  if (ev.target.id !== 'custom-form') return;
  ev.preventDefault();
  const f = ev.target;
  const mode = f.dataset.mode;
  const ml = parseFloat(f.ml.value), abv = parseFloat(f.abv.value);
  const std = standardDrinks(ml, abv);
  if (!std) { $('#c-std').textContent = '0'; return; }
  const label = f.name.value.trim() || `${ml} ml at ${abv}%`;
  const chosen = f.querySelector('input[name="icon"]:checked')?.value;
  const icon = DRINK_ICON_IDS.includes(chosen) ? chosen : guessIcon({ label, abv, volumeMl: ml });
  const drink = { label, detail: `${ml} ml, ${abv}%`, volumeMl: ml, abv, std, icon };

  if (mode === 'edit') {
    const list = myDrinks().map((x) => (x.id === f.dataset.id ? { ...x, ...drink } : x));
    setMyDrinks(list);
    commit();
    closeSheet('sheet-custom');
    toast(`Saved ${label}`);
    return;
  }
  if (mode === 'new') {
    setMyDrinks([...myDrinks(), { id: `custom-${Date.now().toString(36)}`, ...drink }]);
    commit();
    closeSheet('sheet-custom');
    toast(`Added ${label} to your drinks`);
    return;
  }

  // 'oneoff': log it now, and save it to the list if ticked.
  if (f.keep.checked) {
    const presetId = `custom-${Date.now().toString(36)}`;
    setMyDrinks([...myDrinks(), { id: presetId, ...drink }]);
    updateSettings(state, { lastPresetId: presetId });
  }
  closeSheet('sheet-custom');
  if (ui.editingDay && $('#sheet-day').open) {
    addEntry(state, ui.editingDay, { label, std });
    commit(); renderDaySheet();
  } else if (f.keep.checked) {
    commit();
    pour();
  } else {
    const entry = addEntry(state, today(), { label, std });
    commit();
    toast(`Added ${label} (${fmt(std)})`, 'Undo', () => { removeEntry(state, today(), entry.id); commit(); });
  }
});

async function importFile(file) {
  if (!file) return;
  try {
    state = importJSON(await file.text());
    state.settings.onboarded = true;
    commit();
    toast('Backup restored');
  } catch (e) {
    toast(e.message || 'That file could not be read.');
  }
}

// Closing a sheet: tidy up and re-render behind it.
document.querySelectorAll('dialog.sheet').forEach((d) => {
  d.addEventListener('close', () => {
    if (d.id === 'sheet-day') ui.editingDay = null;
    if (d.id === 'sheet-craving' && cravingTimer) { clearInterval(cravingTimer.id); cravingTimer = null; }
    if (d.id === 'sheet-onboarding' && !state.settings.onboarded) {
      updateSettings(state, { onboarded: true }); persist();
    }
    render();
  });
  // Tap on the backdrop closes the sheet.
  d.addEventListener('click', (ev) => { if (ev.target === d && d.id !== 'sheet-onboarding') d.close(); });
});

// ---------------------------------------------------------------- boot

function applyTheme() {
  const th = state.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}

function render() {
  if (ui.tab === 'today') renderToday();
  if (ui.tab === 'calendar') renderCalendar();
  if (ui.tab === 'insights') renderInsights();
  if (ui.tab === 'settings' && !document.activeElement?.closest?.('#settings-form')) renderSettings();
}

// Keep the pace note and the date fresh while the app is open (e.g. after midnight).
let lastDay = today();
setInterval(() => {
  if (today() !== lastDay) { lastDay = today(); render(); return; }
  if (ui.tab === 'today' && !document.querySelector('dialog[open]')) {
    const p = $('#pace'); if (p) p.textContent = paceNote(state, today()) || '';
  }
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flushCloudSave(); return; }
  if (document.querySelector('dialog[open]') || document.body.classList.contains('gated')) return;
  if (session.user && session.backend) { pullRemote(); return; }
  state = load(undefined, new Date(), session.storageKey);
  render();
});

// ---------------------------------------------------------------- accounts and cloud saving

function syncText() {
  if (session.offline) return 'Offline. Changes are kept on this device and will sync next time you open Paceglass online.';
  if (session.sync === 'saving') return 'Saving to your account…';
  if (session.sync === 'error') return 'Couldn\'t save to your account just now. Your changes are safe on this device and will be retried.';
  return 'Your log is saved to your account.';
}

function setSync(status) {
  session.sync = status;
  const el = document.getElementById('sync-status');
  if (el) el.textContent = syncText();
}

function scheduleCloudSave(delay = 1200) {
  if (!session.memberId || !session.backend || session.offline) return;
  clearTimeout(session.saveTimer);
  setSync('saving');
  session.saveTimer = setTimeout(cloudSaveNow, delay);
}

function cloudSaveNow() {
  clearTimeout(session.saveTimer);
  session.saveTimer = null;
  if (!session.memberId || !session.backend) return Promise.resolve();
  const p = session.backend.saveUserData(session.memberId, JSON.stringify(state), state.savedAt || Date.now())
    .then(() => { if (session.pending === p) setSync('saved'); })
    .catch(() => { setSync('error'); session.saveTimer = setTimeout(cloudSaveNow, 15000); });
  session.pending = p;
  return p;
}

/** Push any waiting change straight away (when leaving the app or signing out). */
function flushCloudSave() {
  if (session.saveTimer) return cloudSaveNow();
  return session.pending || Promise.resolve();
}

async function pullRemote() {
  try {
    const r = await session.backend.loadUserData(session.memberId);
    if (!r) return;
    const remote = migrate(JSON.parse(r.stateJson));
    if (!remote.savedAt) remote.savedAt = r.clientUpdatedAt;
    if (newerCopy(state.savedAt, remote.savedAt) === 'remote') {
      state = remote;
      save(state, undefined, session.storageKey, { touch: false });
      applyTheme();
      render();
    }
  } catch { /* stay with what's on this device */ }
}

const LAST_USER_KEY = 'paceglass:lastUser';
function rememberUser() {
  try { localStorage.setItem(LAST_USER_KEY, JSON.stringify({ uid: session.user.uid, memberId: session.memberId, name: session.name })); } catch { /* ignore */ }
}
function lastUser() {
  try { return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null'); } catch { return null; }
}

const GUEST_KEY = 'paceglass:guest';
function isGuest() {
  try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; }
}
function setGuest(on) {
  try { if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
}

/** Load Firebase and start listening for sign-in, if that hasn't happened yet. */
async function ensureBackend() {
  if (session.backend) return session.backend;
  session.backend = await getBackend('app');
  session.backend.onAuth((user) => { handleAuth(user); });
  return session.backend;
}

const GATE_MARK = `<div class="gate-mark" aria-hidden="true">${glassSVG({ kind: 'drink', level: 0.45 })}</div>`;
const ADMIN_LINK = '<a class="admin-link" href="admin.html">Admin console</a>';

function showGate(kind, opts = {}) {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.body.classList.add('gated');
  const gate = $('#gate');
  gate.hidden = false;
  if (kind === 'loading') {
    gate.innerHTML = `<section class="card signin-card"><span class="badge">Paceglass</span><p class="muted">${esc(opts.text || 'Loading…')}</p></section>`;
  } else if (kind === 'welcome') {
    gate.innerHTML = `
      <section class="card signin-card welcome-card">
        ${GATE_MARK}
        <h1 id="gate-title">Welcome to Paceglass</h1>
        <p class="muted">Track your drinking, see your progress and work towards your goals at your own pace.</p>
        <button class="btn btn-primary btn-block" type="button" data-action="gate-code">Sign in</button>
        <button class="btn btn-quiet btn-block" type="button" data-action="gate-guest">Continue without signing in</button>
        <p class="tiny">Signing in needs the personal code you were given, and keeps your log backed up. Without signing in, your log stays on this device only.</p>
        ${ADMIN_LINK}
      </section>`;
  } else if (kind === 'code') {
    gate.innerHTML = `
      <section class="card signin-card">
        <span class="badge">Paceglass</span>
        <h1 id="gate-title">Sign in with your code</h1>
        <p class="muted">Enter the personal code you were given.</p>
        <div class="secure-note"><b>Private.</b> Your code is checked securely, and your log is only shown to you.</div>
        <form id="gate-form" class="signin-form" novalidate>
          <div class="field">
            <label for="g-code">Your code</label>
            <input class="input code-input" id="g-code" name="code" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false"
              inputmode="text" maxlength="12" placeholder="XXXX-XXXX" required>
          </div>
          <button class="btn btn-primary btn-block" type="submit" id="g-submit">Sign in</button>
          <p class="status ${opts.tone || ''}" id="g-status" role="status">${esc(opts.message || 'Ready. Enter your code.')}</p>
        </form>
        <button class="link-btn" type="button" data-action="gate-back">Back</button>
        ${ADMIN_LINK}
      </section>`;
    $('#g-code').focus();
  } else if (kind === 'noaccess') {
    gate.innerHTML = `
      <section class="card signin-card">
        <span class="badge">Paceglass</span>
        <h1 id="gate-title">${opts.paused ? 'Access paused' : 'Code not active'}</h1>
        <p class="muted">${opts.paused
          ? 'Access for this code has been paused. Your log is safe. Contact the person who gave you your code.'
          : 'This code isn\'t active any more. It may have been replaced with a new one. Contact the person who gave you your code.'}</p>
        <button class="btn btn-quiet" type="button" data-action="sign-out">Use a different code</button>
        ${ADMIN_LINK}
      </section>`;
  } else if (kind === 'offline') {
    gate.innerHTML = `
      <section class="card signin-card">
        <span class="badge">Paceglass</span>
        <h1 id="gate-title">Can't connect</h1>
        <p class="muted">Paceglass needs to be online the first time you sign in on this device. Check your connection and try again, or use Paceglass on this device without signing in.</p>
        <button class="btn btn-primary btn-block" type="button" data-action="gate-retry">Try again</button>
        <button class="btn btn-quiet btn-block" type="button" data-action="gate-guest">Continue without signing in</button>
        ${ADMIN_LINK}
      </section>`;
  }
}

function hideGate() {
  document.body.classList.remove('gated');
  $('#gate').hidden = true;
  $('#gate').innerHTML = '';
}

async function handleAuth(user) {
  if (!user) {
    session.user = null;
    session.memberId = null;
    if (isGuest()) return; // using Paceglass without signing in
    showGate(session.wantCode ? 'code' : 'welcome');
    session.wantCode = false;
    return;
  }
  showGate('loading', { text: 'Opening your log…' });
  let access;
  try {
    access = await session.backend.getAccess(user);
  } catch (err) {
    const last = lastUser();
    if (last && last.uid === user.uid) access = { memberId: last.memberId, name: last.name, status: 'active' };
    else { showGate('code', { message: friendlyError(err), tone: 'error' }); return; }
  }
  if (!access || access.status !== 'active') { showGate('noaccess', { paused: access?.status === 'disabled' }); return; }
  await enterApp(user, access);
}

async function enterApp(user, access) {
  session.user = user;
  session.memberId = access.memberId;
  session.name = access.name || '';
  session.offline = false;
  session.storageKey = userStorageKey(access.memberId);
  rememberUser();

  // This device's copy: the person's own, or a log kept here before sign-in was set up.
  let local = hasStoredState(undefined, session.storageKey) ? load(undefined, new Date(), session.storageKey) : null;
  let fromLegacy = false;
  if (!local && hasStoredState(undefined, STORAGE_KEY)) {
    const legacy = load();
    if (hasAnyData(legacy)) { local = legacy; fromLegacy = true; }
  }
  let remote = null;
  try {
    const r = await session.backend.loadUserData(access.memberId);
    if (r) {
      remote = migrate(JSON.parse(r.stateJson));
      if (!remote.savedAt) remote.savedAt = r.clientUpdatedAt;
    }
  } catch {
    setSync('error');
  }
  const pick = !remote ? 'local' : !local ? 'remote' : newerCopy(local.savedAt, remote.savedAt);
  state = pick === 'remote' ? remote : (local || createState());
  save(state, undefined, session.storageKey, { touch: !state.savedAt });
  if (pick !== 'remote' && hasAnyData(state)) scheduleCloudSave(0);
  if (fromLegacy && pick !== 'remote') removeStored(undefined, STORAGE_KEY);
  hideGate();
  startApp();
}

/** No connection when opening the app: carry on with this device's copy for the last person signed in. */
function enterOffline(last) {
  session.user = { uid: last.uid, email: '' };
  session.memberId = last.memberId;
  session.name = last.name || '';
  session.offline = true;
  session.storageKey = userStorageKey(last.memberId);
  state = load(undefined, new Date(), session.storageKey);
  hideGate();
  startApp();
}

async function signOutNow() {
  try { await Promise.race([flushCloudSave(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* ignore */ }
  const key = session.storageKey;
  try { localStorage.removeItem(LAST_USER_KEY); } catch { /* ignore */ }
  if (key !== STORAGE_KEY) removeStored(undefined, key);
  state = createState();
  session.user = null;
  session.memberId = null;
  session.name = '';
  session.storageKey = STORAGE_KEY;
  if (session.backend) await session.backend.signOut(); // onAuth shows the welcome screen
  else showGate('welcome');
}

// Sign-in screen.
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'gate-form') return;
  ev.preventDefault();
  const code = ev.target.code.value;
  const status = $('#g-status');
  if (!isCodeShape(code)) {
    status.textContent = normaliseCode(code).length < 8
      ? 'Codes have 8 letters and numbers, like K7QM-3XRP.'
      : 'That code doesn\'t look right. Check it and try again.';
    status.className = 'status error';
    return;
  }
  $('#g-submit').disabled = true;
  status.textContent = 'Checking your code…';
  status.className = 'status';
  try {
    await session.backend.signInWithCode(normaliseCode(code));
  } catch (err) {
    status.textContent = friendlyError(err, { signingInWithCode: true });
    status.className = 'status error';
    $('#g-submit').disabled = false;
  }
}, true);

// Tidy the code as it's typed: capitals and a dash in the middle.
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'g-code') return;
  const raw = normaliseCode(ev.target.value).slice(0, 8);
  ev.target.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
});

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action="gate-code"], [data-action="gate-back"], [data-action="gate-retry"], [data-action="gate-guest"], [data-action="guest-sign-in"]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'gate-retry') location.reload();
  else if (a === 'gate-code') showGate('code');
  else if (a === 'gate-back') showGate('welcome');
  else if (a === 'gate-guest') {
    setGuest(true);
    state = load();
    session.storageKey = STORAGE_KEY;
    hideGate();
    startApp();
  } else if (a === 'guest-sign-in') {
    // From Settings while using Paceglass without signing in.
    setGuest(false);
    flushCloudSave();
    if (session.backend) { showGate('code'); return; }
    session.wantCode = true;
    showGate('loading');
    ensureBackend().catch(() => showGate('offline'));
  }
});

/**
 * The refresh button: save anything waiting, fetch the latest version of the app and reload.
 * Only clears the saved copy of the app's files once we know the server can be reached,
 * so it never leaves the app unable to open offline.
 */
async function refreshApp(btn) {
  if (!navigator.onLine) { toast('You\'re offline. Refresh when you\'re back online.'); return; }
  btn.classList.add('spinning');
  btn.disabled = true;
  try { await Promise.race([flushCloudSave(), new Promise((r) => setTimeout(r, 3000))]); } catch { /* ignore */ }
  try {
    const res = await fetch('./index.html', { cache: 'no-store' });
    if (!res.ok) throw new Error('unreachable');
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    btn.classList.remove('spinning');
    btn.disabled = false;
    toast('Couldn\'t reach Paceglass. Check your connection and try again.');
    return;
  }
  location.reload();
}

function startApp() {
  applyTheme();
  setTab(ui.tab);
  if (!state.settings.onboarded) { ui.onboardStep = 0; renderOnboarding(); openSheet('sheet-onboarding'); }
}

async function boot() {
  try {
    const saved = sessionStorage.getItem('paceglass:tab');
    if (saved) ui.tab = saved;
  } catch { /* ignore */ }

  if (!cloudEnabled() || isGuest()) {
    state = load();
    startApp();
    return;
  }
  showGate('loading');
  try {
    await ensureBackend();
  } catch {
    const last = lastUser();
    if (last) enterOffline(last);
    else showGate('offline');
  }
}

boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
