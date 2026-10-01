"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, collection, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { hashPin } from "@/lib/auth/pin";
import { normalizeCode } from "@/lib/auth/invite";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";

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
    <main className="max-w-sm mx-auto p-8">
      <h1 className="text-2xl font-bold">Join your shop</h1>
      {shopId ? (
        <>
          <p className="mt-2">Joining <b>{shopName}</b> (code {code})</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="border rounded w-full p-3 mt-4" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Choose a 4-digit PIN" inputMode="numeric" type="password" maxLength={6} className="border rounded w-full p-3 mt-2 text-center text-xl tracking-widest" />
          <button onClick={join} disabled={busy} className="mt-3 w-full bg-green-700 text-white py-3 rounded disabled:opacity-40">
            {busy ? "Joining…" : "Join and open the till"}
          </button>
        </>
      ) : (
        <>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code, e.g. K7Q2M4XD" className="border rounded w-full p-3 mt-4 text-center tracking-widest uppercase" />
          <button onClick={lookup} className="mt-3 w-full bg-green-700 text-white py-3 rounded">Find my shop</button>
        </>
      )}
      {msg && <p className="text-sm mt-2 text-red-600">{msg}</p>}
    </main>
  );
}
