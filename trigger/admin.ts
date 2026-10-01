import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

/**
 * Server-side Firestore via service-account key.
 *
 * IMPORTANT: FIREBASE_SERVICE_ACCOUNT_JSON must belong to the SAME project
 * as the data (stocfindr). A key from another project will authenticate but
 * every read/write will fail with permission-denied. Override the target
 * project explicitly with FIREBASE_ADMIN_PROJECT_ID when needed.
 */
export function adminDb(): Firestore {
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    const key = JSON.parse(raw);
    const projectId =
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      key.project_id;
    app = getApps()[0] ?? initializeApp({ credential: cert(key), projectId });
  }
  return getFirestore(app);
}

export { FieldValue };
