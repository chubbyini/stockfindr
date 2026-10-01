"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner, ownerSignOut } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "UTC"];

export default function OnboardingPage() {
  const { user, loading } = useOwner();
  const { setSession } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
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
      batch.set(doc(db, `shops/${shopRef.id}/members/${user!.uid}`), { role: "owner" });
      await batch.commit();
      setSession({ shopId: shopRef.id });
      router.push("/dashboard");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't create the shop.");
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
            {busy ? "Creating…" : "Create shop"}
          </Btn>
          {msg && <ErrorText>{msg}</ErrorText>}
        </div>
      </Card>
    </Page>
  );
}
