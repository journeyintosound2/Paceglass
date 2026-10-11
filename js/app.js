// Paceglass app: renders the four screens and wires up interactions.
// State lives in store.js; numbers come from stats.js; messages from insights.js.

import {
  addDays, daysBetween, formatDay, formatMonth, formatShortDay, formatTime, fromKey,
  monthGrid, startOfWeek, toKey, todayKey, weekdayLetters,
} from './dates.js';
import { PRESETS, standardDrinks } from './drinks.js';
import { glassSVG, setGlassLevel } from './glass.js';
import {
  CRAVING_TIPS, CUTBACK, PHASES, SAFETY_TEXT, SUPPORT,
  needsWithdrawalCaution, paceNote, phaseForHours, phaseIndex, todayMessage,
} from './insights.js';
import {
  addEntry, clearDay, dayTotal, exportJSON, importJSON, isLogged, load, markAlcoholFree,
  removeEntry, save, setDayTotal, setNote, updateSettings, createState,
} from './store.js';
import {
  currentAfStreak, hoursAlcoholFree, longestAfStreak, missingDays, monthSummary,
  recentWeeks, savings, weekSummary,
} from './stats.js';

// ---------------------------------------------------------------- state

let state = load();
const ui = {
  tab: 'today',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  editingDay: null,
  onboardStep: 0,
  deleteArmed: false,
  chartWeek: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const money = (n) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const s = (n, one, many = `${one}s`) => (n === 1 ? one : many);

function commit() {
  if (!save(state)) toast('Couldn\'t save on this device. Check storage isn\'t full or blocked.');
  render();
}

function today() { return todayKey(); }

/** Limit used to decide how full a glass looks and when it turns heather. */
function glassRef() {
  const { goalMode, dailyLimit } = state.settings;
  return goalMode === 'cutback' && dailyLimit > 0 ? dailyLimit : 4;
}

function dayKind(key, t = today()) {
  if (daysBetween(t, key) > 0) return 'future';
  const day = state.days[key];
  if (!isLogged(day)) return 'empty';
  const total = dayTotal(day);
  if (total === 0) return 'af';
  return total > glassRef() ? 'over' : 'drink';
}

function dayLabel(key) {
  const kind = dayKind(key);
  const total = dayTotal(state.days[key]);
  const when = formatShortDay(key);
  if (kind === 'future') return `${when}, upcoming`;
  if (kind === 'empty') return `${when}, not filled in`;
  if (kind === 'af') return `${when}, alcohol-free`;
  return `${when}, ${fmt(total)} standard ${s(total, 'drink')}${kind === 'over' ? ', over your limit' : ''}`;
}

function glassForDay(key, opts = {}) {
  const total = dayTotal(state.days[key]);
  return glassSVG({ level: total / glassRef(), kind: dayKind(key), ...opts });
}

function selectedPreset() {
  const id = state.settings.lastPresetId;
  return allPresets().find((p) => p.id === id) || PRESETS[0];
}

function allPresets() {
  return [...PRESETS, ...(state.settings.customPresets || [])];
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
  const week = weekSummary(state, t, t);
  const { goalMode, weeklyLimit, afDaysPerWeek, weekStartsOn } = state.settings;
  const caution = needsWithdrawalCaution(state);
  const weekStart = startOfWeek(t, weekStartsOn);
  const letters = weekdayLetters(weekStartsOn);

  const entries = day?.entries || [];
  const manual = day?.manual || 0;

  $('#view-today').innerHTML = `
    <header class="view-head">
      <h1 id="today-title">Today</h1>
      <p class="sub">${esc(formatDay(t))}</p>
    </header>

    ${caution ? cautionBlock() : ''}

    ${missing.length ? `
      <div class="notice">
        <span>${missing.length === 1 ? `${esc(formatShortDay(missing[0]))} isn't filled in yet.` : `${missing.length} recent days aren't filled in yet.`}</span>
        <button class="btn btn-quiet" type="button" data-action="goto-missing" data-key="${missing[0]}">Fill in</button>
      </div>` : ''}

    <div class="today-hero">
      <button class="pour" type="button" data-action="pour" aria-describedby="pour-label">
        ${glassSVG({ level: total / glassRef(), kind: total > glassRef() ? 'over' : 'drink' })}
        <span class="pour-count"><span class="n num" id="today-total">${fmt(total)}</span><span class="u">standard ${s(total, 'drink')} today</span></span>
        <span class="ripple"></span>
      </button>
      <p class="pour-label" id="pour-label">Tap the glass to add ${esc(articleFor(preset.label))} ${esc(drinkName(preset))}
        <span class="tiny">${fmt(preset.std)} standard ${s(preset.std, 'drink')}</span></p>
      <p class="pace" id="pace">${esc(pace || '')}</p>
    </div>

    <p class="message ${msg.tone}" aria-live="polite" id="today-msg">${esc(msg.text)}</p>

    <div class="block">
      <h2>What are you drinking?</h2>
      <div class="chips" role="group" aria-label="Drink type">
        ${allPresets().map((p) => `
          <button class="chip" type="button" data-action="choose" data-id="${esc(p.id)}" aria-pressed="${p.id === preset.id}">
            <b>${esc(p.label)}</b><span>${fmt(p.std)} std</span>
          </button>`).join('')}
        <button class="chip" type="button" data-action="open-custom"><b>Something else</b><span>Size and strength</span></button>
      </div>
    </div>

    <div class="block">
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
        <p class="muted">Nothing yet. If today stays alcohol-free, mark it so it counts towards your streak.</p>
        <button class="btn btn-quiet" type="button" data-action="mark-af" data-key="${t}">Mark today alcohol-free</button>`}
    </div>

    <div class="block">
      <h2>This week</h2>
      <div class="week-strip">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const k = addDays(weekStart, i);
          return `<button type="button" class="d ${k === t ? 'is-today' : ''}" data-action="edit-day" data-key="${k}" ${daysBetween(t, k) > 0 ? 'disabled' : ''} aria-label="${esc(dayLabel(k))}">
            ${glassForDay(k)}<span>${letters[i]}</span></button>`;
        }).join('')}
      </div>
      ${goalMode === 'cutback' ? `
        <div class="meter ${week.total > weeklyLimit ? 'over' : ''}" role="img" aria-label="${fmt(week.total)} of ${weeklyLimit} standard drinks this week">
          <i style="width:${Math.min(100, weeklyLimit ? (week.total / weeklyLimit) * 100 : 0)}%"></i>
        </div>
        <div class="week-line"><span><b class="num">${fmt(week.total)}</b> of ${weeklyLimit} for the week</span>
          <span><b class="num">${week.afDays}</b> of ${afDaysPerWeek} alcohol-free ${s(afDaysPerWeek, 'day')}</span></div>`
      : `<div class="week-line"><span><b class="num">${week.afDays}</b> alcohol-free ${s(week.afDays, 'day')} this week</span>
          <span><b class="num">${currentAfStreak(state, t)}</b> in a row</span></div>`}
    </div>

    <button class="btn btn-quiet btn-block" type="button" data-action="open-craving">Having a craving?</button>
  `;
}

/** Built-in drink names read naturally in lower case ("a schooner"); the user's own names stay as typed. */
function drinkName(d) {
  const builtIn = PRESETS.some((p) => p.id === (d.presetId || d.id) && p.label === d.label);
  return builtIn ? d.label.toLowerCase() : d.label;
}

function articleFor(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function xIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
}

function cautionBlock() {
  return `<div class="caution" role="note">
    <h3>Stopping after heavy drinking</h3>
    <p>${esc(SAFETY_TEXT)}</p>
    <p>National Alcohol and Other Drug Hotline: <a href="tel:1800250015">1800 250 015</a></p>
  </div>`;
}

// ---------------------------------------------------------------- render: Calendar

function renderCalendar() {
  const t = today();
  const { calYear: y, calMonth: m } = ui;
  const weeks = monthGrid(y, m, state.settings.weekStartsOn);
  const sum = monthSummary(state, y, m, t);
  const isCurrentMonth = y === new Date().getFullYear() && m === new Date().getMonth();
  const startKey = state.settings.startDate;

  $('#view-calendar').innerHTML = `
    <div class="month-nav">
      <button class="icon-btn" type="button" data-action="month" data-dir="-1" aria-label="Previous month">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h1 id="calendar-title">${esc(formatMonth(y, m))}</h1>
      <button class="icon-btn" type="button" data-action="month" data-dir="1" aria-label="Next month" ${isCurrentMonth ? 'disabled style="opacity:.35"' : ''}>
        <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>

    <div class="cal" role="grid" aria-labelledby="calendar-title">
      ${weekdayLetters(state.settings.weekStartsOn).map((l) => `<div class="dow" aria-hidden="true">${l}</div>`).join('')}
      ${weeks.flat().map((k) => {
        if (!k) return '<div aria-hidden="true"></div>';
        const future = daysBetween(t, k) > 0;
        const total = dayTotal(state.days[k]);
        const kind = dayKind(k, t);
        return `<button class="cell ${k === t ? 'is-today' : ''}" type="button" data-action="edit-day" data-key="${k}"
          ${future ? 'disabled' : ''} aria-label="${esc(dayLabel(k))}">
          <span class="date" aria-hidden="true">${fromKey(k).getDate()}</span>
          ${glassForDay(k)}
          <span class="amt" aria-hidden="true">${kind === 'drink' || kind === 'over' ? fmt(total) : ''}</span>
        </button>`;
      }).join('')}
    </div>

    <div class="legend" aria-label="Key">
      <span>${glassSVG({ kind: 'af' })} Alcohol-free</span>
      <span>${glassSVG({ kind: 'drink', level: 0.6 })} Within limit</span>
      <span>${glassSVG({ kind: 'over', level: 1 })} Over ${glassRef()}</span>
      <span>${glassSVG({ kind: 'empty' })} Not filled in</span>
    </div>

    <div class="panel">
      <dl class="summary">
        <div><dt>standard drinks</dt><dd class="num">${fmt(sum.total)}</dd></div>
        <div><dt>alcohol-free ${s(sum.afDays, 'day')}</dt><dd class="num">${sum.afDays}</dd></div>
        <div><dt>${s(sum.overDays, 'day')} over ${glassRef()}</dt><dd class="num">${sum.overDays}</dd></div>
        <div><dt>${s(sum.loggedDays, 'day')} filled in</dt><dd class="num">${sum.loggedDays}</dd></div>
      </dl>
    </div>
    ${daysBetween(startKey, toKey(new Date(y, m + 1, 0))) < 0 ? '' : `<p class="tiny">Tap any day to fill it in or change it. You started on ${esc(formatShortDay(startKey))}.</p>`}
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

