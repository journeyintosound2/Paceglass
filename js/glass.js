// The glass drawing used everywhere: the big tap-as-you-go glass, calendar days and the week strip.
// Drawn in a 100 x 100 box and stretched to fit, with non-scaling strokes so lines stay crisp.

const SHAPE = 'M6,4 L94,4 L85,92 Q84,98 78,98 L22,98 Q16,98 15,92 Z';
const INNER_TOP = 4;
const INNER_H = 94;
let uid = 0;

/**
 * @param {object} o
 * @param {number} o.level  0..1 how full the glass is
 * @param {'drink'|'over'|'af'|'empty'|'future'} o.kind
 * @param {string} [o.title] accessible name; omit for decorative use
 */
export function glassSVG({ level = 0, kind = 'drink', title = '', className = '' } = {}) {
  const id = `pg-clip-${++uid}`;
  const lv = Math.max(0, Math.min(1, level));
  const shift = (1 - lv) * INNER_H;
  const a11y = title ? `role="img" aria-label="${title.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  const hasLiquid = kind === 'drink' || kind === 'over';
  return `<svg class="glass-svg ${kind} ${className}" viewBox="0 0 100 100" preserveAspectRatio="none" ${a11y}>
    <defs><clipPath id="${id}"><path d="${SHAPE}"/></clipPath></defs>
    <g clip-path="url(#${id})">
      ${kind === 'af' ? `<rect class="clear" x="0" y="0" width="100" height="100"/>` : ''}
      ${hasLiquid
        ? `<rect class="liquid" x="0" y="${INNER_TOP}" width="100" height="${INNER_H}" style="transform:translateY(${shift}px)"/>
           <rect class="meniscus" x="0" y="${INNER_TOP}" width="100" height="${lv > 0 ? 4 : 0}" style="transform:translateY(${shift}px)"/>`
        : ''}
    </g>
    <path class="rim" d="${SHAPE}"/>
    ${kind === 'af' ? '<path class="tick" d="M34,50 L46,62 L68,36"/>' : ''}
  </svg>`;
}

/** Update an existing glass in place so the liquid animates instead of re-rendering. */
export function setGlassLevel(svg, level, kind) {
  if (!svg) return;
  const lv = Math.max(0, Math.min(1, level));
  const shift = (1 - lv) * INNER_H;
  svg.classList.remove('drink', 'over', 'af', 'empty', 'future');
  svg.classList.add(kind);
  svg.querySelectorAll('.liquid, .meniscus').forEach((r) => {
    r.style.transform = `translateY(${shift}px)`;
    if (r.classList.contains('meniscus')) r.setAttribute('height', lv > 0 ? 4 : 0);
  });
}
