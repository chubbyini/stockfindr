"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, writeBatch,
  serverTimestamp, Timestamp, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner } from "@/lib/auth/owner";
import { makeInviteCode } from "@/lib/auth/invite";
import { useSession } from "@/store/pos";
import RouteLoading from "@/components/brand/route-loading";

interface Invite {
  code: string;
  expiresAtMs: number;
  used: boolean;
}

export default function StaffPage() {
  const { user, loading } = useOwner();
  const { shopId } = useSession();
  const router = useRouter();
  const [staff, setStaff] = useState<{ id: string; name: string; role: string; active: boolean }[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!loading && user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, shopId]);

  async function refresh() {
    try {
      const s = await getDocs(collection(db, `shops/${shopId}/staff`));
      setStaff(s.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; role: string; active: boolean }) })));
      const shop = await getDoc(doc(db, `shops/${shopId}`));
      const codes = ((shop.data()?.inviteCodes as string[]) || []);
      const list: Invite[] = [];
      for (const c of codes.slice(-20)) {
        const inv = await getDoc(doc(db, `invites/${c}`));
        if (!inv.exists()) continue;
        const d = inv.data();
        list.push({
          code: c,
          expiresAtMs: (d.expiresAt as Timestamp)?.toMillis?.() || 0,
          used: !!d.usedBy,
        });
      }
      setInvites(list.filter((i) => !i.used && i.expiresAtMs > Date.now()));
    } catch {
      setMsg("Couldn't load — check your connection.");
    }
  }

  async function createInvite() {
    try {
      const shop = await getDoc(doc(db, `shops/${shopId}`));
      const code = makeInviteCode();
      const batch = writeBatch(db);
      batch.set(doc(db, `invites/${code}`), {
        shopId,
        shopName: (shop.data()?.name as string) || "your shop",
        createdBy: user!.uid,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86_400_000)),
      });
      batch.update(doc(db, `shops/${shopId}`), { inviteCodes: arrayUnion(code) });
      await batch.commit();
      refresh();
    } catch {
      setMsg("Couldn't create the invite.");
    }
  }

  async function revoke(code: string) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, `invites/${code}`));
      batch.update(doc(db, `shops/${shopId}`), { inviteCodes: arrayRemove(code) });
      await batch.commit();
      refresh();
    } catch {
      setMsg("Couldn't revoke the invite.");
    }
  }

  async function setActive(id: string, active: boolean) {
    try {
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, `shops/${shopId}/staff/${id}`), { active });
      refresh();
    } catch {
      setMsg("Couldn't update staff.");
    }
  }

  if (loading) return <RouteLoading label="Loading…" />;
  if (!user) {
    router.push("/");
    return <RouteLoading label="Loading…" />;
  }

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold">Staff & invites</h1>
      <div className="border rounded p-3 mt-3">
        <div className="flex justify-between items-center">
          <h2 className="font-bold">Invite codes (single-use, 7 days)</h2>
          <button onClick={createInvite} className="bg-green-700 text-white px-3 py-1 rounded text-sm">New invite</button>
        </div>
        {invites.map((i) => (
          <div key={i.code} className="flex justify-between items-center py-1 border-b">
            <span className="font-mono tracking-widest">{i.code}</span>
            <button onClick={() => revoke(i.code)} className="text-xs underline">Revoke</button>
          </div>
        ))}
        {!invites.length && <p className="text-sm text-gray-500 mt-1">No pending invites.</p>}
      </div>
      <div className="border rounded p-3 mt-3">
        <h2 className="font-bold">Team</h2>
        {staff.map((s) => (
          <div key={s.id} className="flex justify-between items-center py-1 border-b">
            <span>{s.name} <span className="text-xs text-gray-500">{s.role}{s.active ? "" : " (off)"}</span></span>
            <button onClick={() => setActive(s.id, !s.active)} className="text-xs underline">
              {s.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {!staff.length && <p className="text-sm text-gray-500 mt-1">Nobody yet — share an invite code.</p>}
      </div>
      {msg && <p className="text-sm mt-2 text-red-600">{msg}</p>}
      <nav className="mt-4 text-sm underline"><a href="/dashboard">Dashboard</a></nav>
    </main>
  );
}
