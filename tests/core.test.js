// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, daysBetween, monthGrid, startOfWeek } from '../js/dates.js';
import { PRESETS, standardDrinks } from '../js/drinks.js';
import {
  addEntry, createState, dayTotal, exportJSON, importJSON, isAlcoholFree,
  markAlcoholFree, removeEntry, setDayTotal,
} from '../js/store.js';
import {
  currentAfStreak, drinksAvoided, longestAfStreak, monthSummary, savings, weekSummary,
} from '../js/stats.js';
import { needsWithdrawalCaution, phaseForHours, todayMessage } from '../js/insights.js';

const NOW = new Date(2026, 9, 12, 19, 30); // Mon 12 Oct 2026, 7:30pm local
const TODAY = '2026-10-12';

function fresh(settings = {}) {
  const s = createState(NOW);
  s.settings = { ...s.settings, startDate: '2026-10-01', ...settings };
  return s;
}

test('standard drinks match the Australian formula', () => {
  assert.equal(standardDrinks(375, 4.8), 1.4);
  assert.equal(standardDrinks(150, 13), 1.5);
  assert.equal(standardDrinks(700, 40), 22.1);
  assert.equal(standardDrinks(0, 5), 0);
  assert.equal(standardDrinks(375, -1), 0);
  assert.equal(PRESETS.find((p) => p.id === 'schooner').std, 1.6);
});

test('date helpers', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-10-01', '2026-10-12'), 11);
  assert.equal(startOfWeek(TODAY, 1), '2026-10-12');
  assert.equal(startOfWeek('2026-10-18', 1), '2026-10-12');
  const grid = monthGrid(2026, 9, 1);
  assert.equal(grid[0][3], '2026-10-01'); // 1 Oct 2026 is a Thursday
  assert.ok(grid.every((w) => w.length === 7));
});

test('tap as you go adds up and undo removes', () => {
  const s = fresh();
  const a = addEntry(s, TODAY, { label: 'Schooner', std: 1.6 }, NOW);
  addEntry(s, TODAY, { label: 'Wine', std: 1.5 }, NOW);
  assert.equal(dayTotal(s.days[TODAY]), 3.1);
  removeEntry(s, TODAY, a.id);
  assert.equal(dayTotal(s.days[TODAY]), 1.5);
});

test('setting a total by hand keeps logged drinks', () => {
  const s = fresh();
  addEntry(s, TODAY, { label: 'Can', std: 1.4 }, NOW);
  setDayTotal(s, TODAY, 4);
  assert.equal(dayTotal(s.days[TODAY]), 4);
  assert.equal(s.days[TODAY].entries.length, 1);
  setDayTotal(s, TODAY, 0);
  assert.equal(dayTotal(s.days[TODAY]), 0);
  assert.ok(isAlcoholFree(s.days[TODAY]));
});

test('alcohol-free streak counts back from yesterday until today is logged', () => {
  const s = fresh();
  for (let i = 1; i <= 4; i++) markAlcoholFree(s, addDays(TODAY, -i));
  setDayTotal(s, addDays(TODAY, -5), 3);
  assert.equal(currentAfStreak(s, TODAY), 4);
  markAlcoholFree(s, TODAY);
  assert.equal(currentAfStreak(s, TODAY), 5);
  setDayTotal(s, TODAY, 2);
  assert.equal(currentAfStreak(s, TODAY), 0);
  assert.equal(longestAfStreak(s), 4);
});

test('weekly and monthly summaries ignore unlogged and future days', () => {
  const s = fresh();
  setDayTotal(s, '2026-10-05', 3);
  setDayTotal(s, '2026-10-06', 6);
  markAlcoholFree(s, '2026-10-07');
  setDayTotal(s, '2026-10-20', 9); // future
  const w = weekSummary(s, '2026-10-07', TODAY);
  assert.equal(w.total, 9);
  assert.equal(w.afDays, 1);
  assert.equal(w.overDays, 1);
  assert.equal(monthSummary(s, 2026, 9, TODAY).total, 9);
});

test('drinks avoided and savings compare against baseline on logged days', () => {
  const s = fresh({ baselinePerWeek: 21, costPerDrink: 10 });
  markAlcoholFree(s, '2026-10-02');
  setDayTotal(s, '2026-10-03', 1);
  setDayTotal(s, '2026-09-20', 10); // before start date, ignored
  assert.deepEqual(drinksAvoided(s, TODAY), { drinks: 5, days: 2 });
  const sv = savings(s, TODAY);
  assert.equal(sv.dollars, 50);
  assert.equal(sv.kilojoules, 1450);
});

test('phases line up with hours alcohol-free', () => {
  assert.equal(phaseForHours(0).id, 'day1');
  assert.equal(phaseForHours(30).id, 'days2-3');
  assert.equal(phaseForHours(24 * 10).id, 'week2');
  assert.equal(phaseForHours(24 * 200).id, 'months3plus');
});

test('today message reflects limits', () => {
  const s = fresh({ dailyLimit: 4 });
  addEntry(s, TODAY, { label: 'x', std: 2 }, NOW);
  assert.equal(todayMessage(s, TODAY, NOW).tone, 'calm');
  addEntry(s, TODAY, { label: 'x', std: 2 }, NOW);
  assert.equal(todayMessage(s, TODAY, NOW).tone, 'limit');
  addEntry(s, TODAY, { label: 'x', std: 1 }, NOW);
  assert.match(todayMessage(s, TODAY, NOW).text, /past your daily limit/);
});

test('withdrawal caution shows for heavy baseline when stopping, not when cutting back', () => {
  const s = fresh({ goalMode: 'stop', baselinePerWeek: 42, startDate: TODAY });
  assert.equal(needsWithdrawalCaution(s, NOW), true);
  s.settings.goalMode = 'cutback';
  assert.equal(needsWithdrawalCaution(s, NOW), false);
});

test('backup round-trips and rejects junk', () => {
  const s = fresh();
  addEntry(s, TODAY, { label: 'Can', std: 1.4 }, NOW);
  const back = importJSON(exportJSON(s), NOW);
  assert.equal(dayTotal(back.days[TODAY]), 1.4);
  assert.throws(() => importJSON('not json'), /not a Paceglass backup/);
  assert.throws(() => importJSON('{"hello":1}'), /not a Paceglass backup/);
});
