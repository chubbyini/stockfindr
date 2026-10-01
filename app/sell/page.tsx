"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart, useSession, round2 } from "@/store/pos";
import { useOwner } from "@/lib/auth/owner";
import { tilldb } from "@/lib/db/dexie";
import { enableOffline } from "@/lib/firebase/client";
import { pushOutbox } from "@/lib/sync/push";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Product } from "@/lib/types";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Badge, Btn, Empty, TopBar, inputCls } from "@/components/ui";

export default function SellPage() {
  const { lines, add, inc, dec, clear, restore, total } = useCart();
  const { shopId, shopName, staffId, staffName, deviceId, setSession } = useSession();
  const { user: fbUser, loading: fbLoading } = useOwner();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(0);
  const [syncErr, setSyncErr] = useState("");
  const [toast, setToast] = useState<null | { saleId: string; lines: typeof lines }>(null);
  const [scanMsg, setScanMsg] = useState("");
  const [quickAdd, setQuickAdd] = useState<null | { barcode: string }>(null);
  const [qaName, setQaName] = useState("");
  const [qaPrice, setQaPrice] = useState("");

  useEffect(() => {
    enableOffline();
    loadLocal();
    const t = setInterval(syncNow, 15000);
    // promote held -> pending after 10s, then push
    const promo = setInterval(promoteHeld, 2000);
    return () => { clearInterval(t); clearInterval(promo); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // No more "unknown" sellers: anyone opening /sell without a PIN session
  // gets identified once — Firebase owner name, saved counter name, or a
  // single prompt — then it sticks to this device.
  useEffect(() => {
    if (fbLoading) return;
    const s = useSession.getState();
    if (s.staffId) return;
    const saved = localStorage.getItem("tilltrail-counter-name");
    const fbName = fbUser?.displayName || fbUser?.email?.split("@")[0];
    const name =
      saved || fbName || window.prompt("Who's selling? (shown on every sale)") || "Counter";
    localStorage.setItem("tilltrail-counter-name", name);
    setSession({
      staffId: fbUser ? `owner-${fbUser.uid}` : `local-${s.deviceId}`,
      staffName: name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbLoading]);
  // The basket survives (separate store) — the next PIN returns to it.
  // NOTE: lock clears only the local PIN session, NOT the Firebase user.
  // Join established the device's Firebase identity (uid == staff id), and
  // every sale/ledger write is stamped with the PIN session's staff id, so
  // accountability is intact while offline-first sync keeps working.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const lock = () => {
      setSession({ staffId: "", staffName: "", staffEmail: "" });
      router.push("/pin");
    };
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(lock, 5 * 60 * 1000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("touchstart", reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("touchstart", reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLocal() {
    const local = await tilldb.products.where("shopId").equals(shopId).toArray();
    setCatalog(local);
    const count = await tilldb.outbox.where("shopId").equals(shopId).filter(s => s.status !== "synced").count();
    setPending(count);
    // refresh from server when online
    try {
      const q = query(collection(db, `shops/${shopId}/products`), where("status", "in", ["active", "pending_review"]));
      const snap = await getDocs(q);
      const remote = snap.docs.map(d => ({ id: d.id, shopId, ...d.data() } as Product));
      if (remote.length) {
        setCatalog(remote);
        await tilldb.products.bulkPut(remote);
      }
    } catch { /* offline */ }
  }

  async function promoteHeld() {
    const due = await tilldb.outbox.where("syncAfter").belowOrEqual(Date.now()).toArray();
    for (const s of due.filter(x => x.status === "held")) {
      await tilldb.outbox.update(s.saleId, { status: "pending" });
    }
    const count = await tilldb.outbox.where("shopId").equals(shopId).filter(s => s.status !== "synced").count();
    setPending(count);
  }

  async function syncNow() {
    try {
      const r = await pushOutbox(shopId);
      if (r.pushed) loadLocal();
      if (r.failed > 0) {
        const f = await tilldb.outbox.where("shopId").equals(shopId).filter(s => s.status === "failed").first();
        const raw = f?.lastError || "will retry automatically";
        setSyncErr("Sync stuck: " + raw.replace(/^FirebaseError:\s*/, "").slice(0, 120));
      } else {
        setSyncErr("");
      }
    } catch { /* badge only */ }
  }

  function beep(ok = true) {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 220;
      o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 200);
    } catch { /* no audio */ }
  }

  function findByBarcode(code: string) {
    return catalog.find(p => p.barcode === code);
  }

  function handleBarcode(code: string) {
    const p = findByBarcode(code.trim());
    if (p) {
      add({ productId: p.id, name: p.name, price: p.price });
      beep(true);
      setScanMsg(`Added ${p.name}`);
    } else {
      beep(false);
      setQuickAdd({ barcode: code.trim() });
    }
  }

  async function startCameraScan() {
    setScanMsg("Point camera at barcode…");
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, undefined as unknown as string);
      handleBarcode(result.getText());
      // decodeOnce* stops the stream on resolve — nothing to tear down
    } catch (e) {
      setScanMsg("Camera scan failed — type barcode or tap a tile.");
    }
  }

  async function confirmSale() {
    if (!lines.length) return;
    // No negative stock: block lines exceeding what's on the shelf.
    const short = lines.filter(l => {
      const p = catalog.find(c => c.id === l.productId);
      return p != null && l.quantity > (p.current_stock ?? 0) + 1e-9;
    });
    if (short.length) {
      const p = catalog.find(c => c.id === short[0].productId);
      setSyncErr(`Not enough ${p?.name ?? "stock"} — only ${p?.current_stock ?? 0} left. Restock it first.`);
      beep(false);
      return;
    }
    setSyncErr("");
    const saleId = crypto.randomUUID();
    const occurredAt = Date.now();
    await tilldb.outbox.put({
      saleId, shopId, staffId: staffId || "unknown", deviceId,
      lines: [...lines], total: round2(total()),
      occurredAt, status: "held",
      syncAfter: occurredAt + 10000, attempts: 0,
    });
    setToast({ saleId, lines: [...lines] });
    clear();
    setTimeout(async () => {
      setToast(null);
      await tilldb.outbox.update(saleId, { status: "pending" }).catch(() => {});
      syncNow();
    }, 10000);
  }

  async function undo() {
    if (!toast) return;
    await tilldb.outbox.delete(toast.saleId).catch(() => {});
    restore(toast.lines);
    setToast(null);
  }

  async function quickAddSave() {
    if (!qaName || !qaPrice) return;
    const id = "p-" + Math.random().toString(36).slice(2, 10);
    const prod: Product = {
      id, shopId, barcode: quickAdd?.barcode || null, name: qaName,
      price: parseFloat(qaPrice), cost_price: null, reorder_level: 5,
      is_pinned: false, current_stock: 0, status: "pending_review",
      created_by: staffId, updatedAt: Date.now(),
    };
    // local immediately so sale can continue offline
    await tilldb.products.put(prod);
    setCatalog(c => [...c, prod]);
    add({ productId: id, name: prod.name, price: prod.price });
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _drop, ...body } = prod;
      await setDoc(doc(db, `shops/${shopId}/products/${id}`), body);
    } catch { /* will sync later via import review */ }
    setQuickAdd(null); setQaName(""); setQaPrice("");
  }

  const pinned = catalog.filter(p => p.is_pinned);
  const rest = catalog.filter(p => !p.is_pinned);
  const q = search.trim().toLowerCase();
  // No search: pinned tiles first, then the rest of the catalog — the grid
  // is never mysteriously empty when products exist.
  const filtered = q
    ? catalog.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q)).slice(0, 30)
    : [...pinned, ...rest].slice(0, 24);

  return (
    <>
      <TopBar
        title="Sell"
        sub={`${shopName || "Till"} • ${staffName || "Attendant"}`}
        right={
          <span className="flex items-center gap-2">
            <Badge tone={pending ? "amber" : "green"}>
              {pending ? `${pending} to sync` : "synced"}
            </Badge>
            <Btn
              size="sm"
              variant="secondary"
              onClick={() => {
                setSession({ staffId: "", staffName: "", staffEmail: "" });
                router.push("/pin");
              }}
            >
              Lock
            </Btn>
          </span>
        }
      />
      <main className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-4 md:grid-cols-[1fr_360px]">
        <section>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search or type barcode + Enter"
              onKeyDown={e => { if (e.key === "Enter" && search) handleBarcode(search); }}
              className="min-h-12 flex-1 rounded-xl border border-stone-300 bg-white px-4 text-base outline-none placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
            />
            <Btn size="lg" onClick={startCameraScan} className="px-5">Scan</Btn>
          </div>
          <p className={`mt-1.5 min-h-5 text-sm ${scanMsg.startsWith("Added") ? "text-brand-700" : "text-stone-500"}`}>
            {scanMsg || " "}
          </p>
          {syncErr && <p className="mb-2 text-sm font-medium text-red-600">{syncErr}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { add({ productId: p.id, name: p.name, price: p.price }); beep(true); }}
                className="min-h-20 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.97] active:bg-brand-50"
              >
                <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{p.name}</div>
                <div className="mt-1 text-sm text-stone-500">₦{p.price} • {p.current_stock}</div>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <Empty>{q ? "Nothing matches — scan it to quick-add." : "No products in this shop yet — add them in Products."}</Empty>
          )}
        </section>
        <section>
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:sticky md:top-20">
            <h2 className="font-bold">Basket ({lines.length})</h2>
            <div className="mt-1 divide-y divide-stone-100">
              {lines.map(l => (
                <div key={l.productId} className="flex items-center gap-1.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[15px]">{l.name} × {l.quantity}</span>
                  <button onClick={() => dec(l.productId)} aria-label="decrease"
                    className="flex size-10 items-center justify-center rounded-lg border border-stone-300 text-xl font-bold active:bg-stone-100">−</button>
                  <button onClick={() => inc(l.productId)} aria-label="increase"
                    className="flex size-10 items-center justify-center rounded-lg border border-stone-300 text-xl font-bold active:bg-stone-100">+</button>
                  <span className="w-[72px] shrink-0 text-right text-sm font-semibold">₦{(l.price * l.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {!lines.length && <p className="py-3 text-center text-sm text-stone-400">Tap a tile or scan to start.</p>}
            <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-2">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-bold">₦{total().toFixed(2)}</span>
            </div>
            <Btn size="lg" onClick={confirmSale} disabled={!lines.length} className="mt-3 w-full text-xl">
              Confirm
            </Btn>
            {toast && (
              <div className="mt-2 flex items-center justify-between rounded-xl bg-stone-900 p-3 text-sm text-white">
                <span>Sale saved</span>
                <button onClick={undo} className="font-bold underline underline-offset-4">Undo</button>
              </div>
            )}
          </div>
        </section>
      </main>
      {quickAdd && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5">
            <h3 className="font-bold">New item</h3>
            <p className="mt-0.5 font-mono text-sm text-stone-500">{quickAdd.barcode}</p>
            <p className="mt-1 text-xs text-stone-500">Quick-add — goes to owner review.</p>
            <input value={qaName} onChange={e => setQaName(e.target.value)} placeholder="Product name" className={`${inputCls} mt-3`} />
            <input value={qaPrice} onChange={e => setQaPrice(e.target.value)} placeholder="Price" inputMode="decimal" className={`${inputCls} mt-2`} />
            <div className="mt-4 flex gap-2">
              <Btn variant="secondary" onClick={() => setQuickAdd(null)} className="flex-1">Cancel</Btn>
              <Btn onClick={quickAddSave} className="flex-1">Add & sell</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
