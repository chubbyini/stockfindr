"use client";
import { useEffect, useState } from "react";
import { useCart, useSession, round2 } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import { enableOffline } from "@/lib/firebase/client";
import { pushOutbox } from "@/lib/sync/push";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Product } from "@/lib/types";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function SellPage() {
  const { lines, add, inc, dec, clear, restore, total } = useCart();
  const { shopId, staffId, staffName, deviceId } = useSession();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(0);
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
      await setDoc(doc(db, `shops/${shopId}/products/${id}`), { ...prod, id: undefined });
    } catch { /* will sync later via import review */ }
    setQuickAdd(null); setQaName(""); setQaPrice("");
  }

  const pinned = catalog.filter(p => p.is_pinned);
  const filtered = search
    ? catalog.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)).slice(0, 30)
    : pinned.slice(0, 24);

  return (
    <main className="max-w-5xl mx-auto p-4 grid md:grid-cols-2 gap-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">Sell — {staffName || "Attendant"}</h1>
          <span className="text-xs bg-yellow-100 px-2 py-1 rounded">{pending} waiting to sync</span>
        </div>
        <div className="flex gap-2 mb-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type barcode + Enter"
            onKeyDown={e => { if (e.key === "Enter" && search) handleBarcode(search); }}
            className="flex-1 border rounded p-2" />
          <button onClick={startCameraScan} className="bg-green-600 text-white px-3 rounded">Scan</button>
        </div>
        {scanMsg && <p className="text-sm text-gray-600 mb-2">{scanMsg}</p>}
        <div className="grid grid-cols-3 gap-2">
          {filtered.map(p => (
            <button key={p.id} onClick={() => { add({ productId: p.id, name: p.name, price: p.price }); beep(true); }}
              className="border rounded p-3 text-left hover:bg-green-50">
              <div className="font-medium text-sm">{p.name}</div>
              <div className="text-xs">₦{p.price} • {p.current_stock}</div>
            </button>
          ))}
        </div>
      </section>
      <section className="border rounded p-3 h-fit sticky top-2">
        <h2 className="font-bold mb-2">Basket ({lines.length})</h2>
        {lines.map(l => (
          <div key={l.productId} className="flex items-center gap-2 py-1 border-b">
            <span className="flex-1">{l.name} × {l.quantity}</span>
            <button onClick={() => dec(l.productId)} className="px-2 border rounded">−</button>
            <button onClick={() => inc(l.productId)} className="px-2 border rounded">+</button>
            <span className="w-20 text-right">₦{(l.price * l.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold mt-2"><span>Total</span><span>₦{total().toFixed(2)}</span></div>
        <button onClick={confirmSale} disabled={!lines.length} className="mt-3 w-full bg-green-700 text-white py-3 rounded text-lg disabled:opacity-40">Confirm</button>
        {toast && (
          <div className="mt-2 bg-black text-white p-2 rounded flex justify-between">
            <span>Sale saved — undo?</span>
            <button onClick={undo} className="underline">Undo (10s)</button>
          </div>
        )}
      </section>
      {quickAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded p-4 w-full max-w-sm">
            <h3 className="font-bold">New barcode: {quickAdd.barcode}</h3>
            <p className="text-xs text-gray-600">Seller quick-add (goes to owner review).</p>
            <input value={qaName} onChange={e => setQaName(e.target.value)} placeholder="Product name" className="border rounded w-full p-2 mt-2" />
            <input value={qaPrice} onChange={e => setQaPrice(e.target.value)} placeholder="Price" inputMode="decimal" className="border rounded w-full p-2 mt-2" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setQuickAdd(null)} className="flex-1 border rounded p-2">Cancel</button>
              <button onClick={quickAddSave} className="flex-1 bg-green-600 text-white rounded p-2">Add & sell</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
