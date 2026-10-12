// Standard drink calculations.
// In Australia a standard drink contains 10 grams of pure alcohol.
// Standard drinks = volume (L) x ABV (%) x 0.789 (density of ethanol).
// Source: Australian Government Department of Health, "Standard drinks guide".

export const ETHANOL_DENSITY = 0.789;

export function standardDrinks(volumeMl, abvPercent) {
  const v = Number(volumeMl);
  const a = Number(abvPercent);
  if (!Number.isFinite(v) || !Number.isFinite(a) || v <= 0 || a <= 0) return 0;
  return roundStd((v / 1000) * a * ETHANOL_DENSITY);
}

/** Round to one decimal place, the precision printed on Australian labels. */
export function roundStd(n) {
  return Math.round(n * 10) / 10;
}

// Common Australian serves, with the icon that best matches each. Users can edit, reorder,
// remove and add to this list ("My drinks"); these are the starting set.
// Icons: 'beer', 'wine-red', 'wine-white', 'spirit', 'can' (see js/drink-icons.js).
export const PRESETS = [
  { id: 'schooner', label: 'Schooner', detail: '425 ml beer, 4.8%', volumeMl: 425, abv: 4.8, icon: 'beer' },
  { id: 'middy', label: 'Middy', detail: '285 ml beer, 4.8%', volumeMl: 285, abv: 4.8, icon: 'beer' },
  { id: 'can', label: 'Can or stubby', detail: '375 ml beer, 4.8%', volumeMl: 375, abv: 4.8, icon: 'can' },
  { id: 'mid-can', label: 'Mid-strength can', detail: '375 ml beer, 3.5%', volumeMl: 375, abv: 3.5, icon: 'can' },
  { id: 'pint', label: 'Pint', detail: '570 ml beer, 4.8%', volumeMl: 570, abv: 4.8, icon: 'beer' },
  { id: 'wine', label: 'Glass of wine', detail: '150 ml, 13%', volumeMl: 150, abv: 13, icon: 'wine-red' },
  { id: 'sparkling', label: 'Sparkling', detail: '150 ml, 12%', volumeMl: 150, abv: 12, icon: 'wine-white' },
  { id: 'spirit', label: 'Spirit nip', detail: '30 ml, 40%', volumeMl: 30, abv: 40, icon: 'spirit' },
  { id: 'premix', label: 'Premix can', detail: '375 ml, 5%', volumeMl: 375, abv: 5, icon: 'can' },
].map((p) => ({ ...p, std: standardDrinks(p.volumeMl, p.abv) }));

export const DRINK_ICON_IDS = ['beer', 'wine-red', 'wine-white', 'spirit', 'can'];

/** Best-guess icon for a drink someone added before icons existed. */
export function guessIcon({ label = '', abv = 0, volumeMl = 0 } = {}) {
  const l = String(label).toLowerCase();
  if (/(red|shiraz|merlot|cabernet|pinot noir|grenache|tempranillo|malbec|ros[eé])/.test(l)) return 'wine-red';
  if (/(white|sauv|\bsav\b|blanc|chardonnay|semillon|riesling|pinot gri|moscato|verdelho|prosecco|champagne|sparkling|bubbles|cava)/.test(l)) return 'wine-white';
  if (/(wine|vino)/.test(l)) return 'wine-red';
  if (/(vodka|gin|rum|whisk|bourbon|tequila|scotch|brandy|spirit|nip|shot|liqueur|cocktail)/.test(l)) return 'spirit';
  if (/(can|stubby|premix|pre-mix|rtd|seltzer|cider|bottle)/.test(l)) return 'can';
  if (/(beer|ale|lager|ipa|stout|pale|schooner|middy|pint|pot)/.test(l)) return 'beer';
  const a = Number(abv) || 0;
  if (a >= 20) return 'spirit';
  if (a >= 9) return 'wine-red';
  if ((Number(volumeMl) || 0) >= 330 && a <= 8) return 'can';
  return 'beer';
}

/** The starting "My drinks" list: the defaults, then anything saved before the list was editable. */
export function defaultDrinks(customPresets = []) {
  return [
    ...PRESETS.map((p) => ({ ...p })),
    ...customPresets.map((c) => ({ ...c, icon: DRINK_ICON_IDS.includes(c.icon) ? c.icon : guessIcon(c) })),
  ];
}

/** Return a copy of the list with one item moved from one position to another. */
export function moveItem(list, from, to) {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const t = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(t, 0, item);
  return out;
}

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id);
}

/** Energy from the alcohol alone: 10 g x ~29 kJ/g. Mixers and carbs are extra. */
export const KJ_PER_STANDARD_DRINK = 290;

/** Roughly how long the body takes to clear one standard drink. Not a driving guide. */
export const HOURS_TO_CLEAR_ONE = 1;
