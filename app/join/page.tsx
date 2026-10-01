"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, getDocs, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { hashPin } from "@/lib/auth/pin";
import { normalizeCode } from "@/lib/auth/invite";
import { sendEmailLink, useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";
import { IconStaff, IconCheck } from "@/components/icons";

// Attendant onboarding v2: email-link identity FIRST (this is how we know
// it's Emeka — Firebase uid), then invite code, then name + PIN.
// The staff profile id IS the Firebase uid: one person, one profile per shop.
export default function JoinPage() {
  const router = useRouter();
  const { user, loading } = useOwner();
  const { setSession } = useSession();
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState("");
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [myShops, setMyShops] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, `users/${user.uid}/shops`))
      .then((s) => setMyShops(s.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || d.id }))))
      .catch(() => {});
  }, [user]);

  async function sendLink() {
    if (!email.includes("@")) { setMsg("Enter your email address."); return; }
    try {
      await sendEmailLink(email.trim().toLowerCase());
      setLinkSent(true);
      setMsg("");
    } catch {
      setMsg("Couldn't send the link — check the address and connection.");
    }
  }

  async function lookup() {
    setMsg("");
    const c = normalizeCode(code);
    if (!c) { setMsg("Enter the code your owner gave you."); return; }
    try {
      const snap = await getDoc(doc(db, `invites/${c}`));
      if (!snap.exists()) { setMsg("Code not found — check it and try again."); return; }
      const d = snap.data() as { shopName?: string; shopId?: string; usedBy?: string; expiresAt?: { toMillis: () => number } };
      if (d.usedBy || (d.expiresAt && d.expiresAt.toMillis() < Date.now())) {
        setMsg("This code is used or expired — ask your owner for a fresh one.");
        return;
      }
      setShopName(d.shopName || "your shop");
      setShopId(d.shopId || null);
      setCode(c);
    } catch {
      setMsg("Couldn't check the code — check your connection.");
    }
  }

  async function join() {
    if (!user || !shopId || !name.trim() || pin.length < 4) {
      setMsg("Name + a PIN of 4+ digits required.");
      return;
    }
    setBusy(true);
    try {
      const emailLc = (user.email || email).trim().toLowerCase();
      const pinHash = await hashPin(pin);
      const batch = writeBatch(db);
      // Own profile, keyed by Firebase uid — proves who is signing in.
      batch.set(doc(db, `shops/${shopId}/staff/${user.uid}`), {
        shopId,
        name: name.trim(),
        email: emailLc,
        role: "attendant",
        pinHash,
        active: true,
        inviteCode: code,
        updatedAt: Date.now(),
      });
      // Own attendant seat — rules only allow this with a live invite code.
      batch.set(doc(db, `shops/${shopId}/members/${user.uid}`), {
        role: "attendant",
        inviteCode: code,
      });
      // Private shop index for this person (drives /login routing).
      batch.set(doc(db, `users/${user.uid}/shops/${shopId}`), {
        name: shopName || "your shop",
        role: "attendant",
        createdAt: serverTimestamp(),
      });
      // Burn the code (fails the whole batch if just used — no half-joins).
      batch.update(doc(db, `invites/${code}`), { usedBy: user.uid, usedAt: Date.now() });
      await batch.commit();
      await tilldb.staff.put({
        id: user.uid, shopId, name: name.trim(), email: emailLc, role: "attendant",
        pinHash, active: true, updatedAt: Date.now(),
      });
      setSession({ shopId, staffId: user.uid, staffName: name.trim(), staffEmail: emailLc, role: "attendant", shopName: shopName || "your shop" });
      router.push("/sell");
    } catch {
      setMsg("Couldn't join — the code may have just been used. Ask for a fresh one.");
      setBusy(false);
    }
  }

  async function enter(shop: { id: string; name: string }) {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, `shops/${shop.id}/staff/${user.uid}`));
      const d = snap.data() as { name?: string; email?: string; pinHash?: string; active?: boolean } | undefined;
      if (!d || d.active === false) { setMsg("No active profile there — join with a fresh code."); return; }
      await tilldb.staff.put({
        id: user.uid, shopId: shop.id, name: d.name || "Attendant", email: d.email || "",
        role: "attendant", pinHash: d.pinHash || "", active: true, updatedAt: Date.now(),
      });
      setSession({ shopId: shop.id, staffId: user.uid, staffName: d.name || "Attendant", staffEmail: d.email || "", role: "attendant", shopName: shop.name });
      router.push("/sell");
    } catch {
      setMsg("Couldn't open that shop — check your connection.");
    }
  }

  if (loading) return <RouteLoading label="Loading…" />;

  return (
    <Page>
      <div className="mx-auto max-w-md py-6 sm:py-12">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
              <IconStaff className="size-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Join Your Shop Team</h1>
            <p className="mt-1 text-sm text-stone-500">Connect your account with an owner invite code.</p>
          </div>

          {!user ? (
            <div className="mt-6 space-y-4">
              <Field label="Your Work Email" hint="We send a one-tap sign-in link. This confirms your staff identity.">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" className={inputCls} />
              </Field>
              <Btn size="lg" className="w-full font-semibold" onClick={sendLink}>
                {linkSent ? "Resend Sign-In Link" : "Send Sign-In Link"}
              </Btn>
              {linkSent && <p className="text-sm text-stone-600 dark:text-stone-400">Check your email inbox and tap the link to continue setup.</p>}
            </div>
          ) : myShops.length > 0 && !shopId ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                <IconCheck className="size-4 text-emerald-600" />
                <span>Signed in as <b>{user.email}</b></span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Your Registered Shops:</p>
              {myShops.map((s) => (
                <Btn key={s.id} variant="secondary" className="w-full justify-between" onClick={() => enter(s)}>
                  <span>Enter {s.name}</span>
                  <span className="text-xs font-normal text-stone-400">→</span>
                </Btn>
              ))}
              <Btn variant="ghost" size="sm" className="w-full text-stone-500" onClick={() => setMyShops([])}>
                Join a different shop with an invite code
              </Btn>
            </div>
          ) : !shopId ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <IconCheck className="size-4 text-emerald-600" />
                <span>Signed in as {user.email}</span>
              </div>
              <Field label="Staff Invite Code" hint="8-character code provided by your shop owner.">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="K7Q2M4XD"
                  className={`${inputCls} text-center font-mono text-xl tracking-[0.3em] uppercase font-bold`}
                />
              </Field>
              <Btn size="lg" className="w-full font-semibold" onClick={lookup}>
                Verify Invite Code
              </Btn>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
                <p className="font-semibold text-stone-700 dark:text-stone-300">Target Shop</p>
                <p className="text-lg font-bold">{shopName}</p>
                <p className="mt-1 text-xs font-mono text-stone-500">Invite Code: {code}</p>
              </div>

              <Field label="Your Full Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emeka Okafor" className={inputCls} />
              </Field>

              <Field label="Set Your 4-Digit Counter PIN" hint="Used for daily register unlock on counter devices.">
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  inputMode="numeric"
                  type="password"
                  maxLength={6}
                  className={`${inputCls} text-center text-2xl tracking-[0.5em] font-semibold`}
                />
              </Field>

              <Btn size="lg" className="w-full font-semibold" onClick={join} disabled={busy}>
                {busy ? "Joining Shop..." : "Join & Open Till"}
              </Btn>
            </div>
          )}

          {msg && <ErrorText>{msg}</ErrorText>}
        </Card>
      </div>
    </Page>
  );
}

