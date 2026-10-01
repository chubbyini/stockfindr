"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useSession } from "@/store/pos";
import ShopSwitcher from "@/components/shop-switcher";
import { Badge, Card, Empty, Stat, TopBar } from "@/components/ui";
import OwnerShell from "@/components/owner-shell";

export default function DashboardPage() {
  const { shopId } = useSession();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const s = await getDocs(query(collection(db, `shops/${shopId}/sales`), orderBy("occurred_at", "desc"), limit(50)));
        setSales(s.docs.map(d => ({ id: d.id, ...d.data() })));
        const p = await getDocs(collection(db, `shops/${shopId}/products`));
        setProducts(p.docs.map(d => ({ id: d.id, ...d.data() })));
        const st = await getDocs(collection(db, `shops/${shopId}/staff`));
        const m: Record<string, string> = {};
        st.docs.forEach(d => { m[d.id] = (d.data().name as string) || d.id; });
        setStaffNames(m);
      } catch { /* offline */ }
    })();
  }, [shopId]);

  const today = new Date().setHours(0, 0, 0, 0);
  const todays = sales.filter(s => (s.occurred_at || 0) >= today && s.status !== "voided");
  const total = todays.reduce((a, s) => a + (s.total || 0), 0);
  const low = products.filter(p => (p.current_stock ?? 0) <= (p.reorder_level ?? 5));
  // Owner-as-seller stamps owner-<uid>; resolve through the team list.
  const nameOf = (id: string) =>
    staffNames[id] || staffNames[String(id).replace(/^owner-/, "")] || String(id);

  return (
    <>
      <TopBar title="Dashboard" sub="Today at a glance" right={<ShopSwitcher />} />
      <OwnerShell>
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
                {new Date(s.occurred_at).toLocaleString()} • {nameOf(s.staff_id)}{" "}
                {s.status === "voided" && <Badge tone="stone">voided</Badge>}
              </span>
              <b className="shrink-0">₦{(s.total || 0).toFixed(2)}</b>
            </div>
          ))}
          {!sales.length && <div className="px-4 py-3"><Empty>No sales synced yet.</Empty></div>}
        </Card>
      </OwnerShell>
    </>
  );
}
