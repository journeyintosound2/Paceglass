// Cloud layer: Firebase Authentication for sign-in and Cloud Firestore for saving.
//
// People sign in to the app with a personal code (see js/codes.js). Admins sign in to the admin
// console with email and password. The two use separate Firebase app instances, so being signed in
// to the admin console on a device doesn't sign you in to the app, and vice versa.
//
// Data in Firestore (see firestore.rules for who can read and write what):
//   admins/{uid}             set up by hand in the Firebase console; marks an admin account
//   members/{memberId}       a person: { name, note, code, authEmail, status, createdAt, ... }
//   accounts/{authEmail}     links a code's hidden sign-in account to its person: { memberId }
//   userData/{memberId}      that person's log: { state: JSON string, clientUpdatedAt, updatedAt }
//
// The log is keyed by person, not by code, so an admin can issue a new code without losing anything.
// Admins manage people but the rules don't let them read anyone's log.
//
// The Firebase SDK is loaded from Google's CDN only when needed. For automated UI tests, a fake
// backend with the same shape can be supplied as globalThis.__paceglassTestBackend.

import { codeAuthEmail, codePassword, generateCode, isCodeShape } from './codes.js';
import { firebaseConfig, isCloudConfigured } from './firebase-config.js';

export const FIREBASE_VERSION = '12.18.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const backends = {};

export function cloudEnabled() {
  return Boolean(globalThis.__paceglassTestBackend) || isCloudConfigured;
}

/**
 * The backend for 'app' (people signing in with a code) or 'admin' (the admin console).
 * Loads the Firebase SDK on first use; rejects if it can't be loaded (for example, offline).
 */
export function getBackend(role = 'app') {
  const testBackend = globalThis.__paceglassTestBackend;
  if (testBackend) return Promise.resolve(typeof testBackend === 'function' ? testBackend(role) : testBackend);
  if (!backends[role]) {
    backends[role] = createFirebaseBackend(role).catch((err) => {
      delete backends[role]; // allow a retry later
      throw err;
    });
  }
  return backends[role];
}

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));
}

