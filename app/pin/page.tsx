"use client";
import { useState } from "react";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useSession } from "@/store/pos";
import { useRouter } from "next/navigation";

export default function PinPage() {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const { shopId, deviceId, setSession } = useSession();
  const router = useRouter();

  async function login() {
    const gate = pinRateLimitCheck(deviceId);
    if (gate.blocked) { setMsg(`Locked — retry in ${gate.retryAfterSec}s`); return; }
    const staff = await tilldb.staff.where("shopId").equals(shopId).toArray();
    let ok = null;
    for (const s of staff) {
      if (s.active && await verifyPin(pin, s.pinHash)) { ok = s; break; }
    }
    if (!ok) { pinRecordFailure(deviceId); setMsg("Wrong PIN"); return; }
    pinClearFailures(deviceId);
    setSession({ staffId: ok.id, staffName: ok.name, role: ok.role });
    router.push("/sell");
  }

  return (
    <main className="max-w-sm mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">TillTrail — Enter PIN</h1>
      <input value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" type="password" maxLength={6}
        placeholder="4-digit PIN" className="border rounded w-full p-3 text-center text-2xl tracking-widest" />
      <button onClick={login} className="mt-3 w-full bg-green-700 text-white py-3 rounded">Open till</button>
      {msg && <p className="mt-2 text-red-600">{msg}</p>}
      <p className="text-xs text-gray-500 mt-4">Works offline — PINs checked against cached hashes.</p>
    </main>
  );
}
