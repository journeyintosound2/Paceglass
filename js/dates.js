// Date helpers. All app dates are local calendar days stored as "YYYY-MM-DD" keys,
// so a drink logged at 11pm in Sydney stays on that day regardless of UTC.

export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now = new Date()) {
  return toKey(now);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (b - a). Uses noon to avoid daylight-saving edge cases. */
export function daysBetween(a, b) {
  const da = fromKey(a); da.setHours(12);
  const db = fromKey(b); db.setHours(12);
  return Math.round((db - da) / 86400000);
}

/** Key of the first day of the week containing `key`. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function startOfWeek(key, weekStartsOn = 1) {
  const d = fromKey(key);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toKey(d);
}

export function monthGrid(year, month, weekStartsOn = 1) {
  // Returns an array of weeks; each week is 7 keys or null for padding days.
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const fmtCache = {};
function fmt(opts) {
  const k = JSON.stringify(opts);
  return (fmtCache[k] ||= new Intl.DateTimeFormat('en-AU', opts));
}

export const formatDay = (key) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromKey(key));
export const formatShortDay = (key) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(fromKey(key));
export const formatMonth = (year, month) => fmt({ month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
export const formatTime = (iso) => fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const weekdayLetters = (weekStartsOn = 1) => {
  const base = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return [...base.slice(weekStartsOn), ...base.slice(0, weekStartsOn)];
};
