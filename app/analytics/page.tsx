"use client";
import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import RouteLoading from "@/components/brand/route-loading";
import OwnerShell from "@/components/owner-shell";
import { Badge, Btn, Card, Empty, Stat, TopBar } from "@/components/ui";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const DAY = 86_400_000;
const HOURS = [...Array(24).keys()];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) {
  return "₦" + (Math.round(n * 100) / 100).toLocaleString();
}

interface SaleRow {
  id: string;
  total: number;
  staff_id: string;
  occurred_at: number;
  items: { product_id: string; quantity: number; price_at_time: number; cost_at_time?: number }[];
}

export default function AnalyticsPage() {
  const { user, loading } = useOwner();
  const { shopId } = useSession();
  const [range, setRange] = useState<7 | 30>(7);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [costMap, setCostMap] = useState<Record<string, number>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [invValue, setInvValue] = useState(0);
  const [invPotential, setInvPotential] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const s = await getDoc(doc(db, "shops", shopId));
        if ((s.data()?.ownerUid as string) === user.uid) { setIsOwner(true); return; }
        const m = await getDoc(doc(db, `shops/${shopId}/members/${user.uid}`));
        setIsOwner((m.data()?.role as string) === "owner");
      } catch {
        setIsOwner(false);
      }
    })();
  }, [user, shopId]);

  useEffect(() => {
    if (isOwner !== true) return;
    setLoadingData(true);
    (async () => {
      try {
        const startMs = Date.now() - range * DAY;
        const snap = await getDocs(
          query(
            collection(db, `shops/${shopId}/sales`),
            where("occurred_at", ">=", startMs),
            orderBy("occurred_at", "desc"),
            limit(500)
          )
        );
        const rows: SaleRow[] = [];
        for (const d of snap.docs) {
          const s = d.data() as { total?: number; staff_id?: string; occurred_at?: number; status?: string };
          if (s.status === "voided") continue;
          const itemsSnap = await getDocs(collection(d.ref, "items"));
          rows.push({
            id: d.id,
            total: Number(s.total || 0),
            staff_id: String(s.staff_id || "?"),
            occurred_at: Number(s.occurred_at || 0),
            items: itemsSnap.docs.map((it) => {
              const x = it.data() as { product_id?: string; quantity?: number; price_at_time?: number; cost_at_time?: number };
              return {
                product_id: String(x.product_id || "?"),
                quantity: Number(x.quantity || 0),
                price_at_time: Number(x.price_at_time || 0),
                cost_at_time: x.cost_at_time != null ? Number(x.cost_at_time) : undefined,
              };
            }),
          });
        }
        setSales(rows);
        const psnap = await getDocs(collection(db, `shops/${shopId}/products`));
        const costs: Record<string, number> = {};
        const names: Record<string, string> = {};
        let val = 0;
        let pot = 0;
        psnap.docs.forEach((d) => {
          const p = d.data() as { name?: string; price?: number; cost_price?: number; current_stock?: number };
          names[d.id] = (p.name as string) || d.id;
          if (p.cost_price != null) costs[d.id] = Number(p.cost_price);
          const st = Number(p.current_stock ?? 0);
          if (st > 0) {
            if (p.cost_price != null) val += st * Number(p.cost_price);
            pot += st * Number(p.price || 0);
          }
        });
        setCostMap(costs);
        setNameMap(names);
        setInvValue(val);
        setInvPotential(pot);
        const ssnap = await getDocs(collection(db, `shops/${shopId}/staff`));
        const sm: Record<string, string> = {};
        ssnap.docs.forEach((d) => { sm[d.id] = (d.data().name as string) || d.id; });
        setStaffMap(sm);
      } catch {
        /* offline — charts stay empty */
      } finally {
        setLoadingData(false);
      }
    })();
  }, [isOwner, shopId, range]);

  const stats = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let costKnown = 0;
    let costTotal = 0;
    const byDay = new Map<string, { revenue: number; profit: number; count: number }>();
    const byProduct = new Map<string, { qty: number; revenue: number; profit: number }>();
    const byStaff = new Map<string, { count: number; revenue: number }>();
    const byHour = new Array(24).fill(0) as number[];
    const byDow = new Array(7).fill(0) as number[];
    for (const s of sales) {
      revenue += s.total;
      const dk = dayKey(s.occurred_at);
      const day = byDay.get(dk) || { revenue: 0, profit: 0, count: 0 };
      day.revenue += s.total;
      day.count += 1;
      let saleProfit = 0;
      for (const it of s.items) {
        const cost = it.cost_at_time ?? costMap[it.product_id];
        const hasCost = cost != null;
        costTotal++;
        if (hasCost) costKnown++;
        const p = (it.price_at_time - (hasCost ? Number(cost) : 0)) * it.quantity;
        saleProfit += p;
        const pr = byProduct.get(it.product_id) || { qty: 0, revenue: 0, profit: 0 };
        pr.qty += it.quantity;
        pr.revenue += it.price_at_time * it.quantity;
        pr.profit += p;
        byProduct.set(it.product_id, pr);
      }
      profit += saleProfit;
      day.profit += saleProfit;
      byDay.set(dk, day);
      const st = byStaff.get(s.staff_id) || { count: 0, revenue: 0 };
      st.count += 1;
      st.revenue += s.total;
      byStaff.set(s.staff_id, st);
      const d = new Date(s.occurred_at);
      byHour[d.getHours()] += s.total;
      byDow[d.getDay()] += s.total;
    }
    const days: string[] = [];
    for (let i = range - 1; i >= 0; i--) days.push(dayKey(Date.now() - i * DAY));
    const activeDays = [...byDay.keys()].length || 1;
    return {
      revenue,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      count: sales.length,
      avgDay: revenue / activeDays,
      avgBasket: sales.length ? revenue / sales.length : 0,
      costCoverage: costTotal ? costKnown / costTotal : 1,
      dayRows: days.map((k) => ({
        day: k.slice(5),
        revenue: Math.round((byDay.get(k)?.revenue || 0) * 100) / 100,
        profit: Math.round((byDay.get(k)?.profit || 0) * 100) / 100,
      })),
      hourRows: HOURS.map((h) => ({ hour: `${h}h`, revenue: Math.round(byHour[h] * 100) / 100 })),
      dowRows: WEEKDAYS.map((d, i) => ({ day: d, revenue: Math.round(byDow[i] * 100) / 100 })),
      topProducts: [...byProduct.entries()]
        .map(([id, v]) => ({ id, name: nameMap[id] || id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      topStaff: [...byStaff.entries()]
        .map(([id, v]) => ({
          id,
          name: staffMap[id] || staffMap[id.replace(/^owner-/, "")] || id,
          ...v,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  }, [sales, costMap, nameMap, staffMap, range]);

  if (loading) return <RouteLoading label="Loading…" />;
  if (!user) {
    return (
      <>
        <TopBar title="Analytics" sub="Owners only" />
        <OwnerShell>
          <Card className="p-6 text-center">
            <p className="text-sm text-stone-600">Sign in as the owner to see analytics.</p>
            <Btn className="mt-3" onClick={() => { window.location.href = "/"; }}>Sign in</Btn>
          </Card>
        </OwnerShell>
      </>
    );
  }
  if (isOwner === false) {
    return (
      <>
        <TopBar title="Analytics" sub="Owners only" />
        <OwnerShell>
          <Card className="p-6 text-center">
            <p className="font-bold">Owners only</p>
            <p className="mt-1 text-sm text-stone-500">Profit and reports stay with the owner.</p>
          </Card>
        </OwnerShell>
      </>
    );
  }
  if (isOwner === null) return <RouteLoading label="Checking access…" />;

  return (
    <>
      <TopBar
        title="Analytics"
        sub={`Last ${range} days`}
        right={
          <span className="flex gap-1">
            {([7, 30] as const).map((r) => (
              <Btn key={r} size="sm" variant={range === r ? "primary" : "secondary"} onClick={() => setRange(r)}>
                {r}d
              </Btn>
            ))}
          </span>
        }
      />
      <OwnerShell>
        {loadingData ? (
          <RouteLoading label="Crunching numbers…" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stat label="Revenue" value={fmt(stats.revenue)} />
              <Stat label="Profit" value={fmt(stats.profit)} />
              <Stat label="Margin" value={`${stats.margin.toFixed(1)}%`} />
              <Stat label="Sales" value={String(stats.count)} />
              <Stat label="Avg / day" value={fmt(stats.avgDay)} />
              <Stat label="Avg basket" value={fmt(stats.avgBasket)} />
            </div>
            {stats.costCoverage < 0.5 && sales.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Add cost prices on products for true profit — right now costs are known for{" "}
                {Math.round(stats.costCoverage * 100)}% of sold items.
              </p>
            )}

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">Revenue by day</h2>
            <Card>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.dayRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={55} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#15803d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">Profit by day</h2>
            <Card>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.dayRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={55} />
                    <Tooltip />
                    <Line type="monotone" dataKey="profit" stroke="#166534" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">When do you sell</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <h3 className="text-sm font-bold">By hour</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.hourRows}>
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#a7f3d0" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <h3 className="text-sm font-bold">By weekday</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.dowRows}>
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#6ee7b7" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">Top products</h2>
            <Card className="divide-y divide-stone-100 p-0">
              {stats.topProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <b className="block truncate">{p.name}</b>
                    <span className="text-xs text-stone-500">×{p.qty} • profit {fmt(p.profit)}</span>
                  </span>
                  <b className="shrink-0">{fmt(p.revenue)}</b>
                </div>
              ))}
              {!stats.topProducts.length && <div className="px-4 py-3 text-sm text-stone-500">No sales in range.</div>}
            </Card>

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">By staff</h2>
            <Card className="divide-y divide-stone-100 p-0">
              {stats.topStaff.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{s.name} <span className="text-xs text-stone-500">• {s.count} sales</span></span>
                  <b>{fmt(s.revenue)}</b>
                </div>
              ))}
              {!stats.topStaff.length && <div className="px-4 py-3 text-sm text-stone-500">No sales in range.</div>}
            </Card>

            <h2 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">Inventory value</h2>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Stock at cost" value={fmt(invValue)} />
              <Stat label="Potential revenue" value={fmt(invPotential)} />
            </div>
            {invPotential > 0 && (
              <p className="mt-2 text-xs text-stone-500">
                Potential profit locked on shelves: <Badge tone="green">{fmt(invPotential - invValue)}</Badge>
              </p>
            )}
          </>
        )}
      </OwnerShell>
    </>
  );
}
