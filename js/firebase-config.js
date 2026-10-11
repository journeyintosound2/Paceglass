// Firebase project settings for Paceglass.
//
// Paste the values from Firebase console → Project settings → General → Your apps → Web app.
// See docs/FIREBASE-SETUP.md for the full steps.
//
// These values identify the project; they are not secrets and are safe in a public repo.
// What keeps data safe is Firebase Authentication plus the rules in firestore.rules.
// Never put passwords or admin emails in this file.
//
// While apiKey is empty, Paceglass runs in local-only mode: no sign-in, data stays on the device.

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const isCloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
