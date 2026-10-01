"use client";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import { knownShops } from "@/store/pos";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import type { StaffMember } from "@/lib/types";
import Token from "@/components/brand/token";
import { Badge, Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

// Counter gate: SHOP + EMAIL + PIN, all three, every time. The PIN alone
// never identifies anyone — the triple binds the person to the shop, and it
// all verifies offline against the cached team.
export default function PinPage() {
  const { shopId, shopName, deviceId, setSession } = useSession();
  const { user } = useOwner();
  const router = useRouter();
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [pickedShop, setPickedShop] = useState(shopId);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [noIdentity, setNoIdentity] = useState(false);
  const [teamCount, setTeamCount] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (u) => setNoIdentity(!u)), []);
  useEffect(() => {
    const reg = knownShops();
    if (!reg.find((s) => s.id === shopId) && shopId !== "demo-shop") {
      reg.unshift({ id: shopId, name: shopName || shopId });
    }
    setShops(reg);
    if (!reg.find((s) => s.id === pickedShop) && reg.length) setPickedShop(reg[0].id);
    tilldb.staff.where("shopId").equals(pickedShop).filter((s) => s.active).count().then(setTeamCount).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);
  useEffect(() => {
    tilldb.staff.where("shopId").equals(pickedShop).filter((s) => s.active).count().then(setTeamCount).catch(() => {});
  }, [pickedShop]);

  // Fresh device rescue: signed in but nothing cached — pull my own profile.
  async function restoreAccess(): Promise<boolean> {
    if (!user) return false;
    try {
      const mirror = await getDoc(doc(db, `users/${user.uid}/shops/${pickedShop}`));
      if (!mirror.exists()) return false;
      const mine = await getDoc(doc(db, `shops/${pickedShop}/staff/${user.uid}`));
      if (!mine.exists()) return false;
      const me = { id: mine.id, shopId: pickedShop, ...mine.data() } as StaffMember;
      if (me.active !== false && (me.pinHash || "").length > 0) {
        await tilldb.staff.put(me);
        return true;
      }
    } catch { /* offline — fall through */ }
    return false;
  }

  async function login() {
    setMsg("");
    if (!pickedShop || !email.includes("@") || pin.length < 4) {
      setMsg("Shop + email + 4-digit PIN — all three.");
      return;
    }
    const gate = pinRateLimitCheck(deviceId);
    if (gate.blocked) { setMsg(`Locked — retry in ${gate.retryAfterSec}s`); return; }
    const emailLc = email.trim().toLowerCase();
    let team = await tilldb.staff.where("shopId").equals(pickedShop).toArray();
    if (!team.length) {
      // Nothing cached here yet — one rescue attempt before giving up.
      if (await restoreAccess()) {
        team = await tilldb.staff.where("shopId").equals(pickedShop).toArray();
      } else {
        setMsg("Nobody from this shop on this device yet — join with a code first.");
        return;
      }
    }
    let ok: StaffMember | null = null;
    for (const s of team) {
      if (!s.active) continue;
      if ((s.email || "").toLowerCase() !== emailLc) continue;
      if (await verifyPin(pin, s.pinHash)) { ok = s; break; }
    }
    if (!ok) {
      pinRecordFailure(deviceId);
      setMsg("No match for that shop + email + PIN.");
      return;
    }
    pinClearFailures(deviceId);
    const shop = shops.find((s) => s.id === pickedShop);
    setSession({
      shopId: pickedShop,
      shopName: shop?.name || shopName,
      staffId: ok.id,
      staffName: ok.name,
      staffEmail: ok.email || "",
      role: ok.role,
    });
    router.push("/sell");
  }

  return (
    <Page>
      <Card className="mt-4 p-6">
        <div className="flex justify-center">
          <Token size={64} spinning={false} />
        </div>
        <h1 className="mt-2 text-center text-2xl font-bold">Open the till</h1>
        <p className="mt-1 text-center text-sm text-stone-500">Shop, email and PIN — all three, every time.</p>
        {noIdentity && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Till not connected — sales will queue but can&apos;t sync yet.
            <br />
            <Btn size="sm" variant="secondary" onClick={() => router.push("/login")} className="mt-2">
              Reconnect this till
            </Btn>
          </div>
        )}
        <div className="mt-4 space-y-4">
          <Field label="Shop">
            <select value={pickedShop} onChange={(e) => setPickedShop(e.target.value)} className={inputCls}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" className={inputCls} />
          </Field>
          <Field label="PIN">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              placeholder="••••"
              inputMode="numeric"
              type="password"
              maxLength={6}
              className={`${inputCls} text-center text-2xl tracking-[0.5em]`}
            />
          </Field>
          <Btn size="lg" className="w-full" onClick={login}>Open till</Btn>
        </div>
        {msg && <ErrorText>{msg}</ErrorText>}
        <div className="mt-4 text-center">
          <Badge tone="green">Works offline</Badge>
          <p className="mt-2 text-xs text-stone-500">
            {teamCount > 0 ? `${teamCount} teammate${teamCount === 1 ? "" : "s"} on this device` : "First time here?"}{" "}
            <a href="/join" className="underline underline-offset-2">Join with a code</a>
          </p>
        </div>
      </Card>
    </Page>
  );
}
