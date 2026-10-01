"use client";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useOwner } from "@/lib/auth/owner";
import { useSession, knownShops, rememberShop } from "@/store/pos";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import type { StaffMember } from "@/lib/types";
import Token from "@/components/brand/token";
import { Badge, Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

// Counter gate: SHOP (typed work name) + EMAIL + PIN, all three, every time.
// The typed name resolves against shops this device knows — never a raw id,
// never a blind dropdown. All verifies offline against the cached team.
export default function PinPage() {
  const { shopId, deviceId, setSession } = useSession();
  const { user } = useOwner();
  const router = useRouter();
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [shopQuery, setShopQuery] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [noIdentity, setNoIdentity] = useState(false);
  const [teamCount, setTeamCount] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (u) => setNoIdentity(!u)), []);

  // Build the known-shop list: device registry + my server index (heals
  // entries that were saved as raw ids before names were cached).
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
        } catch { /* offline — registry stands */ }
      }
      const list = [...merged.entries()].map(([id, name]) => ({
        id,
        name: name === id ? `Shop ${id.slice(0, 6)}…` : name,
      }));
      setShops(list);
      const current = list.find((s) => s.id === shopId);
      // Pre-fill only with a real name — never a raw id or placeholder.
      setShopQuery(current && !current.name.startsWith("Shop ") ? current.name : "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, shopId]);

  // Teammate count follows whatever the typed name currently resolves to.
  useEffect(() => {
    const hit = resolveShop();
    if (!hit) { setTeamCount(0); return; }
    tilldb.staff.where("shopId").equals(hit.id).filter((s) => s.active).count().then(setTeamCount).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopQuery, shops]);

  function resolveShop(): { id: string; name: string } | null {
    const q = shopQuery.trim().toLowerCase();
    if (!q) return null;
    return shops.find((s) => s.name.toLowerCase() === q || s.id.toLowerCase() === q) || null;
  }

  // Fresh device rescue: signed in but nothing cached — pull my own profile.
  async function restoreAccess(resolvedId: string): Promise<boolean> {
    if (!user) return false;
    try {
      const mirror = await getDoc(doc(db, `users/${user.uid}/shops/${resolvedId}`));
      if (!mirror.exists()) return false;
      const mine = await getDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`));
      if (!mine.exists()) return false;
      const me = { id: mine.id, shopId: resolvedId, ...mine.data() } as StaffMember;
      if (me.active !== false && (me.pinHash || "").length > 0) {
        await tilldb.staff.put(me);
        return true;
      }
    } catch { /* offline — fall through */ }
    return false;
  }

  async function login() {
    setMsg("");
    const hit = resolveShop();
    if (!hit) {
      setMsg(
        shops.length
          ? `Unknown shop. On this device: ${shops.map((s) => s.name).join(", ")}.`
          : "No shops on this device yet — join with a code first."
      );
      return;
    }
    if (!email.includes("@") || pin.length < 4) {
      setMsg("Email + 4-digit PIN as well.");
      return;
    }
    const gate = pinRateLimitCheck(deviceId);
    if (gate.blocked) { setMsg(`Locked — retry in ${gate.retryAfterSec}s`); return; }
    const emailLc = email.trim().toLowerCase();
    let team = await tilldb.staff.where("shopId").equals(hit.id).toArray();
    if (!team.length) {
      if (await restoreAccess(hit.id)) {
        team = await tilldb.staff.where("shopId").equals(hit.id).toArray();
      } else {
        setMsg(`Nobody from ${hit.name} on this device yet — join with a code first.`);
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
    setSession({
      shopId: hit.id,
      shopName: hit.name,
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
          <Field label="Shop (your work name)" hint="Type the shop name as your owner gave it.">
            <input
              value={shopQuery}
              onChange={(e) => setShopQuery(e.target.value)}
              placeholder="e.g. Mama Tunde Store"
              list="known-shops"
              autoComplete="off"
              className={inputCls}
            />
            <datalist id="known-shops">
              {shops.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
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