function renderInsights() {
  const t = today();
  const { goalMode, baselinePerWeek, weeklyLimit } = state.settings;
  const hours = hoursAlcoholFree(state);
  const phase = phaseForHours(hours);
  const pi = phaseIndex(phase.id);
  const streak = currentAfStreak(state, t);
  const best = longestAfStreak(state);
  const sv = savings(state, t);
  const weeks = recentWeeks(state, t, 8);
  const days = Math.floor(hours / 24);
  const stretchText = hours < 24 ? `${Math.floor(hours)} ${s(Math.floor(hours), 'hour')}` : `${days} ${s(days, 'day')}`;

  $('#view-insights').innerHTML = `
    <header class="view-head">
      <h1 id="insights-title">Insights</h1>
      <p class="sub">What's changing, and what might feel hard right now.</p>
    </header>

    ${needsWithdrawalCaution(state) ? cautionBlock() : ''}

    <div class="block">
      <div class="stretch">
        <span class="big num">${hours < 24 ? Math.floor(hours) : days}</span>
        <span class="lbl">${hours < 24 ? s(Math.floor(hours), 'hour') : s(days, 'day')} alcohol-free</span>
        <span class="muted small">${dayTotal(state.days[t]) > 0
          ? `You've had a drink today, so this restarts. Your longest run of alcohol-free days is ${best}.`
          : `Since your last logged drink. Your longest run of alcohol-free days is ${best}.`}</span>
      </div>
    </div>

    <div class="block">
      <h2>Your alcohol-free stretch</h2>
      <p class="muted small">At ${esc(stretchText)} you're in "${esc(phase.title.toLowerCase())}". Tap any stage to read it.</p>
      <ol class="timeline">
        ${PHASES.map((p, i) => `
          <li class="${i < pi ? 'done' : i === pi ? 'now' : ''}">
            <details ${i === pi ? 'open' : ''}>
              <summary><span class="t">${esc(p.title)}</span><span class="when">${esc(phaseWhen(p, i))}</span></summary>
              <div class="phase-body">
                <div class="gains"><h4>What you might notice</h4><ul>${p.gains.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
                <div class="hard"><h4>What might feel hard</h4><ul>${p.hard.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
                ${p.safety ? `<p class="tiny">If you've been drinking heavily, withdrawal symptoms such as shaking, sweating or confusion can peak around now. Get medical help, or call 000 in an emergency.</p>` : ''}
              </div>
            </details>
          </li>`).join('')}
      </ol>
    </div>

    ${goalMode === 'cutback' ? `
    <div class="block">
      <h2>Cutting back</h2>
      <div class="phase-body">
        <div class="gains"><h4>What you might notice</h4><ul>${CUTBACK.gains.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
        <div class="hard"><h4>What might feel hard</h4><ul>${CUTBACK.hard.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
      </div>
    </div>` : ''}

    <div class="block">
      <h2>Since you started</h2>
      <dl class="stats">
        <div><dt>fewer standard drinks than before</dt><dd class="num">${fmt(Math.max(0, sv.drinks))}</dd></div>
        <div><dt>not spent on alcohol</dt><dd class="num">${money(Math.max(0, sv.dollars))}</dd></div>
        <div><dt>kilojoules not consumed</dt><dd class="num">${Math.max(0, sv.kilojoules).toLocaleString('en-AU')}</dd></div>
        <div><dt>alcohol-free days in a row</dt><dd class="num">${streak}</dd></div>
      </dl>
      <p class="tiny">Compared with your usual ${baselinePerWeek} a week, counting the ${sv.days} ${s(sv.days, 'day')} you've filled in. Kilojoules are from the alcohol alone.</p>
    </div>

    <div class="block">
      <h2>Week by week</h2>
      <div class="chart" id="week-chart">${weekChart(weeks, goalMode === 'cutback' ? weeklyLimit : null, baselinePerWeek)}</div>
      <p class="chart-readout" id="chart-readout" aria-live="polite">${esc(weekReadout(weeks[weeks.length - 1]))}</p>
    </div>

    <div class="block">
      <h2>Support</h2>
      <ul class="list-plain support panel">
        ${SUPPORT.map((x) => `<li><div><div class="name">${esc(x.name)}</div><div class="detail">${esc(x.detail)}</div></div>
          ${x.phone ? `<a class="btn btn-quiet" href="tel:${x.phone.replace(/\s/g, '')}">${esc(x.phone)}</a>` : `<a class="btn btn-quiet" href="${esc(x.url)}" target="_blank" rel="noopener">Open</a>`}</li>`).join('')}
      </ul>
      <button class="btn btn-quiet btn-block" type="button" data-action="open-craving">Ride out a craving</button>
      <p class="fineprint">Paceglass offers general information, not medical advice. If you're worried about your drinking or how you feel, talk to your GP.</p>
    </div>
  `;
}

function weekReadout(w) {
  if (!w) return '';
  if (!w.loggedDays) return `Week of ${formatShortDay(w.start)}: nothing filled in.`;
  return `Week of ${formatShortDay(w.start)}: ${fmt(w.total)} standard ${s(w.total, 'drink')}, ${w.afDays} alcohol-free ${s(w.afDays, 'day')}, ${w.loggedDays} of 7 days filled in.`;
}

function weekChart(weeks, limit, baseline) {
  const W = 340, H = 170, padL = 30, padR = 64, padT = 10, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(4, ...weeks.map((w) => w.total), limit || 0, baseline || 0) * 1.1;
  const y = (v) => padT + ih - (v / max) * ih;
  const step = iw / weeks.length;
  const bw = Math.min(26, step - 8);
  const ticks = niceTicks(max);
  const r = 4;
  const bars = weeks.map((w, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const h = Math.max(0, padT + ih - y(w.total));
    const top = padT + ih - h;
    const rr = Math.min(r, h);
    const path = h > 0
      ? `M${x},${padT + ih} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${padT + ih} Z`
      : '';
    const over = limit != null && w.total > limit;
    const label = i % 2 === (weeks.length - 1) % 2 ? `<text class="axis-lbl" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(shortDate(w.start))}</text>` : '';
    return `<g class="bar-group ${i === weeks.length - 1 ? 'active' : ''}" tabindex="0" role="button" data-action="chart-week" data-i="${i}" aria-label="${esc(weekReadout(w))}">
      ${path ? `<path class="bar ${over ? 'over' : ''}" d="${path}"/>` : ''}
      <rect class="bar-hit" x="${padL + i * step}" y="${padT}" width="${step}" height="${ih + padB}"/>
      ${label}</g>`;
  }).join('');
  const ref = (v, name) => v == null ? '' : `<line class="ref" x1="${padL}" x2="${padL + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="ref-lbl" x="${padL + iw + 6}" y="${y(v) + 4}">${esc(name)} ${fmt(v)}</text>`;
  const refsTooClose = limit != null && baseline != null && Math.abs(y(limit) - y(baseline)) < 14;
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Standard drinks per week for the last 8 weeks">
    ${ticks.map((v) => `<line class="grid" x1="${padL}" x2="${padL + iw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis-lbl" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${bars}
    ${ref(limit, 'Limit')}
    ${refsTooClose ? '' : ref(baseline, 'Before')}
  </svg>`;
}

function niceTicks(max) {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepV = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max; v += stepV) out.push(Math.round(v * 10) / 10);
  return out;
}

function shortDate(key) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(fromKey(key));
}

// ---------------------------------------------------------------- render: Settings

function renderSettings() {
  const st = state.settings;
  $('#view-settings').innerHTML = `
    <header class="view-head">
      <h1 id="settings-title">Settings</h1>
      <p class="sub">Your goal, your numbers and your data.</p>
    </header>

    <form class="settings-group" id="settings-form" autocomplete="off">
      <fieldset class="field" style="border:none;padding:0;margin:0">
        <legend class="label" style="padding:0;margin-bottom:6px;font-weight:700;font-size:var(--step-0)">What are you aiming for?</legend>
        ${goalOptions(st.goalMode, 'goalMode')}
      </fieldset>

      <div class="field-row">
        <div class="field">
          <label for="baselinePerWeek">Usual drinks a week</label>
          <input class="input" id="baselinePerWeek" name="baselinePerWeek" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.baselinePerWeek)}">
          <span class="hint">Before you started</span>
        </div>
        <div class="field">
          <label for="afDaysPerWeek">Alcohol-free days goal</label>
          <input class="input" id="afDaysPerWeek" name="afDaysPerWeek" type="number" inputmode="numeric" min="0" max="7" step="1" value="${esc(st.afDaysPerWeek)}">
          <span class="hint">Each week</span>
        </div>
      </div>

      ${st.goalMode === 'cutback' ? `
      <div class="field-row">
        <div class="field">
          <label for="weeklyLimit">Weekly limit</label>
          <input class="input" id="weeklyLimit" name="weeklyLimit" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.weeklyLimit)}">
          <span class="hint">Guideline: 10 or fewer</span>
        </div>
        <div class="field">
          <label for="dailyLimit">Daily limit</label>
          <input class="input" id="dailyLimit" name="dailyLimit" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.dailyLimit)}">
          <span class="hint">Guideline: 4 or fewer</span>
        </div>
      </div>` : ''}

      <div class="field-row">
        <div class="field">
          <label for="costPerDrink">Cost per standard drink</label>
          <div class="input-affix" data-prefix="$"><input class="input" id="costPerDrink" name="costPerDrink" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(st.costPerDrink)}"></div>
        </div>
        <div class="field">
          <label for="startDate">Start date</label>
          <input class="input" id="startDate" name="startDate" type="date" max="${today()}" value="${esc(st.startDate)}">
        </div>
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

    <hr class="divider">

    <div class="block">
      <h2>Your data</h2>
      <p class="muted small">Everything stays on this device. Nothing is sent anywhere. Save a backup now and then, especially before changing phones or clearing your browser.</p>
      <div class="btn-row">
        <button class="btn btn-quiet" type="button" data-action="export">Save a backup</button>
        <label class="btn btn-quiet" for="import-file">Restore a backup</label>
        <input id="import-file" type="file" accept="application/json,.json" class="visually-hidden">
      </div>
      <button class="btn btn-danger" type="button" data-action="delete-all">${ui.deleteArmed ? 'Tap again to delete everything' : 'Delete all data'}</button>
    </div>

    <hr class="divider">

    <div class="block">
      <h2>About</h2>
      <p class="small muted">A standard drink in Australia is 10 grams of alcohol. The Australian guidelines recommend no more than 10 standard drinks a week and no more than 4 on any one day to reduce the risk of harm.</p>
      <p class="fineprint">Paceglass is a prototype and offers general information, not medical advice. The pace note is not a blood alcohol estimate. Never use it to decide whether you're safe to drive. Version 0.1.0.</p>
    </div>
  `;
}

