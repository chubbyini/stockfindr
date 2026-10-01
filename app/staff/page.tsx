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
import { Badge, Btn, Card, Empty, Page, ErrorText } from "@/components/ui";

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

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMsg(`Copied ${code} — send it to your attendant.`);
    } catch {
      setMsg(code);
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
    <Page wide>
      <h1 className="text-xl font-bold tracking-tight">Staff & invites</h1>
      <Card className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">Invite codes</h2>
            <p className="text-xs text-stone-500">Single-use • expires in 7 days • tell it or send it</p>
          </div>
          <Btn size="sm" onClick={createInvite}>New invite</Btn>
        </div>
        <div className="mt-3 space-y-2">
          {invites.map((i) => (
            <div key={i.code} className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
              <span className="font-mono text-lg font-bold tracking-[0.25em]">{i.code}</span>
              <span className="flex gap-2">
                <Btn size="sm" variant="secondary" onClick={() => copyCode(i.code)}>Copy</Btn>
                <Btn size="sm" variant="ghost" onClick={() => revoke(i.code)}>Revoke</Btn>
              </span>
            </div>
          ))}
          {!invites.length && <Empty>No pending invites. Create one for each attendant.</Empty>}
        </div>
      </Card>
      <Card className="mt-3">
        <h2 className="font-bold">Team</h2>
        <div className="mt-2 divide-y divide-stone-100">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2">
                <b>{s.name}</b>
                <Badge tone={s.active ? "green" : "stone"}>{s.active ? s.role : "off"}</Badge>
              </span>
              <Btn size="sm" variant="ghost" onClick={() => setActive(s.id, !s.active)}>
                {s.active ? "Deactivate" : "Activate"}
              </Btn>
            </div>
          ))}
          {!staff.length && <Empty>Nobody yet — share an invite code above.</Empty>}
        </div>
      </Card>
      {msg && <ErrorText>{msg}</ErrorText>}
      <nav className="mt-4 text-sm">
        <a href="/dashboard" className="text-brand-800 underline underline-offset-4">← Dashboard</a>
      </nav>
    </Page>
  );
}
