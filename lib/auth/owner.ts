"use client";
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export interface OwnerShop {
  id: string;
  name: string;
}

// Redirect (not popup): popups die inside mobile browsers and installed PWAs.
export function signInWithGoogle() {
  return signInWithRedirect(auth, new GoogleAuthProvider());
}

// Call once on the landing page: completes a pending redirect sign-in.
export async function completeRedirect(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch {
    return null;
  }
}

const EMAIL_KEY = "stockfindr-email-link";

export function sendEmailLink(email: string) {
  window.localStorage.setItem(EMAIL_KEY, email);
  return sendSignInLinkToEmail(auth, email, {
    url: window.location.origin + "/",
    handleCodeInApp: true,
  });
}

export async function completeEmailLink(): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  const email = window.localStorage.getItem(EMAIL_KEY) || window.prompt("Email?");
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
  const snap = await getDocs(query(collection(db, "shops"), where("ownerUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || d.id }));
}
