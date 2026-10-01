"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import type { Product } from "@/lib/types";
import * as XLSX from "xlsx";
import { Badge, Btn, Card, Empty, Field, Page, TopBar, inputCls } from "@/components/ui";

export default function ProductsPage() {
  const { shopId, role, staffId } = useSession();
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: "", barcode: "", price: "", cost: "", reorder: "5", stock: "", pinned: false });
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
    const opening = Math.max(0, parseFloat(form.stock || "0") || 0);
    const prod: Product = {
      id, shopId, barcode: form.barcode || null, name: form.name,
      price: parseFloat(form.price), cost_price: form.cost ? parseFloat(form.cost) : null,
      reorder_level: parseInt(form.reorder || "5"), is_pinned: form.pinned,
      current_stock: opening, status: role === "owner" ? "active" : "pending_review",
      created_by: staffId, updatedAt: Date.now(),
    };
    // Stock always comes from the ledger — opening quantity is a restock
    // entry so the cached counter and the ledger sum agree from day one.
    const batch = writeBatch(db);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _drop, ...body } = prod;
    batch.set(doc(db, `shops/${shopId}/products/${id}`), body);
    if (opening > 0) {
      batch.set(doc(collection(db, `shops/${shopId}/ledger`)), {
        product_id: id,
        change_amount: opening,
        reason: "restock",
        reference_id: id,
        staff_id: staffId || "owner",
        occurred_at: Date.now(),
        received_at: serverTimestamp(),
      });
    }
    await batch.commit();
    setForm({ name: "", barcode: "", price: "", cost: "", reorder: "5", stock: "", pinned: false });
    setMsg("Saved ✓");
    refresh();
  }

  async function onFile(f: File) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    let ok = 0, bad = 0;
    const seen = new Set(items.map(i => (i.barcode || "").toLowerCase()));
    // 250 products per batch (product + optional ledger entry = ≤500 writes).
    let batch = writeBatch(db);
    let ops = 0;
    async function flush() {
      if (ops > 0) await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
    for (const r of rows.slice(0, 2000)) {
      const name = String(r.name ?? r.Name ?? "").trim();
      const price = Number(r.price ?? r.Price ?? NaN);
      const barcode = String(r.barcode ?? r.Barcode ?? "").trim() || null;
      if (!name || !isFinite(price)) { bad++; continue; }
      if (barcode && seen.has(barcode.toLowerCase())) { bad++; continue; }
      const id = "p-" + Math.random().toString(36).slice(2, 10);
      const opening = Math.max(0, Number(r.opening_stock ?? 0) || 0);
      const prod = {
        barcode, name, price, cost_price: Number(r.cost_price ?? r.cost ?? null) || null,
        reorder_level: Number(r.reorder_level ?? 5) || 5, is_pinned: false,
        current_stock: opening, status: "active",
        updatedAt: Date.now(),
      };
      batch.set(doc(db, `shops/${shopId}/products/${id}`), prod);
      ops++;
      if (opening > 0) {
        batch.set(doc(collection(db, `shops/${shopId}/ledger`)), {
          product_id: id,
          change_amount: opening,
          reason: "restock",
          reference_id: id,
          staff_id: staffId || "owner",
          occurred_at: Date.now(),
          received_at: serverTimestamp(),
        });
        ops++;
      }
      if (barcode) seen.add(barcode.toLowerCase());
      ok++;
      if (ops >= 500) await flush();
    }
    await flush();
    setMsg(`Import: ${ok} added, ${bad} skipped`);
    refresh();
  }

  async function approve(id: string) {
    await setDoc(doc(db, `shops/${shopId}/products/${id}`), { status: "active" }, { merge: true });
    refresh();
  }

  const pending = items.filter(i => i.status === "pending_review");

  return (
    <>
      <TopBar title="Products" sub={`${items.length} in catalog`} />
      <Page wide>
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <h2 className="font-bold">Add one-by-one</h2>
            <div className="mt-3 space-y-3">
              <Field label="Name">
                <input placeholder="e.g. Gala sausage roll" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Barcode" hint="Optional — leave blank for unbarcoded goods.">
                <input placeholder="Scan or type" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} className={inputCls} />
              </Field>
              <div className="flex gap-2">
                <Field label="Price">
                  <input placeholder="0.00" inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Cost">
                  <input placeholder="opt" inputMode="decimal" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Field label="Stock on hand" hint="How many are on the shelf now?">
                  <input placeholder="0" inputMode="decimal" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Reorder at" hint="Warn me at this level.">
                  <input inputMode="numeric" value={form.reorder} onChange={e => setForm({ ...form, reorder: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="size-5 accent-brand-700" />
                Pinned tile (fast seller, no barcode)
              </label>
              <Btn className="w-full" onClick={saveManual}>Save product</Btn>
            </div>
          </Card>
          <Card>
            <h2 className="font-bold">Import spreadsheet</h2>
            <p className="mt-1 text-xs text-stone-500">Columns: name, barcode, price, cost, reorder_level, opening_stock</p>
            <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm font-medium text-brand-800">
              Tap to choose .xlsx / .csv
              <input type="file" accept=".xlsx,.csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} className="hidden" />
            </label>
            {msg && <p className="mt-2 text-sm font-medium text-stone-700">{msg}</p>}
          </Card>
        </div>

        <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">
          Catalog ({items.length}) {pending.length > 0 && <Badge tone="amber">{pending.length} to review</Badge>}
        </h2>
        <Card className="divide-y divide-stone-100 p-0">
          {items.map(p => {
            const isLow = (p.current_stock ?? 0) <= (p.reorder_level ?? 5);
            return (
              <div key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{p.name}</b>
                  <span className="text-xs text-stone-500">
                    {p.barcode || "no barcode"} • ₦{p.price} • stock {p.current_stock}
                  </span>
                </span>
                {isLow && <Badge tone="red">low</Badge>}
                {p.is_pinned && <Badge tone="green">pinned</Badge>}
                {p.status === "pending_review" && <Badge tone="amber">review</Badge>}
                {p.status === "pending_review" && role === "owner" && (
                  <Btn size="sm" variant="secondary" onClick={() => approve(p.id)}>Approve</Btn>
                )}
              </div>
            );
          })}
          {!items.length && <div className="px-4 py-3"><Empty>No products yet — add one above.</Empty></div>}
        </Card>
      </Page>
    </>
  );
}
