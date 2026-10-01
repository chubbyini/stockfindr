"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useSession } from "@/store/pos";
import ShopSwitcher from "@/components/shop-switcher";
import { Badge, Card, Empty, Page, Stat, TopBar } from "@/components/ui";

const NAV = [
  ["Sell", "/sell"],
  ["Products", "/products"],
  ["Staff", "/staff"],
  ["PIN", "/pin"],
] as const;

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
    <>
      <TopBar title="Dashboard" sub="Today at a glance" right={<ShopSwitcher />} />
      <Page wide>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Today" value={`₦${total.toFixed(2)}`} />
          <Stat label="Sales" value={String(todays.length)} />
          <Stat label="Low stock" value={String(low.length)} tone={low.length ? "red" : "stone"} />
        </div>

        <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">
          Running low
        </h2>
        <Card className="divide-y divide-stone-100 p-0">
          {low.slice(0, 10).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-medium">{p.name}</span>
              <Badge tone="amber">{p.current_stock} left</Badge>
            </div>
          ))}
          {!low.length && <div className="px-4 py-3"><Empty>All stocked up ✅</Empty></div>}
        </Card>

        <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">
          Recent sales
        </h2>
        <Card className="divide-y divide-stone-100 p-0">
          {sales.slice(0, 12).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate text-stone-600">
                {new Date(s.occurred_at).toLocaleString()} • {s.staff_id}{" "}
                {s.status === "voided" && <Badge tone="stone">voided</Badge>}
              </span>
              <b className="shrink-0">₦{(s.total || 0).toFixed(2)}</b>
            </div>
          ))}
          {!sales.length && <div className="px-4 py-3"><Empty>No sales synced yet.</Empty></div>}
        </Card>

        <nav className="mt-5 grid grid-cols-4 gap-2">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-xl border border-stone-200 bg-white py-3 text-center text-sm font-semibold text-brand-800 shadow-sm transition active:scale-[0.98]"
            >
              {label}
            </a>
          ))}
        </nav>
      </Page>
    </>
  );
}
