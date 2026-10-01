"use client";
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
  type UserCredential,
} from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export interface OwnerShop {
  id: string;
  name: string;
}

// Popup-first with graceful redirect fallback for browsers/PWAs with blocked popups
export async function signInWithGoogle(): Promise<UserCredential | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

// Call once on the landing page: completes a pending redirect sign-in.
// Throws on failure (e.g. auth/unauthorized-domain) — callers must catch
// and show friendlyAuthError, never swallow.
export async function completeRedirect(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || "";
    // If no redirect was pending or already consumed, ignore
    if (code === "auth/null-user" || !code) return null;
    throw err;
  }
}

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  if (code === "auth/unauthorized-domain")
    return "Sign-in is blocked from this address. Testing on a phone or LAN URL? Add the domain in Firebase console → Authentication → Settings → Authorized domains, then retry.";
  if (code === "auth/network-request-failed")
    return "Network hiccup during sign-in — check your connection and retry.";
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code")
    return "That sign-in link is expired or already used — go back and request a fresh one. (Links work once, and only the newest link counts.)";
  if (code === "auth/user-disabled")
    return "This account has been disabled — contact the shop owner.";
  return "Sign-in didn't finish — please try again.";
}

const EMAIL_KEY = "stockfindr-email-link";

export function sendEmailLink(email: string) {
  window.localStorage.setItem(EMAIL_KEY, email);
  return sendSignInLinkToEmail(auth, email, {
    url: window.location.origin + "/login",
    handleCodeInApp: true,
  });
}

export async function completeEmailLink(): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  const email =
    window.localStorage.getItem(EMAIL_KEY) ||
    window.prompt("Which email address did we send the sign-in link to?");
  if (!email) return null;
  const res = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_KEY);
  return res.user;
}

export function ownerSignOut() {
  return fbSignOut(auth);
}

export function useOwner() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);
  return { user, loading };
}

export async function listOwnerShops(uid: string): Promise<OwnerShop[]> {
  // Private per-user index — top-level shops has no list rule by design.
  const snap = await getDocs(collection(db, `users/${uid}/shops`));
  return snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || d.id }));
}
