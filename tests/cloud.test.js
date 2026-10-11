// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { friendlyError, isValidEmail, normaliseEmail } from '../js/cloud.js';
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
  assert.match(friendlyError({ code: 'auth/invalid-credential' }), /don't match/);
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
