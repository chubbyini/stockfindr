"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useSession } from "@/store/pos";
import ShopSwitcher from "@/components/shop-switcher";

export default function DashboardPage() {
  const { shopId } = useSession();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getDocs(query(collection(db, `shops/${shopId}/sales`), orderBy("occurred_at", "desc"), limit(50)));
        setSales(s.docs.map(d => ({ id: d.id, ...d.data() })));
        const p = await getDocs(collection(db, `shops/${shopId}/products`));
        setProducts(p.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { /* offline */ }
    })();
  }, [shopId]);

  const today = new Date().setHours(0, 0, 0, 0);
  const todays = sales.filter(s => (s.occurred_at || 0) >= today && s.status !== "voided");
  const total = todays.reduce((a, s) => a + (s.total || 0), 0);
  const low = products.filter(p => (p.current_stock ?? 0) <= (p.reorder_level ?? 5));

  return (
    <main className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold">Owner dashboard</h1>
      <div className="mt-1"><ShopSwitcher /></div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="border rounded p-3"><div className="text-xs">Today</div><div className="text-xl font-bold">₦{total.toFixed(2)}</div></div>
        <div className="border rounded p-3"><div className="text-xs">Sales</div><div className="text-xl font-bold">{todays.length}</div></div>
        <div className="border rounded p-3"><div className="text-xs">Low stock</div><div className="text-xl font-bold">{low.length}</div></div>
      </div>
      <h2 className="font-bold mt-4">Low stock (reorder)</h2>
      <div className="border rounded divide-y">
        {low.map(p => <div key={p.id} className="p-2 text-sm">{p.name} — {p.current_stock} left (reorder at {p.reorder_level})</div>)}
        {!low.length && <div className="p-2 text-sm text-gray-500">All good ✅</div>}
      </div>
      <h2 className="font-bold mt-4">Recent sales</h2>
      <div className="border rounded divide-y">
        {sales.slice(0, 20).map(s => (
          <div key={s.id} className="p-2 text-sm flex justify-between">
            <span>{new Date(s.occurred_at).toLocaleString()} • {s.staff_id} {s.status === "voided" && "(voided)"}</span>
            <span>₦{(s.total || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <nav className="mt-4 flex gap-3 text-sm underline">
        <a href="/sell">Sell</a><a href="/products">Products</a><a href="/staff">Staff</a><a href="/counts">Counts</a><a href="/reorders">Reorders</a><a href="/pin">Switch staff</a>
      </nav>
    </main>
  );
}
