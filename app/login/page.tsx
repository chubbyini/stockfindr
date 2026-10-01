"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Token from "@/components/brand/token";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";
import {
  signInWithGoogle,
  completeRedirect,
  completeEmailLink,
  friendlyAuthError,
  sendEmailLink,
  useOwner,
  listOwnerShops,
  ownerSignOut,
} from "@/lib/auth/owner";
import { useSession, knownShops, rememberShop } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import {
  verifyPin,
  hashPin,
  pinRateLimitCheck,
  pinRecordFailure,
  pinClearFailures,
} from "@/lib/auth/pin";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { StaffMember } from "@/lib/types";
import {
  IconGoogle,
  IconLock,
  IconStaff,
  IconStore,
  IconArrowRight,
  IconLogOut,
  IconCheck,
} from "@/components/icons";

export default function LoginPage() {
  const { user, loading: ownerLoading } = useOwner();
  const {
    shopId,
    shopName,
    role,
    staffId,
    staffName,
    deviceId,
    setSession,
    clear,
  } = useSession();
  const router = useRouter();

  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Attendant PIN unlock state
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [shopQuery, setShopQuery] = useState("");
  const [attendantEmail, setAttendantEmail] = useState("");
  const [pin, setPin] = useState("");
  const [attendantBusy, setAttendantBusy] = useState(false);

  // Process incoming redirect or email link
  useEffect(() => {
    (async () => {
      try {
        await completeRedirect();
      } catch (e) {
        setMsg(friendlyAuthError(e));
      }
      await completeEmailLink().catch(() => null);
    })();
  }, []);

  // Build known shop list for attendant dropdown / autocomplete
  useEffect(() => {
    (async () => {
      const merged = new Map<string, string>();
      for (const s of knownShops()) merged.set(s.id, s.name);
      if (user) {
        try {
          const snap = await getDocs(collection(db, `users/${user.uid}/shops`));
          snap.docs.forEach((d) => {
            const n = (d.data().name as string) || d.id;
            merged.set(d.id, n);
            rememberShop(d.id, n);
          });
        } catch {
          /* offline */
        }
      }
      const list = [...merged.entries()].map(([id, name]) => ({
        id,
        name: name === id ? `Shop ${id.slice(0, 6)}…` : name,
      }));
      setShops(list);
      const current = list.find((s) => s.id === shopId);
      if (current && !current.name.startsWith("Shop ")) {
        setShopQuery(current.name);
      }
    })();
  }, [user, shopId]);

  // When Firebase user is authenticated, resolve owner shops and route to /dashboard
  useEffect(() => {
    if (ownerLoading || !user) return;
    let active = true;

    (async () => {
      try {
        const ownerShops = await listOwnerShops(user.uid);
        if (!active) return;

        if (ownerShops.length > 0) {
          const last = localStorage.getItem("tilltrail-shop");
          const pick = ownerShops.find((s) => s.id === last) || ownerShops[0];
          const name = user.displayName || user.email?.split("@")[0] || "Owner";
          setSession({
            shopId: pick.id,
            shopName: pick.name,
            role: "owner",
            staffId: `owner-${user.uid}`,
            staffName: name,
            staffEmail: user.email || "",
          });
          router.replace("/dashboard");
        } else if (localStorage.getItem("stockfindr-entry") === "attendant") {
          router.replace("/join");
        } else {
          router.replace("/onboarding");
        }
      } catch {
        if (active) {
          setMsg("Could not fetch your shops. Please check your network and retry.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [user, ownerLoading, router, setSession]);

  async function handleGoogleSignIn() {
    setMsg("");
    setAuthenticating(true);
    try {
      localStorage.setItem("stockfindr-entry", "owner");
      await signInWithGoogle();
    } catch (e) {
      setMsg(friendlyAuthError(e));
      setAuthenticating(false);
    }
  }

  async function handleSendEmailLink() {
    if (!ownerEmail.includes("@")) {
      setMsg("Please enter a valid email address.");
      return;
    }
    setMsg("");
    setAuthenticating(true);
    try {
      localStorage.setItem("stockfindr-entry", "owner");
      await sendEmailLink(ownerEmail.trim().toLowerCase());
      setLinkSent(true);
      setAuthenticating(false);
    } catch {
      setMsg("Could not send sign-in link. Please check your address and network.");
      setAuthenticating(false);
    }
  }

  function resolveShop(): { id: string; name: string } | null {
    const q = shopQuery.trim().toLowerCase();
    if (!q) return null;
    return (
      shops.find((s) => s.name.toLowerCase() === q || s.id.toLowerCase() === q) || null
    );
  }

  async function restoreAccess(resolvedId: string): Promise<boolean> {
    if (!user) return false;
    try {
      let mine = await getDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`));
      if (!mine.exists()) {
        const shopSnap = await getDoc(doc(db, `shops/${resolvedId}`));
        if (shopSnap.exists() && shopSnap.data()?.ownerUid === user.uid) {
          const defaultHash = await hashPin("1234");
          const name = user.displayName || user.email?.split("@")[0] || "Owner";
          const emailLc = (user.email || "").toLowerCase();
          await setDoc(
            doc(db, `shops/${resolvedId}/staff/${user.uid}`),
            {
              shopId: resolvedId,
              name,
              email: emailLc,
              role: "owner",
              pinHash: defaultHash,
              active: true,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
          mine = await getDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`));
        }
      }
      if (!mine.exists()) return false;
      const me = { id: mine.id, shopId: resolvedId, ...mine.data() } as StaffMember;
      if (me.active !== false && (me.pinHash || "").length > 0) {
        await tilldb.staff.put(me);
        return true;
      }
    } catch {
      /* offline */
    }
    return false;
  }

  async function handleAttendantPinLogin() {
    setMsg("");
    const hit = resolveShop();
    if (!hit) {
      setMsg(
        shops.length
          ? `Unknown shop. Registered on device: ${shops.map((s) => s.name).join(", ")}.`
          : "No shops registered on this device yet. Join with an invite code first."
      );
      return;
    }
    if (!attendantEmail.includes("@") || pin.length < 4) {
      setMsg("Staff email and 4-digit PIN required.");
      return;
    }

    const gate = pinRateLimitCheck(deviceId);
    if (gate.blocked) {
      setMsg(`Too many attempts. Locked — retry in ${gate.retryAfterSec}s.`);
      return;
    }

    setAttendantBusy(true);
    try {
      const emailLc = attendantEmail.trim().toLowerCase();
      let team = await tilldb.staff.where("shopId").equals(hit.id).toArray();
      if (!team.length) {
        if (await restoreAccess(hit.id)) {
          team = await tilldb.staff.where("shopId").equals(hit.id).toArray();
        } else {
          setMsg(`No team profiles found for ${hit.name}. Join with an invite code first.`);
          setAttendantBusy(false);
          return;
        }
      }

      let ok: StaffMember | null = null;
      for (const s of team) {
        if (!s.active) continue;
        if ((s.email || "").toLowerCase() !== emailLc) continue;
        if (await verifyPin(pin, s.pinHash)) {
          ok = s;
          break;
        }
      }

      if (!ok) {
        pinRecordFailure(deviceId);
        setMsg("Invalid shop name, email, or PIN.");
        setAttendantBusy(false);
        return;
      }

      pinClearFailures(deviceId);
      setSession({
        shopId: hit.id,
        shopName: hit.name,
        staffId: ok.id,
        staffName: ok.name,
        staffEmail: ok.email || "",
        role: ok.role,
      });

      // Flow requirement: attendants go to /attendant, owners go to /dashboard
      if (ok.role === "owner") {
        router.replace("/dashboard");
      } else {
        router.replace("/attendant");
      }
    } catch {
      setMsg("Authentication error. Please retry.");
    } finally {
      setAttendantBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      clear();
      await ownerSignOut();
      setLinkSent(false);
      setOwnerEmail("");
      setMsg("Signed out successfully.");
    } catch {
      setMsg("Failed to sign out.");
    }
  }

  if (ownerLoading || authenticating) {
    return <RouteLoading label="Authenticating session…" />;
  }

  return (
    <Page>
      <div className="mx-auto max-w-lg py-6 sm:py-12">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <Token size={72} spinning={false} />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 dark:text-white">
            Stockfindr
          </h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            Offline-first inventory, point-of-sale, and retail management
          </p>
        </div>

        {/* Role Segment Switcher */}
        <div className="mt-6 flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-800 dark:bg-stone-900">
          <button
            type="button"
            onClick={() => {
              setMode("owner");
              setMsg("");
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${
              mode === "owner"
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            <IconStore className="size-4" />
            <span>Shop Owner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("staff");
              setMsg("");
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${
              mode === "staff"
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            <IconStaff className="size-4" />
            <span>Counter Attendant</span>
          </button>
        </div>

        {/* Main Card */}
        <Card className="mt-4 p-6 sm:p-8">
          {mode === "owner" ? (
            /* OWNER SIGN-IN -> /dashboard */
            <div>
              <div className="border-b border-stone-100 pb-5 dark:border-stone-800">
                <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">
                  Owner Sign In
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Access owner analytics, register controls, stock management, and staff permissions.
                </p>
              </div>

              {user ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <p className="font-semibold">Signed in as Owner</p>
                    <p className="mt-0.5 text-xs opacity-90">{user.email}</p>
                  </div>
                  <Btn
                    size="lg"
                    className="w-full font-semibold"
                    onClick={() => router.replace("/dashboard")}
                  >
                    <span>Enter Owner Dashboard</span>
                    <IconArrowRight className="size-4 ml-1.5" />
                  </Btn>
                  <Btn
                    variant="secondary"
                    size="md"
                    className="w-full font-medium"
                    onClick={handleSignOut}
                  >
                    <IconLogOut className="size-4 mr-1.5" />
                    <span>Sign Out / Switch Account</span>
                  </Btn>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 active:scale-[0.99] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <IconGoogle className="size-5 shrink-0" />
                    <span>Continue with Google</span>
                  </button>

                  <div className="flex items-center gap-3 text-xs text-stone-400">
                    <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
                    <span>or passwordless email link</span>
                    <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
                  </div>

                  <Field label="Owner Email Address">
                    <input
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@enterprise.com"
                      type="email"
                      autoComplete="email"
                      className={inputCls}
                    />
                  </Field>

                  <Btn
                    size="lg"
                    className="w-full font-semibold"
                    onClick={handleSendEmailLink}
                  >
                    {linkSent ? "Resend Sign-In Link" : "Send Magic Sign-In Link"}
                  </Btn>

                  {linkSent && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Check your email inbox. Tap the link to sign in automatically.
                    </div>
                  )}
                </div>
              )}

              {msg && <ErrorText>{msg}</ErrorText>}

              <div className="mt-6 border-t border-stone-100 pt-5 text-center dark:border-stone-800">
                <p className="text-xs text-stone-500">
                  Looking for the counter register?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("staff")}
                    className="font-semibold text-stone-900 underline underline-offset-4 dark:text-stone-100"
                  >
                    Attendant PIN Unlock
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* ATTENDANT SIGN-IN -> /attendant */
            <div>
              <div className="border-b border-stone-100 pb-5 dark:border-stone-800">
                <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">
                  Counter Attendant Till Unlock
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Fast offline counter access. Enter shop name, staff email, and 4-digit PIN.
                </p>
              </div>

              {/* If attendant is already signed in on this device */}
              {role === "attendant" && staffId && shopId ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <p className="font-semibold">Active Attendant Session</p>
                    <p className="mt-0.5 text-xs opacity-90">
                      {staffName} • {shopName}
                    </p>
                  </div>
                  <Btn
                    size="lg"
                    className="w-full font-semibold"
                    onClick={() => router.replace("/attendant")}
                  >
                    <span>Enter Attendant Till</span>
                    <IconArrowRight className="size-4 ml-1.5" />
                  </Btn>
                  <Btn
                    variant="secondary"
                    size="md"
                    className="w-full font-medium"
                    onClick={() => {
                      clear();
                      setMsg("Attendant session cleared.");
                    }}
                  >
                    <span>Lock / Switch Attendant</span>
                  </Btn>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <Field label="Shop Name" hint="Registered work or shop name.">
                    <div className="relative">
                      <input
                        value={shopQuery}
                        onChange={(e) => setShopQuery(e.target.value)}
                        placeholder="e.g. Tunde Enterprise"
                        list="login-known-shops"
                        autoComplete="off"
                        className={inputCls}
                      />
                      <datalist id="login-known-shops">
                        {shops.map((s) => (
                          <option key={s.id} value={s.name} />
                        ))}
                      </datalist>
                    </div>
                  </Field>

                  <Field label="Staff Email">
                    <input
                      value={attendantEmail}
                      onChange={(e) => setAttendantEmail(e.target.value)}
                      placeholder="attendant@shop.com"
                      type="email"
                      autoComplete="email"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="4-Digit Security PIN">
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAttendantPinLogin();
                      }}
                      placeholder="••••"
                      inputMode="numeric"
                      type="password"
                      maxLength={6}
                      className={`${inputCls} text-center text-xl tracking-[0.4em] font-semibold`}
                    />
                  </Field>

                  <Btn
                    size="lg"
                    className="w-full font-semibold"
                    disabled={attendantBusy}
                    onClick={handleAttendantPinLogin}
                  >
                    <span>{attendantBusy ? "Verifying PIN…" : "Open Counter Till"}</span>
                    <IconArrowRight className="size-4 ml-1.5" />
                  </Btn>
                </div>
              )}

              {msg && <ErrorText>{msg}</ErrorText>}

              <div className="mt-6 border-t border-stone-100 pt-5 text-center dark:border-stone-800">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <IconCheck className="size-3.5" />
                  <span>Full Offline Counter Support</span>
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  First time on this device?{" "}
                  <a
                    href="/join"
                    className="font-semibold text-stone-900 underline underline-offset-4 dark:text-stone-100"
                  >
                    Join shop with invite code
                  </a>
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  Are you the business owner?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("owner")}
                    className="font-semibold text-stone-900 underline underline-offset-4 dark:text-stone-100"
                  >
                    Sign in with Google / Email
                  </button>
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
