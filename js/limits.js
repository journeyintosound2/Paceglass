// Which limits apply on a given day: the active step of a step-down plan if there is one,
// otherwise the limits set in Settings.

import { planPosition } from './plan.js';

export function limitsOn(state, key) {
  const s = state.settings;
  if (s.plan && s.goalMode === 'cutback') {
    const pos = planPosition(s.plan, key);
    if (pos && pos.status !== 'upcoming') {
      return { weekly: pos.step.weekly, daily: pos.step.daily, afDays: pos.step.afDays, fromPlan: true, pos };
    }
  }
  if (s.goalMode !== 'cutback') return { weekly: 0, daily: 0, afDays: 7, fromPlan: false };
  return { weekly: Number(s.weeklyLimit) || 0, daily: Number(s.dailyLimit) || 0, afDays: Number(s.afDaysPerWeek) || 0, fromPlan: false };
}

/**
 * The amount a day's glass is measured against: the daily limit, or 4 (the Australian
 * guideline's daily maximum) when the goal is to not drink at all.
 */
export function glassLimitOn(state, key) {
  const { daily } = limitsOn(state, key);
  return daily > 0 ? daily : 4;
}
