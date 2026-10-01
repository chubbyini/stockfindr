"use client";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import type { StaffMember } from "@/lib/types";
import Token from "@/components/brand/token";
import { Badge, Btn, Card, Empty, Page, ErrorText } from "@/components/ui";

// Counter fast path: tap your name, enter PIN. Works fully offline against
// the cached team. First time on a device? Join with a code instead.
export default function PinPage() {
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [picked, setPicked] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const { shopId, shopName, deviceId, setSession } = useSession();
  const [noIdentity, setNoIdentity] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (u) => setNoIdentity(!u)), []);
  const { user } = useOwner();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const local = (await tilldb.staff.where("shopId").equals(shopId).toArray())
        .filter((s) => s.active);
      if (local.length) setTeam(local);
      if (!user) return;
      try {
        // Whole team (needs membership — attendants get it at join).
        const snap = await getDocs(collection(db, `shops/${shopId}/staff`));
        const remote = snap.docs.map((d) => ({ id: d.id, shopId, ...d.data() } as StaffMember));
        if (remote.length) {
          await tilldb.staff.bulkPut(remote);
          setTeam(remote.filter((s) => s.active));
          return;
        }
      } catch { /* fall through to self-restore */ }
      if (local.length) return;
      try {
        // Fresh device: nothing cached and the team list unreadable — pull
        // just my own UID-keyed profile, no invite code needed twice.
        const mirror = await getDoc(doc(db, `users/${user.uid}/shops/${shopId}`));
        if (!mirror.exists()) return;
        const mine = await getDoc(doc(db, `shops/${shopId}/staff/${user.uid}`));
        if (!mine.exists()) return;
        const me = { id: mine.id, shopId, ...mine.data() } as StaffMember;
        if (me.active !== false && (me.pinHash || "").length > 0) {
          await tilldb.staff.put(me);
          setTeam([me]);
        }
      } catch { /* offline — join with a code instead */ }
    })();
  }, [shopId, user]);

  async function login() {
    if (!picked) return;
    const gate = pinRateLimitCheck(deviceId);
    if (gate.blocked) { setMsg(`Locked — retry in ${gate.retryAfterSec}s`); return; }
    if (await verifyPin(pin, picked.pinHash)) {
      pinClearFailures(deviceId);
      setSession({ staffId: picked.id, staffName: picked.name, staffEmail: picked.email || "", role: picked.role });
      router.push("/sell");
    } else {
      pinRecordFailure(deviceId);
      setMsg(`Wrong PIN for ${picked.name} — try again.`);
    }
  }

  return (
    <Page>
      <Card className="mt-8 p-6 text-center">
        <div className="flex justify-center">
          <Token size={64} spinning={false} />
        </div>
        <h1 className="mt-2 text-2xl font-bold">Open the till</h1>
        {shopName ? <p className="mt-0.5 text-sm font-semibold text-brand-800">{shopName}</p> : null}
        {noIdentity && team.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Till not connected — sales will queue but can&apos;t sync yet.
            <br />
            <Btn size="sm" variant="secondary" onClick={() => router.push("/login")} className="mt-2">
              Reconnect this till
            </Btn>
          </div>
        )}
        {!team.length ? (
          <div className="mt-4">
            <Empty>No team on this device yet.</Empty>
            <Btn className="mt-3 w-full" onClick={() => router.push("/join")}>
              Join your shop with a code
            </Btn>
          </div>
        ) : !picked ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-stone-500">Who&apos;s selling?</p>
            {team.map((s) => (
              <Btn key={s.id} variant="secondary" size="lg" className="w-full" onClick={() => { setPicked(s); setMsg(""); }}>
                {s.name}
              </Btn>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-stone-500">
              Hi {picked.name} — enter your PIN.{" "}
              <button onClick={() => { setPicked(null); setPin(""); }} className="underline underline-offset-2">
                Not you?
              </button>
            </p>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pin) login(); }}
              inputMode="numeric"
              type="password"
              maxLength={6}
              autoFocus
              placeholder="••••"
              className="mt-3 w-full rounded-2xl border border-stone-300 bg-white p-4 text-center text-4xl tracking-[0.5em] outline-none placeholder:text-stone-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
            />
            <Btn size="lg" className="mt-4 w-full" onClick={login} disabled={!pin}>
              Open till
            </Btn>
          </div>
        )}
        {msg && <ErrorText>{msg}</ErrorText>}
        <div className="mt-4">
          <Badge tone="green">Works offline</Badge>
        </div>
      </Card>
    </Page>
  );
}
