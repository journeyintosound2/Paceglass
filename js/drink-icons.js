// Small drink icons for "My drinks". Line drawings in the current text colour, with the drink itself
// filled in, so they read in light and dark mode. 24 x 24 grid.

export const DRINK_ICONS = [
  { id: 'beer', label: 'Beer' },
  { id: 'wine-red', label: 'Red wine' },
  { id: 'wine-white', label: 'White wine' },
  { id: 'spirit', label: 'Spirit' },
  { id: 'can', label: 'Can' },
];

const LINE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const BOWL = 'M7 3.5h10c.3 3.6-.6 6.4-2.4 7.7-.8.6-1.7.8-2.6.8s-1.8-.2-2.6-.8C7.6 9.9 6.7 7.1 7 3.5Z';
const WINE_LIQUID = 'M7.3 6.6h9.4c-.2 2.2-.9 3.8-2.1 4.6-.7.5-1.6.8-2.6.8s-1.9-.3-2.6-.8C8.2 10.4 7.5 8.8 7.3 6.6Z';

const SHAPES = {
  beer: `
    <path d="M6 9.5h9.5v9.2a1.8 1.8 0 0 1-1.8 1.8H7.8A1.8 1.8 0 0 1 6 18.7Z" fill="#F59E0B"/>
    <path d="M5.4 6.8c0-1.6 1.3-2.8 2.8-2.8.5-1.1 1.6-1.6 2.6-1.4 1 .2 1.7.8 2 1.6 1.6-.2 3 1 3 2.6v.6H5.4Z" fill="#FFFFFF"/>
    <path ${LINE} d="M5.4 7.4h10.7v11.3a1.8 1.8 0 0 1-1.8 1.8H7.2a1.8 1.8 0 0 1-1.8-1.8Z"/>
    <path ${LINE} d="M16.1 10h1.6a2 2 0 0 1 2 2v2.6a2 2 0 0 1-2 2h-1.6"/>
    <path ${LINE} d="M5.4 7c0-1.6 1.3-2.8 2.8-2.8.5-1.1 1.6-1.6 2.6-1.4 1 .2 1.7.8 2 1.6 1.6-.2 3 1 3 2.6"/>
    <path ${LINE} d="M8.6 11v6.6M12.4 11v6.6" opacity=".55"/>`,
  'wine-red': `
    <path d="${WINE_LIQUID}" fill="#B91C1C"/>
    <path ${LINE} d="${BOWL}"/>
    <path ${LINE} d="M12 12v7.5M8.6 20.5h6.8"/>`,
  'wine-white': `
    <path d="${WINE_LIQUID}" fill="#FCD34D"/>
    <path ${LINE} d="${BOWL}"/>
    <path ${LINE} d="M12 12v7.5M8.6 20.5h6.8"/>`,
  spirit: `
    <path d="M6.6 13h10.8l-.5 5.6a1.9 1.9 0 0 1-1.9 1.7H9a1.9 1.9 0 0 1-1.9-1.7Z" fill="#B45309"/>
    <path ${LINE} d="M5.5 7.5h13l-1.2 11.1a1.9 1.9 0 0 1-1.9 1.7H8.6a1.9 1.9 0 0 1-1.9-1.7Z"/>
    <rect ${LINE} x="9.4" y="9.6" width="4.4" height="4.4" rx="1" transform="rotate(-12 11.6 11.8)"/>`,
  can: `
    <rect x="7" y="9" width="10" height="7" fill="#3B82F6"/>
    <path ${LINE} d="M7 5.5c0-.8.6-1.5 1.4-1.5h7.2c.8 0 1.4.7 1.4 1.5v13c0 .8-.6 1.5-1.4 1.5H8.4c-.8 0-1.4-.7-1.4-1.5Z"/>
    <path ${LINE} d="M7 6.6h10M7 17.4h10"/>
    <path ${LINE} d="M10.6 4v-.6c0-.5.4-.9.9-.9h1.6"/>`,
};

export function drinkIconSVG(id, { size = 24, title = '' } = {}) {
  const shape = SHAPES[id] || SHAPES.beer;
  const a11y = title ? `role="img" aria-label="${title.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="drink-icon" viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y}>${shape}</svg>`;
}
