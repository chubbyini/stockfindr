"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import RouteLoading from "@/components/brand/route-loading";

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
    <main className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold">Open your shop</h1>
      <p className="text-sm text-gray-600 mt-1">Signed in as {user.email}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shop name, e.g. Mama Tunde Store"
        className="border rounded w-full p-3 mt-4"
      />
      <div className="flex gap-2 mt-2">
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="border rounded p-2 flex-1">
          {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="NGN" maxLength={3} className="border rounded p-2 w-20" />
      </div>
      <button onClick={createShop} disabled={busy} className="mt-4 w-full bg-green-700 text-white py-3 rounded disabled:opacity-40">
        {busy ? "Creating…" : "Create shop"}
      </button>
      {msg && <p className="text-sm mt-2 text-red-600">{msg}</p>}
    </main>
  );
}
