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
  apiKey: 'AIzaSyCcxSFBCsLBdC0AIOCbEJbojcgTpcZYEoU',
  authDomain: 'paceglass-b1111.firebaseapp.com',
  projectId: 'paceglass-b1111',
  storageBucket: 'paceglass-b1111.firebasestorage.app',
  messagingSenderId: '571930623780',
  appId: '1:571930623780:web:59b8d6cc329682343ffdb1',
};

export const isCloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
