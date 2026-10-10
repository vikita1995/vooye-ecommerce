import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function firebaseAdminAuth() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin environment variables.");
    }
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }
  return getAuth();
}

export async function verifyFirebaseIdToken(token: string) {
  return firebaseAdminAuth().verifyIdToken(token, true);
}
