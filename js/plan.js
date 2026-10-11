// Step-down plans: a week-by-week taper from where someone is now to where they want to be.
//
// Safety basis (see docs/CONTENT-SOURCES.md):
// - Heavy, daily drinkers should cut down gradually rather than stop suddenly, ideally with their GP.
// - NHS guidance for cutting down at home: reduce by about 10% every four days. If withdrawal
//   symptoms appear, go back up to a level without symptoms, hold for a week, then cut by
//   about 10% a week.
// - Alcohol-free days are only added once the plan is down to about 4 a day on average,
//   so nobody on a plan jumps from heavy drinking to a sudden alcohol-free day.
//
// Pure functions only: no page access, so they can be unit tested in Node.

import { addDays, daysBetween } from './dates.js';

export const PACES = {
  gentle: { label: 'Gentle', rate: 0.10, detail: 'About 10% less each week' },
  steady: { label: 'Steady', rate: 0.17, detail: 'About 10% less every four days' },
  quicker: { label: 'Quicker', rate: 0.25, detail: 'About a quarter less each week', notForHeavy: true },
};

/** About 5 or more standard drinks a day on average. */
export const HEAVY_PER_WEEK = 35;
/** Alcohol-free days only start once a step is at or below this (about 4 a day). */
export const AF_DAYS_FROM_WEEKLY = 28;
export const MAX_STEPS = 52;

export function isHeavy(perWeek) {
  return Number(perWeek) >= HEAVY_PER_WEEK;
}

/** Weekly totals for each step, from `from` down to `target`. */
export function stepTotals(from, target, rate) {
  const out = [];
  let w = Math.max(0, Math.round(from));
  const t = Math.max(0, Math.round(target));
  if (w <= t) return [t];
  while (out.length < MAX_STEPS) {
    let next = Math.round(w * (1 - rate));
    if (next > w - 1) next = w - 1; // always drop at least one drink a week
    if (next <= t) next = t;
    out.push(next);
    w = next;
    if (next === t) break;
  }
  return out;
}

function stepsFromTotals(totals, { startKey, afDaysTarget, finalDailyLimit, startAfDays = 0 }) {
  let af = startAfDays;
  return totals.map((weekly, i) => {
    const isLast = i === totals.length - 1;
    if (weekly === 0) af = 7;
    else if (weekly <= AF_DAYS_FROM_WEEKLY) af = Math.min(afDaysTarget, af + 1, 6);
    else af = 0;
    let daily = weekly === 0 ? 0 : Math.ceil(weekly / (7 - af));
    // Once below about 4 a day, allow up to the guideline's daily maximum on drinking days;
    // the weekly total keeps it in check. Above that, keep days even, which is safer while tapering.
    if ((isLast || weekly <= AF_DAYS_FROM_WEEKLY) && finalDailyLimit > 0 && weekly > 0) {
      daily = Math.max(daily, Math.min(finalDailyLimit, weekly));
    }
    return { start: addDays(startKey, i * 7), weekly, daily, afDays: af };
  });
}

/**
 * Build a plan.
 * @param {object} o
 * @param {number} o.currentPerWeek  standard drinks in a usual week now
 * @param {number} o.targetPerWeek   where they want to get to (0 = alcohol-free)
 * @param {'gentle'|'steady'|'quicker'} o.pace
 * @param {number} o.afDaysTarget    alcohol-free days per week by the end
 * @param {string} o.startDate       YYYY-MM-DD
 * @param {number} [o.finalDailyLimit=4]
 */
export function buildPlan({ currentPerWeek, targetPerWeek, pace = 'steady', afDaysTarget = 2, startDate, finalDailyLimit = 4 }) {
  let p = PACES[pace] ? pace : 'steady';
  if (isHeavy(currentPerWeek) && PACES[p].notForHeavy) p = 'steady';
  const target = Math.max(0, Math.round(Number(targetPerWeek) || 0));
  const afTarget = target === 0 ? 7 : Math.max(0, Math.min(6, Math.round(Number(afDaysTarget) || 0)));
  const totals = stepTotals(currentPerWeek, target, PACES[p].rate);
  return {
    version: 1,
    pace: p,
    currentPerWeek: Math.round(Number(currentPerWeek) || 0),
    targetPerWeek: target,
    afDaysTarget: afTarget,
    finalDailyLimit,
    startDate,
    steps: stepsFromTotals(totals, { startKey: startDate, afDaysTarget: afTarget, finalDailyLimit }),
    checkins: {},
  };
}

export function planEnd(plan) {
  return addDays(plan.steps[plan.steps.length - 1].start, 6);
}

/**
 * Where today sits in the plan.
 * Returns { index, step, dayInStep, status: 'upcoming' | 'active' | 'complete' }.
 * After the last step the plan is complete and the final step's limits keep applying.
 */
export function planPosition(plan, key) {
  if (!plan || !plan.steps?.length) return null;
  const d = daysBetween(plan.startDate, key);
  if (d < 0) return { index: 0, step: plan.steps[0], dayInStep: d, status: 'upcoming' };
  const i = Math.floor(d / 7);
  if (i >= plan.steps.length) {
    const last = plan.steps.length - 1;
    return { index: last, step: plan.steps[last], dayInStep: 7, status: 'complete' };
  }
  return { index: i, step: plan.steps[i], dayInStep: d - i * 7, status: 'active' };
}

function restart(plan, fromIndex, newSteps) {
  const kept = plan.steps.slice(0, fromIndex);
  const startKey = addDays(plan.startDate, fromIndex * 7);
  const re = newSteps.map((s, i) => ({ ...s, start: addDays(startKey, i * 7) }));
  return { ...plan, steps: [...kept, ...re] };
}

/** Repeat the previous step's limits this week, pushing everything after it back a week. */
export function repeatPreviousStep(plan, index) {
  if (index <= 0) return plan;
  const prev = plan.steps[index - 1];
  const rest = plan.steps.slice(index);
  const next = restart(plan, index, [{ ...prev }, ...rest]);
  next.checkins = { ...(plan.checkins || {}), [index]: 'repeated' };
  return next;
}

/**
 * Withdrawal symptoms: go back up to the last level that felt OK, hold for a week,
 * then come down more slowly (about 10% a week).
 */
export function slowDown(plan, index) {
  const holdWeekly = index > 0 ? plan.steps[index - 1].weekly : plan.currentPerWeek;
  const holdAf = index > 0 ? plan.steps[index - 1].afDays : 0;
  const totals = [holdWeekly, ...stepTotals(holdWeekly, plan.targetPerWeek, PACES.gentle.rate)];
  const steps = stepsFromTotals(totals, {
    startKey: addDays(plan.startDate, index * 7),
    afDaysTarget: plan.afDaysTarget,
    finalDailyLimit: plan.finalDailyLimit,
    startAfDays: Math.max(0, holdAf - 1),
  });
  const next = restart(plan, index, steps);
  next.pace = 'gentle';
  next.checkins = { ...(plan.checkins || {}), [index]: 'slowed' };
  return next;
}

export function recordCheckin(plan, index, value) {
  return { ...plan, checkins: { ...(plan.checkins || {}), [index]: value } };
}
