// Personal sign-in codes, like the Mills Maths Tools student codes.
//
// Each person gets an 8-character code such as "K7QM-3XRP". Behind the scenes the code signs in to a
// hidden Firebase Authentication account (email/password), so Firebase still does the checking and
// rate-limits guessing. People never see or need that hidden email.
//
// The alphabet leaves out characters that are easy to confuse: 0/O, 1/I/L.
// 31 characters ^ 8 positions ≈ 850 billion possible codes.

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;

function randomIndex(n) {
  const buf = new Uint32Array(1);
  // Rejection sampling avoids bias towards the first characters.
  const limit = Math.floor(0xffffffff / n) * n;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

export function generateCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return out;
}

/** Uppercase and strip spaces, dashes and anything else, so "k7qm 3xrp" works. */
export function normaliseCode(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isCodeShape(input) {
  const c = normaliseCode(input);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

/** "K7QM3XRP" → "K7QM-3XRP" for display. */
export function formatCode(code) {
  const c = normaliseCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** The hidden sign-in email for a code, on the Firebase project's own domain. Never shown to anyone. */
export function codeAuthEmail(code, domain) {
  return `u-${normaliseCode(code).toLowerCase()}@${domain}`;
}

/** The hidden password for a code. Firebase needs at least 6 characters; the code is the secret. */
export function codePassword(code) {
  return `pg:${normaliseCode(code)}:paceglass`;
}
