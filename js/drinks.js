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

// Common Australian serves. Users can add their own in a later version.
export const PRESETS = [
  { id: 'schooner', label: 'Schooner', detail: '425 ml beer, 4.8%', volumeMl: 425, abv: 4.8 },
  { id: 'middy', label: 'Middy', detail: '285 ml beer, 4.8%', volumeMl: 285, abv: 4.8 },
  { id: 'can', label: 'Can or stubby', detail: '375 ml beer, 4.8%', volumeMl: 375, abv: 4.8 },
  { id: 'mid-can', label: 'Mid-strength can', detail: '375 ml beer, 3.5%', volumeMl: 375, abv: 3.5 },
  { id: 'pint', label: 'Pint', detail: '570 ml beer, 4.8%', volumeMl: 570, abv: 4.8 },
  { id: 'wine', label: 'Glass of wine', detail: '150 ml, 13%', volumeMl: 150, abv: 13 },
  { id: 'sparkling', label: 'Sparkling', detail: '150 ml, 12%', volumeMl: 150, abv: 12 },
  { id: 'spirit', label: 'Spirit nip', detail: '30 ml, 40%', volumeMl: 30, abv: 40 },
  { id: 'premix', label: 'Premix can', detail: '375 ml, 5%', volumeMl: 375, abv: 5 },
].map((p) => ({ ...p, std: standardDrinks(p.volumeMl, p.abv) }));

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id);
}

/** Energy from the alcohol alone: 10 g x ~29 kJ/g. Mixers and carbs are extra. */
export const KJ_PER_STANDARD_DRINK = 290;

/** Roughly how long the body takes to clear one standard drink. Not a driving guide. */
export const HOURS_TO_CLEAR_ONE = 1;
