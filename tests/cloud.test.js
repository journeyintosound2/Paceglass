// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { friendlyError, isValidEmail, normaliseEmail } from '../js/cloud.js';
import {
  CODE_ALPHABET, codeAuthEmail, codePassword, formatCode, generateCode, isCodeShape, normaliseCode,
} from '../js/codes.js';
import {
  STORAGE_KEY, addEntry, createState, hasAnyData, load, newerCopy, removeStored, save, userStorageKey,
} from '../js/store.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), keys: () => [...m.keys()] };
}

test('emails are compared in lower case and checked loosely', () => {
  assert.equal(normaliseEmail('  Jo.Smith@Example.COM '), 'jo.smith@example.com');
  assert.equal(isValidEmail('jo@example.com'), true);
  assert.equal(isValidEmail('jo@example'), false);
  assert.equal(isValidEmail(''), false);
});

test('Firebase errors become plain sentences', () => {
  assert.match(friendlyError({ code: 'auth/invalid-credential' }), /email and password don't match/);
  assert.match(friendlyError({ code: 'auth/invalid-credential' }, { signingInWithCode: true }), /code doesn't match/);
  assert.match(friendlyError({ code: 'auth/too-many-requests' }), /Too many attempts/);
  assert.match(friendlyError({ code: 'permission-denied' }), /permission/);
  assert.match(friendlyError({}), /Something went wrong/);
});

test('each signed-in person gets their own local copy', () => {
  const st = memoryStorage();
  const a = createState();
  addEntry(a, '2026-10-12', { label: 'Can', std: 1.4 });
  save(a, st, userStorageKey('uid-a'));
  const b = load(st, new Date(), userStorageKey('uid-b'));
  assert.equal(Object.keys(b.days).length, 0);
  const back = load(st, new Date(), userStorageKey('uid-a'));
  assert.equal(back.days['2026-10-12'].entries.length, 1);
  assert.ok(back.savedAt > 0);
  removeStored(st, userStorageKey('uid-a'));
  assert.deepEqual(st.keys(), []);
  assert.notEqual(userStorageKey('x'), STORAGE_KEY);
});

test('the most recently saved copy wins when syncing', () => {
  assert.equal(newerCopy(200, 100), 'local');
  assert.equal(newerCopy(100, 200), 'remote');
  assert.equal(newerCopy(100, 100), 'same');
  assert.equal(newerCopy(undefined, 5), 'remote');
});

test('save can keep the cloud copy\'s timestamp', () => {
  const st = memoryStorage();
  const s = createState();
  s.savedAt = 12345;
  save(s, st, 'k', { touch: false });
  assert.equal(load(st, new Date(), 'k').savedAt, 12345);
  assert.equal(hasAnyData(createState()), false);
});

test('codes are 8 characters from an unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, 8);
    assert.ok([...c].every((ch) => CODE_ALPHABET.includes(ch)));
    assert.ok(isCodeShape(c));
  }
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
  const seen = new Set(Array.from({ length: 500 }, generateCode));
  assert.equal(seen.size, 500);
});

test('codes are forgiving to type', () => {
  assert.equal(normaliseCode(' k7qm-3xrp '), 'K7QM3XRP');
  assert.equal(formatCode('k7qm3xrp'), 'K7QM-3XRP');
  assert.equal(isCodeShape('K7QM 3XRP'), true);
  assert.equal(isCodeShape('K7QM-3XR'), false);
  assert.equal(isCodeShape('K7QM-3XR0'), false); // 0 is not in the alphabet
});

test('a code maps to one hidden sign-in account', () => {
  assert.equal(codeAuthEmail('k7qm-3xrp', 'demo.firebaseapp.com'), 'u-k7qm3xrp@demo.firebaseapp.com');
  assert.equal(codePassword('k7qm 3xrp'), codePassword('K7QM-3XRP'));
  assert.ok(codePassword('K7QM3XRP').length >= 6);
});
