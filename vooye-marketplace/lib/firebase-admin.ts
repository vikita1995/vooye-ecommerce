
import "server-only";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function firebaseAdminAuth() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

    if (!projectId) {
      throw new Error("Missing FIREBASE_ADMIN_PROJECT_ID.");
    }

    initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  return getAuth();
}

export async function verifyFirebaseIdToken(token: string) {
  return firebaseAdminAuth().verifyIdToken(token, true);
}
