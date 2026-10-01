"use client";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, hashPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useOwner } from "@/lib/auth/owner";
import { useSession, knownShops, rememberShop } from "@/store/pos";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { StaffMember } from "@/lib/types";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";
import { IconLock, IconCheck, IconAlertTriangle } from "@/components/icons";

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
  }, [user, shopId]);

  // Teammate count follows whatever the typed name currently resolves to.
  useEffect(() => {
    let active = true;
    const hit = shops.find((s) => {
      const q = shopQuery.trim().toLowerCase();
      return q && (s.name.toLowerCase() === q || s.id.toLowerCase() === q);
    });

    if (!hit) {
      setTeamCount(0);
    } else {
      tilldb.staff
        .where("shopId")
        .equals(hit.id)
        .filter((s) => s.active)
        .count()
        .then((cnt) => {
          if (active) setTeamCount(cnt);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
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
      let mine = await getDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`));
      
      // Auto-heal owner till profile if missing
      if (!mine.exists()) {
        const shopSnap = await getDoc(doc(db, `shops/${resolvedId}`));
        if (shopSnap.exists() && shopSnap.data()?.ownerUid === user.uid) {
          const defaultHash = await hashPin("1234");
          const ownerName = user.displayName || user.email?.split("@")[0] || "Owner";
          const emailLc = (user.email || "").toLowerCase();
          
          await setDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`), {
            shopId: resolvedId,
            name: ownerName,
            email: emailLc,
            role: "owner",
            pinHash: defaultHash,
            active: true,
            updatedAt: Date.now(),
          }, { merge: true });
          
          mine = await getDoc(doc(db, `shops/${resolvedId}/staff/${user.uid}`));
        }
      }

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
      setMsg("Email + 4-digit PIN required.");
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
      <div className="mx-auto max-w-md py-6 sm:py-12">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
              <IconLock className="size-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Open the Counter Till</h1>
            <p className="mt-1 text-sm text-stone-500">Shop name, staff email, and your 4-digit PIN.</p>
          </div>

          {noIdentity && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <IconAlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">Till identity not reconnected</p>
                <p className="mt-0.5 text-xs opacity-90">Offline sales will queue locally, but sync requires account reconnection.</p>
                <Btn size="sm" variant="secondary" onClick={() => router.push("/login")} className="mt-3">
                  Reconnect Till Account
                </Btn>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <Field label="Shop Name" hint="Type your registered work or shop name.">
              <div className="relative">
                <input
                  value={shopQuery}
                  onChange={(e) => setShopQuery(e.target.value)}
                  placeholder="e.g. Tunde Enterprise"
                  list="known-shops"
                  autoComplete="off"
                  className={inputCls}
                />
                <datalist id="known-shops">
                  {shops.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>
            </Field>

            <Field label="Staff Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="attendant@shop.com"
                type="email"
                autoComplete="email"
                className={inputCls}
              />
            </Field>

            <Field label="Counter Security PIN">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") login(); }}
                placeholder="••••"
                inputMode="numeric"
                type="password"
                maxLength={6}
                className={`${inputCls} text-center text-2xl tracking-[0.5em] font-semibold`}
              />
            </Field>

            <Btn size="lg" className="mt-2 w-full font-semibold" onClick={login}>
              Open Counter Till
            </Btn>
          </div>

          {msg && <ErrorText>{msg}</ErrorText>}

          <div className="mt-6 border-t border-stone-100 pt-6 text-center dark:border-stone-800">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <IconCheck className="size-3.5" />
              <span>Full Offline Counter Support</span>
            </div>
            <p className="mt-3 text-xs text-stone-500">
              {teamCount > 0 ? `${teamCount} staff member${teamCount === 1 ? "" : "s"} cached on this device` : "New team member?"}{" "}
              <a href="/join" className="font-semibold text-stone-900 underline underline-offset-4 dark:text-stone-100">
                Join shop with invite code
              </a>
            </p>
          </div>
        </Card>
      </div>
    </Page>
  );
}

