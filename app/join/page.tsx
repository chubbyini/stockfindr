"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, collection, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { hashPin } from "@/lib/auth/pin";
import { normalizeCode } from "@/lib/auth/invite";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import { Badge, Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

export default function JoinPage() {
  const router = useRouter();
  const { setSession } = useSession();
  const [code, setCode] = useState("");
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!shopId || !name.trim() || pin.length < 4) {
      setMsg("Name + a PIN of 4+ digits.");
      return;
    }
    setBusy(true);
    try {
      const pinHash = await hashPin(pin);
      const staffRef = doc(collection(db, `shops/${shopId}/staff`));
      const batch = writeBatch(db);
      batch.set(staffRef, {
        shopId,
        name: name.trim(),
        role: "attendant",
        pinHash,
        active: true,
        inviteCode: code,
        updatedAt: Date.now(),
      });
      // Burns the code. Rules reject this if someone else burned it first
      // (batched writes fail together, so no half-joined staff record).
      batch.update(doc(db, `invites/${code}`), { usedBy: staffRef.id, usedAt: Date.now() });
      await batch.commit();
      await tilldb.staff.put({
        id: staffRef.id, shopId, name: name.trim(), role: "attendant",
        pinHash, active: true, updatedAt: Date.now(),
      });
      setSession({ shopId, staffId: staffRef.id, staffName: name.trim(), role: "attendant" });
      router.push("/sell");
    } catch {
      setMsg("Couldn't join — the code may have just been used. Ask for a fresh one.");
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="mt-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Join your shop</h1>
        {shopId ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
              Joining <b>{shopName}</b>
              <br />
              <span className="font-mono tracking-widest">Code {code}</span>
            </div>
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emeka" className={inputCls} />
            </Field>
            <Field label="Choose a 4-digit PIN" hint="You'll tap this in every day to open the till.">
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" inputMode="numeric" type="password" maxLength={6} className={`${inputCls} text-center text-2xl tracking-[0.5em]`} />
            </Field>
            <Btn size="lg" className="w-full" onClick={join} disabled={busy}>
              {busy ? "Joining…" : "Join and open the till"}
            </Btn>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Field label="Invite code" hint="8 letters from your owner — works once.">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7Q2M4XD" className={`${inputCls} text-center font-mono text-xl tracking-[0.3em] uppercase`} />
            </Field>
            <Btn size="lg" className="w-full" onClick={lookup}>Find my shop</Btn>
          </div>
        )}
        {msg && <ErrorText>{msg}</ErrorText>}
      </Card>
    </Page>
  );
}
