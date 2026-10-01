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
      setMsg("Name + a PIN of 4+ digits.");
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
      setSession({ shopId, staffId: user.uid, staffName: name.trim(), staffEmail: emailLc, role: "attendant" });
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
      setSession({ shopId: shop.id, staffId: user.uid, staffName: d.name || "Attendant", staffEmail: d.email || "", role: "attendant" });
      router.push("/sell");
    } catch {
      setMsg("Couldn't open that shop — check your connection.");
    }
  }

  if (loading) return <RouteLoading label="Loading…" />;

  return (
    <Page>
      <Card className="mt-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Join your shop</h1>
        {!user ? (
          <div className="mt-4 space-y-4">
            <Field label="Your email" hint="We send a one-tap sign-in link. This is how your shop knows it's you.">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" className={inputCls} />
            </Field>
            <Btn size="lg" className="w-full" onClick={sendLink}>
              {linkSent ? "Resend link" : "Send me a sign-in link"}
            </Btn>
            {linkSent && <p className="text-sm text-stone-600">Check your inbox and tap the link — then come back here.</p>}
          </div>
        ) : myShops.length > 0 && !shopId ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-stone-600">Signed in as {user.email}. Your shops:</p>
            {myShops.map((s) => (
              <Btn key={s.id} variant="secondary" className="w-full" onClick={() => enter(s)}>
                Enter {s.name}
              </Btn>
            ))}
            <Btn variant="ghost" size="sm" onClick={() => setMyShops([])}>
              Join a different shop with a code
            </Btn>
          </div>
        ) : !shopId ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-stone-600">Signed in as {user.email} ✓</p>
            <Field label="Invite code" hint="8 letters from your owner — works once.">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7Q2M4XD" className={`${inputCls} text-center font-mono text-xl tracking-[0.3em] uppercase`} />
            </Field>
            <Btn size="lg" className="w-full" onClick={lookup}>Find my shop</Btn>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
              Joining <b>{shopName}</b> as {user.email}
              <br />
              <span className="font-mono tracking-widest">Code {code}</span>
            </div>
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emeka" className={inputCls} />
            </Field>
            <Field label="Choose a 4-digit PIN" hint="For the shared counter — quick unlock, offline.">
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" inputMode="numeric" type="password" maxLength={6} className={`${inputCls} text-center text-2xl tracking-[0.5em]`} />
            </Field>
            <Btn size="lg" className="w-full" onClick={join} disabled={busy}>
              {busy ? "Joining…" : "Join and open the till"}
            </Btn>
          </div>
        )}
        {msg && <ErrorText>{msg}</ErrorText>}
      </Card>
    </Page>
  );
}
