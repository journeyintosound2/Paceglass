// Derived numbers: weekly totals, streaks, drinks avoided, money and energy not consumed.
// Pure functions of state so they can be unit tested without a browser.

import { addDays, daysBetween, fromKey, startOfWeek, toKey } from './dates.js';
import { KJ_PER_STANDARD_DRINK, roundStd } from './drinks.js';
import { dayTotal, isAlcoholFree, isLogged } from './store.js';

export function summariseRange(state, fromKey_, toKey_, todayKey_) {
  const { dailyLimit } = state.settings;
  let total = 0, afDays = 0, loggedDays = 0, overDays = 0;
  for (let k = fromKey_; daysBetween(k, toKey_) >= 0; k = addDays(k, 1)) {
    if (todayKey_ && daysBetween(k, todayKey_) < 0) break; // ignore future days
    const day = state.days[k];
    if (!isLogged(day)) continue;
    loggedDays++;
    const t = dayTotal(day);
    total += t;
    if (t === 0) afDays++;
    if (t > dailyLimit) overDays++;
  }
  return { total: roundStd(total), afDays, loggedDays, overDays };
}

export function weekSummary(state, anyKeyInWeek, todayKey_) {
  const start = startOfWeek(anyKeyInWeek, state.settings.weekStartsOn);
  const end = addDays(start, 6);
  return { start, end, ...summariseRange(state, start, end, todayKey_) };
}

/** The last n weeks ending with the week containing todayKey_, oldest first. */
export function recentWeeks(state, todayKey_, n = 8) {
  const thisWeek = startOfWeek(todayKey_, state.settings.weekStartsOn);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(weekSummary(state, addDays(thisWeek, -7 * i), todayKey_));
  return out;
}

export function monthSummary(state, year, month, todayKey_) {
  const first = toKey(new Date(year, month, 1));
  const last = toKey(new Date(year, month + 1, 0));
  return summariseRange(state, first, last, todayKey_);
}

/**
 * Consecutive logged alcohol-free days ending today. If today hasn't been filled in yet
 * (or is alcohol-free so far with nothing logged), the streak counts back from yesterday.
 */
export function currentAfStreak(state, todayKey_) {
  const today = state.days[todayKey_];
  if (today && dayTotal(today) > 0) return 0;
  let k = isAlcoholFree(today) ? todayKey_ : addDays(todayKey_, -1);
  let n = 0;
  while (isAlcoholFree(state.days[k])) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export function longestAfStreak(state) {
  const keys = Object.keys(state.days).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    if (isAlcoholFree(state.days[k])) {
      run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    prev = k;
  }
  return best;
}

/** Most recent moment a drink was recorded, as a Date, or null. */
export function lastDrinkTime(state, todayKey_) {
  const keys = Object.keys(state.days).filter((k) => daysBetween(k, todayKey_) >= 0).sort().reverse();
  for (const k of keys) {
    const day = state.days[k];
    if (dayTotal(day) <= 0) continue;
    const stamps = day.entries.filter((e) => e.std > 0).map((e) => new Date(e.t).getTime());
    if (stamps.length && (day.manual || 0) >= 0) {
      // Entries logged later for a past day carry today's time, so cap at the end of that day.
      const endOfDay = fromKey(k); endOfDay.setHours(23, 59, 0, 0);
      return new Date(Math.min(Math.max(...stamps), endOfDay.getTime()));
    }
    // Totals entered by hand have no time: assume the evening of that day.
    const d = fromKey(k); d.setHours(21, 0, 0, 0);
    return d;
  }
  return null;
}

/**
 * Hours alcohol-free, for the "what's happening in your body" timeline.
 * If nothing has ever been logged, count from the start date.
 */
export function hoursAlcoholFree(state, now = new Date()) {
  const todayKey_ = toKey(now);
  const last = lastDrinkTime(state, todayKey_);
  const from = last || fromKey(state.settings.startDate);
  return Math.max(0, (now - from) / 3600000);
}

/**
 * Drinks avoided compared with the user's baseline, counting only days they've filled in
 * since their start date. Negative means more than baseline.
 */
export function drinksAvoided(state, todayKey_) {
  const { startDate, baselinePerWeek } = state.settings;
  const perDay = (Number(baselinePerWeek) || 0) / 7;
  let avoided = 0, days = 0;
  for (const [k, day] of Object.entries(state.days)) {
    if (daysBetween(startDate, k) < 0 || daysBetween(k, todayKey_) < 0) continue;
    if (!isLogged(day)) continue;
    avoided += perDay - dayTotal(day);
    days++;
  }
  return { drinks: roundStd(avoided), days };
}

export function savings(state, todayKey_) {
  const { drinks, days } = drinksAvoided(state, todayKey_);
  const cost = Number(state.settings.costPerDrink) || 0;
  return {
    drinks,
    days,
    dollars: Math.round(drinks * cost),
    kilojoules: Math.round(drinks * KJ_PER_STANDARD_DRINK),
  };
}

/** Days since start date that haven't been filled in (most recent first, excluding today). */
export function missingDays(state, todayKey_, limit = 14) {
  const out = [];
  let k = addDays(todayKey_, -1);
  while (out.length < limit && daysBetween(state.settings.startDate, k) >= 0) {
    if (!isLogged(state.days[k])) out.push(k);
    k = addDays(k, -1);
  }
  return out;
}

/** Highest single-day total in the last n days, used for the withdrawal-safety prompt. */
export function heaviestRecentDay(state, todayKey_, n = 14) {
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, dayTotal(state.days[addDays(todayKey_, -i)]));
  return max;
}
