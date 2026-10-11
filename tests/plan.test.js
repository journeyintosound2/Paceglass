// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays } from '../js/dates.js';
import {
  AF_DAYS_FROM_WEEKLY, buildPlan, planEnd, planPosition, repeatPreviousStep, slowDown, stepTotals,
} from '../js/plan.js';
import { limitsOn } from '../js/limits.js';
import { createState, setDayTotal } from '../js/store.js';
import { planProgress } from '../js/stats.js';
import { planStageFor, shouldSuggestPlan, todayMessage } from '../js/insights.js';

const START = '2026-10-12';

test('70 a week down to 10 at a steady pace', () => {
  const plan = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'steady', afDaysTarget: 2, startDate: START });
  const w = plan.steps.map((s) => s.weekly);
  assert.equal(w[0], 58);
  assert.equal(w[w.length - 1], 10);
  for (let i = 1; i < w.length; i++) assert.ok(w[i] < w[i - 1], 'every step goes down');
  assert.ok(plan.steps.length >= 8 && plan.steps.length <= 14, `took ${plan.steps.length} weeks`);
  // No alcohol-free days while still above about 4 a day.
  for (const s of plan.steps) if (s.weekly > AF_DAYS_FROM_WEEKLY) assert.equal(s.afDays, 0);
  const last = plan.steps[plan.steps.length - 1];
  assert.equal(last.afDays, 2);
  assert.ok(last.daily <= 4);
  // Daily limits never ask for more than the weekly total allows.
  for (const s of plan.steps) assert.ok(s.daily * (7 - s.afDays) >= s.weekly);
  assert.equal(plan.steps[1].start, addDays(START, 7));
  assert.equal(planEnd(plan), addDays(START, plan.steps.length * 7 - 1));
});

test('gentle takes longer than steady; heavy drinkers cannot pick quicker', () => {
  const g = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'gentle', startDate: START });
  const s = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'steady', startDate: START });
  assert.ok(g.steps.length > s.steps.length);
  const q = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'quicker', startDate: START });
  assert.equal(q.pace, 'steady');
  const light = buildPlan({ currentPerWeek: 24, targetPerWeek: 10, pace: 'quicker', startDate: START });
  assert.equal(light.pace, 'quicker');
});

test('plans to stop end on an alcohol-free week', () => {
  const plan = buildPlan({ currentPerWeek: 42, targetPerWeek: 0, pace: 'steady', startDate: START });
  const last = plan.steps[plan.steps.length - 1];
  assert.equal(last.weekly, 0);
  assert.equal(last.daily, 0);
  assert.equal(last.afDays, 7);
});

test('small numbers still step down by at least one', () => {
  assert.deepEqual(stepTotals(12, 10, 0.1), [11, 10]);
  assert.deepEqual(stepTotals(8, 10, 0.1), [10]);
});

test('position, limits and progress follow the plan', () => {
  const st = createState(new Date(2026, 9, 12));
  st.settings.plan = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'steady', startDate: START });
  const p0 = planPosition(st.settings.plan, START);
  assert.equal(p0.status, 'active');
  assert.equal(p0.index, 0);
  assert.equal(planPosition(st.settings.plan, addDays(START, 9)).index, 1);
  assert.equal(planPosition(st.settings.plan, addDays(START, -1)).status, 'upcoming');
  assert.equal(planPosition(st.settings.plan, addDays(START, 400)).status, 'complete');

  const lim = limitsOn(st, START);
  assert.equal(lim.fromPlan, true);
  assert.equal(lim.weekly, 58);
  assert.equal(lim.daily, 9);

  for (let i = 0; i < 7; i++) setDayTotal(st, addDays(START, i), 8);
  const today = addDays(START, 8);
  const prog = planProgress(st, today);
  assert.equal(prog.steps[0].status, 'done');
  assert.equal(prog.steps[0].actual.total, 56);
  assert.equal(prog.steps[0].met, true);
  assert.equal(prog.steps[1].status, 'current');
  assert.equal(planStageFor(st.settings.plan, 0).id, 'start');
  assert.equal(planStageFor(st.settings.plan, st.settings.plan.steps.length - 1).id, 'target');
});

test('while tapering, going over never suggests a sudden alcohol-free day', () => {
  const st = createState(new Date(2026, 9, 12));
  st.settings.plan = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'steady', startDate: START });
  for (let i = 0; i < 6; i++) setDayTotal(st, addDays(START, i), 9);
  setDayTotal(st, addDays(START, 6), 5);
  const msg = todayMessage(st, addDays(START, 6));
  assert.match(msg.text, /steady rather than stopping suddenly/);
});

test('repeat a step and slow down push the plan back safely', () => {
  const plan = buildPlan({ currentPerWeek: 70, targetPerWeek: 10, pace: 'steady', startDate: START });
  const rep = repeatPreviousStep(plan, 2);
  assert.equal(rep.steps.length, plan.steps.length + 1);
  assert.equal(rep.steps[2].weekly, plan.steps[1].weekly);
  assert.equal(rep.steps[2].start, plan.steps[2].start);
  assert.equal(rep.checkins[2], 'repeated');

  const slow = slowDown(plan, 2);
  assert.equal(slow.pace, 'gentle');
  assert.equal(slow.steps[2].weekly, plan.steps[1].weekly); // back up to last OK level
  assert.ok(slow.steps[3].weekly < slow.steps[2].weekly);
  assert.ok(slow.steps.length > plan.steps.length);
  assert.equal(slow.steps[slow.steps.length - 1].weekly, 10);
});

test('suggests a plan for heavy drinkers without one', () => {
  const st = createState();
  st.settings.baselinePerWeek = 70;
  assert.equal(shouldSuggestPlan(st), true);
  st.settings.baselinePerWeek = 14;
  assert.equal(shouldSuggestPlan(st), false);
  st.settings.goalMode = 'stop';
  st.settings.baselinePerWeek = 50;
  assert.equal(shouldSuggestPlan(st), true);
});
