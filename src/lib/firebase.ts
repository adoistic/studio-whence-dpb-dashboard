import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// Artifact storage is Cloudflare R2 (fronted by an auth-validating Worker), not
// Firebase Storage — see the gated-download design. No getStorage here.

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// HMR/SSR-safe: reuse the existing app if already initialized.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
// Always show Google's account chooser. Without this, Google silently reuses
// whichever account the browser is already signed into, so a user with two
// accounts cannot switch: signing out and back in lands them on the same one
// with no prompt. This is the only way to change accounts from the portal.
googleProvider.setCustomParameters({ prompt: 'select_account' })
