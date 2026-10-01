"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner, ownerSignOut } from "@/lib/auth/owner";
import { hashPin } from "@/lib/auth/pin";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "UTC"];

export default function OnboardingPage() {
  const { user, loading } = useOwner();
  const { setSession } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("1234");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [currency, setCurrency] = useState("NGN");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <RouteLoading label="Loading…" />;
  if (!user) {
    router.push("/");
    return <RouteLoading label="Loading…" />;
  }

  async function createShop() {
    if (!name.trim()) { setMsg("Give your shop a name."); return; }
    if (pin.length < 4) { setMsg("Your owner PIN must be 4+ digits."); return; }
    setBusy(true);
    try {
      const shopRef = doc(collection(db, "shops"));
      const batch = writeBatch(db);
      
      batch.set(shopRef, {
        name: name.trim(),
        ownerUid: user!.uid,
        timezone,
        currency: currency.trim() || "NGN",
        inviteCodes: [],
        createdAt: serverTimestamp(),
      });

      // Private owner index
      batch.set(doc(db, `users/${user!.uid}/shops/${shopRef.id}`), {
        name: name.trim(),
        role: "owner",
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      // Owner staff/till account — SEPARATE round trip, not in the batch
      // above. Its rule reads the shop doc, and batched sibling writes are
      // invisible to rule get()s, so the shop must already be committed.
      // (Bundling it in caused permission-denied on the whole batch.)
      const pinHash = await hashPin(pin.trim());
      const displayName = ownerName.trim() || user!.displayName || user!.email?.split("@")[0] || "Owner";
      const emailLc = (user!.email || "").toLowerCase();

      await setDoc(doc(db, `shops/${shopRef.id}/staff/${user!.uid}`), {
        shopId: shopRef.id,
        name: displayName,
        email: emailLc,
        role: "owner",
        pinHash,
        active: true,
        updatedAt: Date.now(),
      });

      // Save locally to Dexie
      await tilldb.staff.put({
        id: user!.uid,
        shopId: shopRef.id,
        name: displayName,
        email: emailLc,
        role: "owner",
        pinHash,
        active: true,
        updatedAt: Date.now(),
      });

      setSession({
        shopId: shopRef.id,
        shopName: name.trim(),
        staffId: user!.uid,
        staffName: displayName,
        staffEmail: emailLc,
        role: "owner",
      });

      router.push("/dashboard");
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      setMsg(
        code === "permission-denied"
          ? "The server rejected shop creation. You are signed in, so this means the deployed security rules are older than this app — redeploy them: npx firebase-tools deploy --only firestore:rules --project stocfindr"
          : e instanceof Error ? e.message : "Couldn't create the shop."
      );
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="mt-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Open your shop</h1>
        <p className="mt-1 text-sm text-stone-500">
          Signed in as {user.email}{" "}
          <button onClick={() => { ownerSignOut(); router.push("/"); }} className="underline underline-offset-2">
            (not you?)
          </button>
        </p>
        <div className="mt-5 space-y-4">
          <Field label="Shop name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mama Tunde Store"
              className={inputCls}
            />
          </Field>

          <Field label="Your Name (Owner)">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder={user.displayName || user.email?.split("@")[0] || "Owner"}
              className={inputCls}
            />
          </Field>

          <Field label="Your 4-Digit Owner PIN" hint="For unlocking registers offline & selling at the counter.">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="1234"
              inputMode="numeric"
              type="password"
              maxLength={6}
              className={`${inputCls} text-center font-mono text-xl tracking-[0.4em]`}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Timezone">
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="NGN" maxLength={3} className={`${inputCls} w-24`} />
            </Field>
          </div>

          <Btn size="lg" className="w-full" onClick={createShop} disabled={busy}>
            {busy ? "Creating…" : "Create shop & launch till"}
          </Btn>

          {msg && <ErrorText>{msg}</ErrorText>}
        </div>
      </Card>
    </Page>
  );
}
