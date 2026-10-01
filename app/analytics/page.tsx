"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import RouteLoading from "@/components/brand/route-loading";
import OwnerShell from "@/components/owner-shell";
import { Badge, Btn, Card, Empty, Stat, TopBar } from "@/components/ui";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const DAY = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(n: number) {
  return "₦" + (Math.round(n * 100) / 100).toLocaleString();
}

interface SaleRow {
  id: string;
  total: number;
  staff_id: string;
  occurred_at: number;
  items: {
    product_id: string;
    quantity: number;
    price_at_time: number;
    cost_at_time?: number;
  }[];
}

export default function AnalyticsPage() {
  const router = useRouter();
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
        if ((s.data()?.ownerUid as string) === user.uid) {
          setIsOwner(true);
          return;
        }
        const m = await getDoc(doc(db, `shops/${shopId}/members/${user.uid}`));
        setIsOwner((m.data()?.role as string) === "owner");
      } catch {
        setIsOwner(false);
      }
    })();
  }, [user, shopId]);

  useEffect(() => {
    if (isOwner !== true) return;
    let active = true;
    (async () => {
      setLoadingData(true);
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
          const s = d.data() as {
            total?: number;
            staff_id?: string;
            occurred_at?: number;
            status?: string;
          };
          if (s.status === "voided") continue;
          const itemsSnap = await getDocs(collection(d.ref, "items"));
          rows.push({
            id: d.id,
            total: Number(s.total || 0),
            staff_id: String(s.staff_id || "?"),
            occurred_at: Number(s.occurred_at || 0),
            items: itemsSnap.docs.map((it) => {
              const x = it.data() as {
                product_id?: string;
                quantity?: number;
                price_at_time?: number;
                cost_at_time?: number;
              };
              return {
                product_id: String(x.product_id || "?"),
                quantity: Number(x.quantity || 0),
                price_at_time: Number(x.price_at_time || 0),
                cost_at_time:
                  x.cost_at_time != null ? Number(x.cost_at_time) : undefined,
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
          const p = d.data() as {
            name?: string;
            price?: number;
            cost_price?: number;
            current_stock?: number;
          };
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
        ssnap.docs.forEach((d) => {
          sm[d.id] = (d.data().name as string) || d.id;
        });
        setStaffMap(sm);
      } catch {
        /* offline */
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
    const byDay = new Map<
      string,
      { revenue: number; profit: number; count: number }
    >();
    const byProduct = new Map<
      string,
      { qty: number; revenue: number; profit: number }
    >();
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
        const pr = byProduct.get(it.product_id) || {
          qty: 0,
          revenue: 0,
          profit: 0,
        };
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

    const nowMs = Date.now();
    const days: string[] = [];
    for (let i = range - 1; i >= 0; i--) days.push(dayKey(nowMs - i * DAY));
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
      hourRows: HOURS.map((h) => ({
        hour: `${h}h`,
        revenue: Math.round(byHour[h] * 100) / 100,
      })),
      dowRows: WEEKDAYS.map((d, i) => ({
        day: d,
        revenue: Math.round(byDow[i] * 100) / 100,
      })),
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
            <p className="text-sm text-stone-600">Sign in as the owner to view financial analytics.</p>
            <Btn className="mt-3" onClick={() => router.push("/")}>
              Sign in
            </Btn>
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
            <p className="font-bold text-stone-900">Owners Access Only</p>
            <p className="mt-1 text-sm text-stone-500">Financial reports and profit metrics are restricted to shop owners.</p>
          </Card>
        </OwnerShell>
      </>
    );
  }

  if (isOwner === null) return <RouteLoading label="Checking access…" />;

  return (
    <OwnerShell>
      <TopBar
        title="Analytics"
        sub={`Last ${range} days report`}
        right={
          <div className="flex gap-1">
            {([7, 30] as const).map((r) => (
              <Btn
                key={r}
                size="sm"
                variant={range === r ? "primary" : "secondary"}
                onClick={() => setRange(r)}
              >
                {r}d
              </Btn>
            ))}
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {loadingData ? (
          <RouteLoading label="Crunching store analytics…" />
        ) : (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Revenue" value={fmt(stats.revenue)} />
              <Stat label="Gross Profit" value={fmt(stats.profit)} tone="green" />
              <Stat label="Margin" value={`${stats.margin.toFixed(1)}%`} />
              <Stat label="Total Sales" value={String(stats.count)} />
              <Stat label="Avg / Day" value={fmt(stats.avgDay)} />
              <Stat label="Avg Basket" value={fmt(stats.avgBasket)} />
            </div>

            {stats.costCoverage < 0.5 && sales.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 border border-amber-200">
                Add cost prices to products for exact profit tracking — cost data available for{" "}
                {Math.round(stats.costCoverage * 100)}% of sold goods.
              </div>
            )}

            {/* Revenue Chart */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Revenue by Day
              </h2>
              <Card>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.dayRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} width={55} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Profit Chart */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Gross Profit by Day
              </h2>
              <Card>
                <div className="h-56 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.dayRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} width={55} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="#047857"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Sales Distribution */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Sales Velocity Distribution
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">By Hour of Day</h3>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.hourRows}>
                        <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                        <Tooltip />
                        <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">By Day of Week</h3>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.dowRows}>
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="revenue" fill="#059669" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </div>

            {/* Top Products */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Top Performing Products
              </h2>
              <Card className="divide-y divide-stone-100 p-0 overflow-hidden dark:divide-stone-800">
                {stats.topProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-xs sm:text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-stone-900 dark:text-white">{p.name}</b>
                      <span className="text-xs text-stone-500">
                        {p.qty} units sold • Profit {fmt(p.profit)}
                      </span>
                    </span>
                    <b className="shrink-0 font-mono text-stone-900 dark:text-white">{fmt(p.revenue)}</b>
                  </div>
                ))}
                {!stats.topProducts.length && (
                  <div className="px-4 py-3">
                    <Empty>No products sold in this period.</Empty>
                  </div>
                )}
              </Card>
            </div>

            {/* Top Attendants */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Sales by Attendant
              </h2>
              <Card className="divide-y divide-stone-100 p-0 overflow-hidden dark:divide-stone-800">
                {stats.topStaff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-3 text-xs sm:text-sm">
                    <span>
                      <b className="text-stone-900 dark:text-white">{s.name}</b>{" "}
                      <span className="text-xs text-stone-500">• {s.count} transactions</span>
                    </span>
                    <b className="font-mono text-stone-900 dark:text-white">{fmt(s.revenue)}</b>
                  </div>
                ))}
                {!stats.topStaff.length && (
                  <div className="px-4 py-3">
                    <Empty>No sales logged in this period.</Empty>
                  </div>
                )}
              </Card>
            </div>

            {/* Inventory Valuation */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Inventory Asset Valuation
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Stock Cost Value" value={fmt(invValue)} />
                <Stat label="Potential Revenue" value={fmt(invPotential)} />
              </div>
              {invPotential > 0 && (
                <div className="mt-2 text-xs text-stone-600 flex items-center gap-2">
                  <span>Potential profit locked on shelves:</span>
                  <Badge tone="green">{fmt(invPotential - invValue)}</Badge>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </OwnerShell>
  );
}