function goalOptions(current, name) {
  const opts = [
    ['cutback', 'Cut back', 'Drink less, with weekly and daily limits'],
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

function renderDaySheet() {
  const key = ui.editingDay;
  if (!key) return;
  const day = state.days[key];
  const total = dayTotal(day);
  const entries = day?.entries || [];
  const manual = day?.manual || 0;
  const isToday = key === today();
  $('#sheet-day').innerHTML = `
    <div class="sheet-inner">
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2 id="day-title">${esc(isToday ? 'Today' : formatShortDay(key))}</h2>
        <button class="icon-btn" type="button" data-action="close-sheet" data-id="sheet-day" aria-label="Close">${xIcon().replace('<svg', '<svg style="width:20px;height:20px"')}</button>
      </div>

      <div class="stepper">
        <button type="button" data-action="day-step" data-step="-1" aria-label="One fewer">−</button>
        <div class="stepper-val">
          <label class="visually-hidden" for="day-total">Standard drinks</label>
          <input id="day-total" class="n num" type="number" inputmode="decimal" min="0" step="0.1" value="${isLogged(day) ? fmt(total) : ''}" placeholder="–"
            style="width:100%;text-align:center;border:none;background:none;font-family:var(--serif);font-size:var(--step-hero);line-height:1;padding:0">
          <span class="u">standard drinks</span>
        </div>
        <button type="button" data-action="day-step" data-step="1" aria-label="One more">+</button>
      </div>

      <button class="btn ${isLogged(day) && total === 0 ? 'btn-primary' : 'btn-quiet'} btn-block" type="button" data-action="mark-af" data-key="${key}">
        ${isLogged(day) && total === 0 ? 'Alcohol-free day' : 'Mark as alcohol-free'}</button>

      <div class="block">
        <h3 class="small" style="font-family:var(--sans);font-weight:700">Add a drink</h3>
        <div class="chips">
          ${allPresets().map((p) => `<button class="chip" type="button" data-action="day-add" data-id="${esc(p.id)}"><b>${esc(p.label)}</b><span>${fmt(p.std)} std</span></button>`).join('')}
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
        <textarea class="textarea" id="day-note" maxlength="500" placeholder="How did today go? What helped?">${esc(day?.note || '')}</textarea>
      </div>

      <div class="btn-row">
        ${isLogged(day) ? `<button class="btn btn-plain" type="button" data-action="clear-day" data-key="${key}">Clear this day</button>` : ''}
        <button class="btn btn-primary" type="button" data-action="close-sheet" data-id="sheet-day">Done</button>
      </div>
    </div>`;
}

function renderCustomSheet() {
  $('#sheet-custom').innerHTML = `
    <form class="sheet-inner" id="custom-form">
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2 id="custom-title">Something else</h2>
        <button class="icon-btn" type="button" data-action="close-sheet" data-id="sheet-custom" aria-label="Close">${xIcon().replace('<svg', '<svg style="width:20px;height:20px"')}</button>
      </div>
      <p class="muted small">Check the label: Australian drinks show the alcohol percentage and the number of standard drinks.</p>
      <div class="field">
        <label for="c-name">Name</label>
        <input class="input" id="c-name" name="name" placeholder="Craft IPA" maxlength="30">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="c-ml">Size (ml)</label>
          <input class="input" id="c-ml" name="ml" type="number" inputmode="decimal" min="1" step="1" value="330" required>
        </div>
        <div class="field">
          <label for="c-abv">Alcohol (%)</label>
          <input class="input" id="c-abv" name="abv" type="number" inputmode="decimal" min="0.1" max="80" step="0.1" value="6" required>
        </div>
      </div>
      <p>That's <span class="calc-result num" id="c-std">${fmt(standardDrinks(330, 6))}</span> standard drinks.</p>
      <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="keep" checked style="width:20px;height:20px;accent-color:var(--primary)"> Save it to my drinks</label>
      <button class="btn btn-primary btn-block" type="submit">Add this drink</button>
    </form>`;
}

let cravingTimer = null;
const CRAVING_SECS = 15 * 60;

function renderCravingSheet() {
  const reasons = state.settings.reasons?.trim();
  const C = 2 * Math.PI * 100;
  $('#sheet-craving').innerHTML = `
    <div class="sheet-inner">
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2 id="craving-title">Ride out a craving</h2>
        <button class="icon-btn" type="button" data-action="close-sheet" data-id="sheet-craving" aria-label="Close">${xIcon().replace('<svg', '<svg style="width:20px;height:20px"')}</button>
      </div>
      <p class="muted small">Cravings rise, peak and fade, usually within 15 to 30 minutes. Give this one 15 minutes before you decide anything.</p>
      <div class="craving-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true"><circle class="track" cx="110" cy="110" r="100"/>
          <circle class="prog" id="crave-prog" cx="110" cy="110" r="100" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
        <span class="time" id="crave-time" role="timer" aria-live="off">15:00</span>
      </div>
      <p class="craving-tip" id="crave-tip" aria-live="polite">${esc(CRAVING_TIPS[0])}</p>
      <button class="btn btn-primary btn-block" type="button" data-action="crave-toggle" id="crave-btn">Start 15 minutes</button>
      ${reasons ? `<div><h3 class="small" style="font-family:var(--sans);font-weight:700;margin-bottom:6px">Your reasons</h3><p class="reasons-quote">${esc(reasons)}</p></div>` : ''}
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
  const C = 2 * Math.PI * 100;
  const end = Date.now() + CRAVING_SECS * 1000;
  let tipI = 0;
  btn.textContent = 'Stop';
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const el = $('#crave-time');
    if (!el) return;
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('#crave-prog').setAttribute('stroke-dashoffset', String(C * (1 - left / CRAVING_SECS)));
    const elapsed = CRAVING_SECS - left;
    const want = Math.floor(elapsed / 45) % CRAVING_TIPS.length;
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
      ${glassSVG({ kind: 'drink', level: 0.45, className: 'onboard-mark' })}
      <h2 id="onboard-title">Welcome to Paceglass</h2>
      <p class="muted">Log your drinks as you go, see your month at a glance, and learn what changes when you drink less. Everything stays on this phone.</p>
      <fieldset class="field" style="border:none;padding:0;margin:0">
        <legend style="padding:0;margin-bottom:8px;font-weight:700">What are you aiming for?</legend>
        ${goalOptions(st.goalMode, 'ob-goal')}
      </fieldset>`;
  } else if (step === 1) {
    body = `
      <h2 id="onboard-title">Your numbers</h2>
      <p class="muted">A standard drink is 10 grams of alcohol, about a middy of full-strength beer or a small glass of wine. A rough guess is fine.</p>
      <div class="field">
        <label for="ob-baseline">In a usual week before now, how many standard drinks did you have?</label>
        <input class="input" id="ob-baseline" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.baselinePerWeek)}">
      </div>
      ${st.goalMode === 'cutback' ? `
      <div class="field-row">
        <div class="field"><label for="ob-weekly">Weekly limit</label>
          <input class="input" id="ob-weekly" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.weeklyLimit)}"></div>
        <div class="field"><label for="ob-daily">Daily limit</label>
          <input class="input" id="ob-daily" type="number" inputmode="decimal" min="0" step="1" value="${esc(st.dailyLimit)}"></div>
      </div>
      <div class="field"><label for="ob-af">Alcohol-free days each week</label>
        <input class="input" id="ob-af" type="number" inputmode="numeric" min="0" max="7" step="1" value="${esc(st.afDaysPerWeek)}"></div>
      <p class="tiny">The Australian guidelines are no more than 10 a week and no more than 4 on any day.</p>` : ''}`;
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
    const mode = document.querySelector('input[name="ob-goal"]:checked')?.value || 'cutback';
    applyGoalMode(mode);
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
  save(state);

  // Animate the existing glass rather than re-rendering it, so the liquid visibly rises.
  const total = dayTotal(state.days[t]);
  const btn = $('.pour');
  if (!btn) { commit(); return; }
  setGlassLevel($('.pour .glass-svg'), total / glassRef(), total > glassRef() ? 'over' : 'drink');
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
      renderCustomSheet(); openSheet('sheet-custom'); $('#c-name').focus();
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
    case 'edit-day': return editDay(key);
    case 'day-step': {
      const k = ui.editingDay;
      const cur = isLogged(state.days[k]) ? dayTotal(state.days[k]) : 0;
      const step = Number(el.dataset.step);
      const next = Math.max(0, step > 0 ? Math.floor(cur + 1) : Math.ceil(cur - 1));
      setDayTotal(state, k, next);
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
    case 'open-craving':
      renderCravingSheet(); openSheet('sheet-craving');
      return;
    case 'crave-toggle': return toggleCraving();
    case 'export':
      download(`paceglass-backup-${today()}.json`, exportJSON(state));
      toast('Backup saved');
      return;
    case 'delete-all':
      if (!ui.deleteArmed) { ui.deleteArmed = true; renderSettings(); return; }
      state = createState();
      save(state);
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

document.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.bar-group');
  if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectChartWeek(Number(g.dataset.i)); }
});
document.addEventListener('focusin', (ev) => {
  const g = ev.target.closest?.('.bar-group');
  if (g) selectChartWeek(Number(g.dataset.i));
});

