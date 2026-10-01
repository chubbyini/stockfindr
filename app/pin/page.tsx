"use client";
import { useState } from "react";
import { tilldb } from "@/lib/db/dexie";
import { verifyPin, pinRateLimitCheck, pinRecordFailure, pinClearFailures } from "@/lib/auth/pin";
import { useSession } from "@/store/pos";
import { useRouter } from "next/navigation";
import { SojournerToken } from "@sojournerbuilds/mark/tokens";
import { Badge, Btn, Card, Page, ErrorText } from "@/components/ui";

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
    if (!ok) { pinRecordFailure(deviceId); setMsg("Wrong PIN — try again."); return; }
    pinClearFailures(deviceId);
    setSession({ staffId: ok.id, staffName: ok.name, role: ok.role });
    router.push("/sell");
  }

  return (
    <Page>
      <Card className="mt-8 p-6 text-center">
        <div className="flex justify-center">
          <SojournerToken size={64} spinning={false} />
        </div>
        <h1 className="mt-2 text-2xl font-bold">Open the till</h1>
        <p className="mt-1 text-sm text-stone-500">Enter your 4-digit PIN to start selling.</p>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && pin) login(); }}
          inputMode="numeric"
          type="password"
          maxLength={6}
          autoFocus
          placeholder="••••"
          className="mt-5 w-full rounded-2xl border border-stone-300 bg-white p-4 text-center text-4xl tracking-[0.5em] outline-none placeholder:text-stone-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
        />
        <Btn size="lg" className="mt-4 w-full" onClick={login} disabled={!pin}>
          Open till
        </Btn>
        {msg && <ErrorText>{msg}</ErrorText>}
        <div className="mt-4">
          <Badge tone="green">Works offline</Badge>
        </div>
      </Card>
    </Page>
  );
}
