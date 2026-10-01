import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export interface SyncDiagnosis {
  signedIn: boolean;
  email: string;
  uid: string;
  isMember: boolean;
  role: string;
  blocked: boolean;
  fix: string;
}

// Answers "why won't this till sync?" in plain language. Every check is
// read-only and fails soft — it must work even when rules deny everything.
export async function diagnoseSync(shopId: string): Promise<SyncDiagnosis> {
  const user = auth.currentUser;
  if (!user) {
    return {
      signedIn: false,
      email: "",
      uid: "",
      isMember: false,
      role: "",
      blocked: true,
      fix: "Till not signed in. Open /login on this device with the attendant's email, then enter the shop.",
    };
  }
  try {
    const m = await getDoc(doc(db, `shops/${shopId}/members/${user.uid}`));
    if (!m.exists()) {
      // Founder path: ownerUid covers founders without member docs.
      const s = await getDoc(doc(db, "shops", shopId));
      if ((s.data()?.ownerUid as string) === user.uid) {
        return {
          signedIn: true,
          email: user.email || "",
          uid: user.uid,
          isMember: true,
          role: "owner",
          blocked: false,
          fix: "",
        };
      }
      return {
        signedIn: true,
        email: user.email || "",
        uid: user.uid,
        isMember: false,
        role: "",
        blocked: true,
        fix: "Signed in, but no seat in this shop. Get a fresh invite code and rejoin — then sync resumes.",
      };
    }
    return {
      signedIn: true,
      email: user.email || "",
      uid: user.uid,
      isMember: true,
      role: (m.data()?.role as string) || "attendant",
      blocked: false,
      fix: "",
    };
  } catch {
    return {
      signedIn: true,
      email: user.email || "",
      uid: user.uid,
      isMember: false,
      role: "",
      blocked: true,
      fix: "Can't reach the server to verify membership. Check connection — or the rules on the server may be older than the app. Redeploy firestore.rules.",
    };
  }
}