/** Turn Firebase error codes into plain sentences for the screen. */
export function friendlyError(err, { signingInWithCode = false } = {}) {
  const code = err?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) {
    return signingInWithCode ? 'That code doesn\'t match. Check it and try again.' : 'That email and password don\'t match.';
  }
  if (code.includes('invalid-email')) return 'That doesn\'t look like an email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.';
  if (code.includes('network-request-failed') || code === 'unavailable') return 'Can\'t reach the server. Check your connection and try again.';
  if (code.includes('permission-denied')) return 'This account doesn\'t have permission to do that.';
  if (code.includes('user-disabled')) return 'This account has been turned off.';
  return `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
}

async function createFirebaseBackend(role) {
  if (!isCloudConfigured) throw Object.assign(new Error('Firebase is not configured'), { code: 'not-configured' });
  const [appSdk, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = appSdk.initializeApp(firebaseConfig, role === 'admin' ? 'paceglass-admin' : 'paceglass-app');
  const auth = A.getAuth(app);
  let db;
  try {
    db = role === 'app'
      // Keeps a local copy and queues writes while offline.
      ? F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) })
      : F.initializeFirestore(app, {});
  } catch {
    db = F.initializeFirestore(app, {});
  }
  const domain = firebaseConfig.authDomain;
  const toUser = (u) => (u ? { uid: u.uid, email: normaliseEmail(u.email) } : null);
  const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

  /** Create the hidden sign-in account for a fresh code, in a throwaway app so the admin stays signed in. */
  async function createCodeAccount() {
    const temp = appSdk.initializeApp(firebaseConfig, `code-maker-${Date.now()}`);
    try {
      const tempAuth = A.getAuth(temp);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          await A.createUserWithEmailAndPassword(tempAuth, codeAuthEmail(code, domain), codePassword(code));
          await A.signOut(tempAuth);
          return { code, authEmail: codeAuthEmail(code, domain) };
        } catch (err) {
          if (!String(err?.code).includes('email-already-in-use')) throw err;
        }
      }
      throw Object.assign(new Error('Could not make a unique code'), { code: 'code-collision' });
    } finally {
      await appSdk.deleteApp(temp).catch(() => {});
    }
  }

  return {
    onAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },
    signOut() {
      return A.signOut(auth);
    },

    // ---- app: people with codes
    async signInWithCode(code) {
      if (!isCodeShape(code)) throw Object.assign(new Error('bad code'), { code: 'auth/invalid-credential' });
      const cred = await A.signInWithEmailAndPassword(auth, codeAuthEmail(code, domain), codePassword(code));
      return toUser(cred.user);
    },
    /** Which person this sign-in belongs to, and whether they're active. Null if the code has been replaced or removed. */
    async getAccess(user) {
      const link = await F.getDoc(F.doc(db, 'accounts', user.email));
      if (!link.exists()) return null;
      const memberId = link.data().memberId;
      const m = await F.getDoc(F.doc(db, 'members', memberId));
      if (!m.exists()) return null;
      const d = m.data();
      return { memberId, name: d.name || '', status: d.status };
    },
    async loadUserData(memberId) {
      const snap = await F.getDoc(F.doc(db, 'userData', memberId));
      if (!snap.exists()) return null;
      const d = snap.data();
      return { stateJson: d.state, clientUpdatedAt: d.clientUpdatedAt || 0 };
    },
    saveUserData(memberId, stateJson, clientUpdatedAt) {
      return F.setDoc(F.doc(db, 'userData', memberId), { state: stateJson, clientUpdatedAt, updatedAt: F.serverTimestamp() });
    },

    // ---- admin console
    async signIn(email, password) {
      const cred = await A.signInWithEmailAndPassword(auth, normaliseEmail(email), password);
      return toUser(cred.user);
    },
    sendPasswordReset(email) {
      return A.sendPasswordResetEmail(auth, normaliseEmail(email));
    },
    async isAdmin(user) {
      const snap = await F.getDoc(F.doc(db, 'admins', user.uid));
      return snap.exists();
    },
    async listMembers() {
      const snap = await F.getDocs(F.query(F.collection(db, 'members'), F.orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => {
        const x = d.data();
        return { ...x, id: d.id, createdAt: millis(x.createdAt), updatedAt: millis(x.updatedAt) };
      });
    },
    /** Add a person and give them a new code. Returns { id, code }. */
    async addMember({ name, note }) {
      const { code, authEmail } = await createCodeAccount();
      const ref = F.doc(F.collection(db, 'members'));
      await F.setDoc(ref, {
        name: String(name || '').slice(0, 80),
        note: String(note || '').slice(0, 200),
        code,
        authEmail,
        status: 'active',
        createdAt: F.serverTimestamp(),
        updatedAt: F.serverTimestamp(),
        createdBy: auth.currentUser ? auth.currentUser.uid : '',
      });
      await F.setDoc(F.doc(db, 'accounts', authEmail), { memberId: ref.id });
      return { id: ref.id, code };
    },
    async updateMember(id, { name, note }) {
      const patch = { updatedAt: F.serverTimestamp() };
      if (name !== undefined) patch.name = String(name).slice(0, 80);
      if (note !== undefined) patch.note = String(note).slice(0, 200);
      return F.updateDoc(F.doc(db, 'members', id), patch);
    },
    /** Replace someone's code (for example, if it was shared). Their log stays with them. */
    async newCode(id) {
      const m = await F.getDoc(F.doc(db, 'members', id));
      if (!m.exists()) throw Object.assign(new Error('Not found'), { code: 'not-found' });
      const oldAuthEmail = m.data().authEmail;
      const { code, authEmail } = await createCodeAccount();
      await F.setDoc(F.doc(db, 'accounts', authEmail), { memberId: id });
      await F.updateDoc(F.doc(db, 'members', id), { code, authEmail, updatedAt: F.serverTimestamp() });
      if (oldAuthEmail) await F.deleteDoc(F.doc(db, 'accounts', oldAuthEmail)).catch(() => {});
      return code;
    },
    setMemberStatus(id, status) {
      return F.updateDoc(F.doc(db, 'members', id), { status, updatedAt: F.serverTimestamp() });
    },
    /** Remove a person: their code stops working and their log is deleted. */
    async removeMember(id) {
      const m = await F.getDoc(F.doc(db, 'members', id));
      if (m.exists() && m.data().authEmail) await F.deleteDoc(F.doc(db, 'accounts', m.data().authEmail)).catch(() => {});
      await F.deleteDoc(F.doc(db, 'userData', id)).catch(() => {});
      await F.deleteDoc(F.doc(db, 'members', id));
    },
  };
}

