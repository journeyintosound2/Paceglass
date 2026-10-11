// Cloud layer: Firebase Authentication for sign-in and Cloud Firestore for saving.
//
// Data in Firestore (see firestore.rules for who can read and write what):
//   admins/{uid}         set up by hand in the Firebase console; marks an admin account
//   members/{email}      people allowed to use Paceglass: { email, name, note, status, createdAt, ... }
//   userData/{uid}       one person's log: { state: JSON string, clientUpdatedAt, updatedAt }
//
// Admins manage members but cannot read anyone's userData. Each person's log is readable only by them.
//
// The Firebase SDK is loaded from Google's CDN only when the cloud is configured, so the app
// still works offline and in local-only mode. For automated UI tests, a fake backend with the
// same shape can be supplied as globalThis.__paceglassTestBackend.

import { firebaseConfig, isCloudConfigured } from './firebase-config.js';

export const FIREBASE_VERSION = '12.18.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

let backendPromise = null;

export function cloudEnabled() {
  return Boolean(globalThis.__paceglassTestBackend) || isCloudConfigured;
}

/** The backend, loading the Firebase SDK on first use. Rejects if it can't be loaded (e.g. offline). */
export function getBackend() {
  if (globalThis.__paceglassTestBackend) return Promise.resolve(globalThis.__paceglassTestBackend);
  if (!backendPromise) {
    backendPromise = createFirebaseBackend().catch((err) => {
      backendPromise = null; // allow a retry later
      throw err;
    });
  }
  return backendPromise;
}

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));
}

/** Turn Firebase error codes into plain sentences for the screen. */
export function friendlyError(err) {
  const code = err?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return 'That email and password don\'t match.';
  if (code.includes('invalid-email')) return 'That doesn\'t look like an email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes, or set a new password with the link below.';
  if (code.includes('network-request-failed') || code === 'unavailable') return 'Can\'t reach the server. Check your connection and try again.';
  if (code.includes('permission-denied')) return 'This account doesn\'t have permission to do that.';
  if (code.includes('user-disabled')) return 'This account has been turned off.';
  if (code.includes('weak-password')) return 'Choose a longer password.';
  return `Something went wrong${code ? ` (${code})` : ''}. Try again.`;
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('') + 'A!9';
}

async function createFirebaseBackend() {
  if (!isCloudConfigured) throw Object.assign(new Error('Firebase is not configured'), { code: 'not-configured' });
  const [appSdk, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try {
    // Keeps a local copy and queues writes while offline.
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.initializeFirestore(app, {});
  }

  const toUser = (u) => (u ? { uid: u.uid, email: normaliseEmail(u.email) } : null);
  const memberRef = (email) => F.doc(db, 'members', normaliseEmail(email));
  const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

  return {
    onAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },
    async signIn(email, password) {
      const cred = await A.signInWithEmailAndPassword(auth, normaliseEmail(email), password);
      return toUser(cred.user);
    },
    signOut() {
      return A.signOut(auth);
    },
    /** Sends Firebase's password reset email, used both for "set your password" invites and resets. */
    sendSetPasswordEmail(email) {
      return A.sendPasswordResetEmail(auth, normaliseEmail(email));
    },
    async getAccess(user) {
      const [adminSnap, memberSnap] = await Promise.all([
        F.getDoc(F.doc(db, 'admins', user.uid)).catch(() => null),
        F.getDoc(memberRef(user.email)).catch(() => null),
      ]);
      return {
        admin: Boolean(adminSnap && adminSnap.exists()),
        member: memberSnap && memberSnap.exists() ? memberSnap.data() : null,
      };
    },

    // ---- one person's log
    async loadUserData(uid) {
      const snap = await F.getDoc(F.doc(db, 'userData', uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return { stateJson: d.state, clientUpdatedAt: d.clientUpdatedAt || 0 };
    },
    saveUserData(uid, stateJson, clientUpdatedAt) {
      return F.setDoc(F.doc(db, 'userData', uid), { state: stateJson, clientUpdatedAt, updatedAt: F.serverTimestamp() });
    },

    // ---- admin
    async listMembers() {
      const snap = await F.getDocs(F.query(F.collection(db, 'members'), F.orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => {
        const x = d.data();
        return { ...x, email: d.id, createdAt: millis(x.createdAt), updatedAt: millis(x.updatedAt) };
      });
    },
    /**
     * Allow someone to use Paceglass: record them as a member, make sure they have a sign-in
     * account, and email them a link to set their own password. The admin never sees it.
     */
    async addMember({ email, name, note }) {
      const e = normaliseEmail(email);
      await F.setDoc(memberRef(e), {
        email: e,
        name: String(name || '').slice(0, 80),
        note: String(note || '').slice(0, 200),
        status: 'active',
        createdAt: F.serverTimestamp(),
        updatedAt: F.serverTimestamp(),
        createdBy: auth.currentUser ? auth.currentUser.uid : '',
      });
      // Create the sign-in account in a separate app instance so the admin stays signed in.
      let created = false;
      const temp = appSdk.initializeApp(firebaseConfig, `creator-${Date.now()}`);
      try {
        const tempAuth = A.getAuth(temp);
        await A.createUserWithEmailAndPassword(tempAuth, e, randomPassword());
        created = true;
        await A.signOut(tempAuth);
      } catch (err) {
        if (!String(err?.code).includes('email-already-in-use')) throw err;
      } finally {
        await appSdk.deleteApp(temp).catch(() => {});
      }
      let emailSent = false;
      try {
        await A.sendPasswordResetEmail(auth, e);
        emailSent = true;
      } catch { /* shown to the admin as "invite not sent" */ }
      return { created, emailSent };
    },
    setMemberStatus(email, status) {
      return F.updateDoc(memberRef(email), { status, updatedAt: F.serverTimestamp() });
    },
    removeMember(email) {
      return F.deleteDoc(memberRef(email));
    },
  };
}