// Inputs that save as you type.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'day-total') {
    const v = parseFloat(t.value);
    if (Number.isFinite(v) && v >= 0) { setDayTotal(state, ui.editingDay, v); save(state); render(); }
    return;
  }
  if (t.id === 'day-note') { setNote(state, ui.editingDay, t.value); save(state); return; }
  if (t.closest('#custom-form')) {
    const f = t.closest('#custom-form');
    $('#c-std').textContent = fmt(standardDrinks(f.ml.value, f.abv.value));
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'day-total') { renderDaySheet(); return; }
  if (t.id === 'import-file') return importFile(t.files?.[0]);
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
  save(state);
});

document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'custom-form') return;
  ev.preventDefault();
  const f = ev.target;
  const ml = parseFloat(f.ml.value), abv = parseFloat(f.abv.value);
  const std = standardDrinks(ml, abv);
  if (!std) { $('#c-std').textContent = '0'; return; }
  const label = f.name.value.trim() || `${ml} ml at ${abv}%`;
  if (f.keep.checked) {
    const presetId = `custom-${Date.now().toString(36)}`;
    const custom = [...(state.settings.customPresets || []), { id: presetId, label, detail: `${ml} ml, ${abv}%`, volumeMl: ml, abv, std }];
    updateSettings(state, { customPresets: custom, lastPresetId: presetId });
  }
  closeSheet('sheet-custom');
  if (ui.editingDay && $('#sheet-day').open) {
    addEntry(state, ui.editingDay, { label, std });
    commit(); renderDaySheet();
  } else {
    commit();
    if (f.keep.checked) pour();
    else {
      const entry = addEntry(state, today(), { label, std });
      commit();
      toast(`Added ${label} (${fmt(std)})`, 'Undo', () => { removeEntry(state, today(), entry.id); commit(); });
    }
  }
});

async function importFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    state = importJSON(text);
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
      updateSettings(state, { onboarded: true }); save(state);
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = load(); render(); } });

applyTheme();
try {
  const saved = sessionStorage.getItem('paceglass:tab');
  if (saved) ui.tab = saved;
} catch { /* ignore */ }
setTab(ui.tab);
if (!state.settings.onboarded) { renderOnboarding(); openSheet('sheet-onboarding'); }

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
