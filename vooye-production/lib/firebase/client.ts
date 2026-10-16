import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const required = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseAuth() {
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Firebase web configuration is missing: ${missing.join(", ")}. Configure the NEXT_PUBLIC_FIREBASE_* environment variables.`);
  }
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: required.apiKey,
    authDomain: required.authDomain,
    projectId: required.projectId,
    appId: required.appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  });
  return getAuth(app);
}
