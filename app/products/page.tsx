"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import type { Product } from "@/lib/types";
import * as XLSX from "xlsx";

export default function ProductsPage() {
  const { shopId, role, staffId } = useSession();
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", barcode: "", price: "", cost: "", reorder: "5", pinned: false });
  const [msg, setMsg] = useState("");

  useEffect(() => { refresh(); // eslint-disable-next-line
  }, [shopId]);

  async function refresh() {
    try {
      const snap = await getDocs(collection(db, `shops/${shopId}/products`));
      const list = snap.docs.map(d => ({ id: d.id, shopId, ...d.data() } as Product));
      setItems(list);
      await tilldb.products.bulkPut(list);
    } catch {
      setItems(await tilldb.products.where("shopId").equals(shopId).toArray());
    }
  }

  async function saveManual() {
    if (!form.name || !form.price) { setMsg("Name + price required"); return; }
    const id = "p-" + Math.random().toString(36).slice(2, 10);
    const prod: Product = {
      id, shopId, barcode: form.barcode || null, name: form.name,
      price: parseFloat(form.price), cost_price: form.cost ? parseFloat(form.cost) : null,
      reorder_level: parseInt(form.reorder || "5"), is_pinned: form.pinned,
      current_stock: 0, status: role === "owner" ? "active" : "pending_review",
      created_by: staffId, updatedAt: Date.now(),
    };
    await setDoc(doc(db, `shops/${shopId}/products/${id}`), { ...prod, id: undefined });
    setForm({ name: "", barcode: "", price: "", cost: "", reorder: "5", pinned: false });
    setMsg("Saved");
    refresh();
  }

  async function onFile(f: File) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    let ok = 0, bad = 0;
    const seen = new Set(items.map(i => (i.barcode || "").toLowerCase()));
    for (const r of rows.slice(0, 2000)) {
      const name = String(r.name ?? r.Name ?? "").trim();
      const price = Number(r.price ?? r.Price ?? NaN);
      const barcode = String(r.barcode ?? r.Barcode ?? "").trim() || null;
      if (!name || !isFinite(price)) { bad++; continue; }
      if (barcode && seen.has(barcode.toLowerCase())) { bad++; continue; }
      const id = "p-" + Math.random().toString(36).slice(2, 10);
      const prod = {
        barcode, name, price, cost_price: Number(r.cost_price ?? r.cost ?? null) || null,
        reorder_level: Number(r.reorder_level ?? 5) || 5, is_pinned: false,
        current_stock: Number(r.opening_stock ?? 0) || 0, status: "active",
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, `shops/${shopId}/products/${id}`), prod);
      if (barcode) seen.add(barcode.toLowerCase());
      ok++;
    }
    setMsg(`Import: ${ok} added, ${bad} skipped`);
    refresh();
  }

  async function approve(id: string) {
    await setDoc(doc(db, `shops/${shopId}/products/${id}`), { status: "active" }, { merge: true });
    refresh();
  }

  return (
    <main className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-2">Products — scan / import / manual</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <h2 className="font-bold">Add one-by-one</h2>
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border rounded w-full p-2 mt-2" />
          <input placeholder="Barcode (optional — or scan)" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} className="border rounded w-full p-2 mt-2" />
          <div className="flex gap-2 mt-2">
            <input placeholder="Price" inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="border rounded w-full p-2" />
            <input placeholder="Cost (opt)" inputMode="decimal" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="border rounded w-full p-2" />
            <input placeholder="Reorder" inputMode="numeric" value={form.reorder} onChange={e => setForm({ ...form, reorder: e.target.value })} className="border rounded w-full p-2" />
          </div>
          <label className="text-sm mt-2 flex gap-2"><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /> Pinned tile (unbarcoded fast seller)</label>
          <button onClick={saveManual} className="mt-2 bg-green-700 text-white px-4 py-2 rounded">Save product</button>
        </div>
        <div className="border rounded p-3">
          <h2 className="font-bold">Import spreadsheet</h2>
          <p className="text-xs text-gray-600">Columns: name, barcode, price, cost, reorder_level, opening_stock</p>
          <input type="file" accept=".xlsx,.csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} className="mt-2" />
          {msg && <p className="text-sm mt-2">{msg}</p>}
        </div>
      </div>
      <h2 className="font-bold mt-4">Catalog ({items.length}) — pending review: {items.filter(i => i.status === "pending_review").length}</h2>
      <div className="divide-y border rounded mt-2">
        {items.map(p => (
          <div key={p.id} className="p-2 flex items-center gap-2">
            <span className="flex-1">{p.name} <span className="text-xs text-gray-500">{p.barcode || "no barcode"} • ₦{p.price} • stock {p.current_stock} • reorder {p.reorder_level}</span></span>
            {p.status === "pending_review" && <span className="text-xs bg-yellow-200 px-2 rounded">review</span>}
            {p.status === "pending_review" && role === "owner" && <button onClick={() => approve(p.id)} className="text-xs border px-2 py-1 rounded">Approve</button>}
          </div>
        ))}
      </div>
    </main>
  );
}
