"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase/client";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useSession } from "@/store/pos";
import ShopSwitcher from "@/components/shop-switcher";
import { Badge, Card, Empty, Stat, TopBar, Btn } from "@/components/ui";
import OwnerShell from "@/components/owner-shell";
import { EnsureOwnerTillAccount } from "@/components/owner-pin-setup";
import {
  IconSell,
  IconProducts,
  IconStaff,
  IconLock,
  IconAlertTriangle,
  IconAnalytics,
} from "@/components/icons";

export default function DashboardPage() {
  const { shopId } = useSession();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const s = await getDocs(
          query(
            collection(db, `shops/${shopId}/sales`),
            orderBy("occurred_at", "desc"),
            limit(50)
          )
        );
        setSales(s.docs.map((d) => ({ id: d.id, ...d.data() })));

        const p = await getDocs(collection(db, `shops/${shopId}/products`));
        setProducts(p.docs.map((d) => ({ id: d.id, ...d.data() })));

        const st = await getDocs(collection(db, `shops/${shopId}/staff`));
        const m: Record<string, string> = {};
        st.docs.forEach((d) => {
          m[d.id] = (d.data().name as string) || d.id;
        });
        setStaffNames(m);
      } catch {
        /* offline */
      }
    })();
  }, [shopId]);

  const today = new Date().setHours(0, 0, 0, 0);
  const todays = sales.filter(
    (s) => (s.occurred_at || 0) >= today && s.status !== "voided"
  );
  const total = todays.reduce((a, s) => a + (s.total || 0), 0);
  const low = products.filter(
    (p) => (p.current_stock ?? 0) <= (p.reorder_level ?? 5)
  );
  const nameOf = (id: string) =>
    staffNames[id] || staffNames[String(id).replace(/^owner-/, "")] || String(id);

  return (
    <OwnerShell>
      <TopBar title="Dashboard" sub="Today at a glance" right={<ShopSwitcher />} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <EnsureOwnerTillAccount />

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat
            label="Today Revenue"
            value={`₦${total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
            trend={`${todays.length} completed transactions today`}
          />
          <Stat
            label="Sales Count"
            value={String(todays.length)}
            trend="Counter sales today"
          />
          <Stat
            label="Low Stock Items"
            value={String(low.length)}
            tone={low.length ? "red" : "stone"}
            trend={low.length ? "Items require restock" : "All stock healthy"}
          />
        </div>

        {/* Quick Launchpad */}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Link
              href="/sell"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:border-brand-500 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white shrink-0">
                <IconSell className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 dark:text-white truncate">Open Till</h3>
                <p className="text-[11px] text-stone-500 truncate">POS Register</p>
              </div>
            </Link>

            <Link
              href="/products"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:border-brand-500 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-stone-900 text-white shrink-0 dark:bg-stone-800">
                <IconProducts className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 dark:text-white truncate">Catalog</h3>
                <p className="text-[11px] text-stone-500 truncate">Products & Stock</p>
              </div>
            </Link>

            <Link
              href="/analytics"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:border-brand-500 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                <IconAnalytics className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 dark:text-white truncate">Reports</h3>
                <p className="text-[11px] text-stone-500 truncate">Sales Analytics</p>
              </div>
            </Link>

            <Link
              href="/staff"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:border-brand-500 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-stone-800 text-white shrink-0">
                <IconStaff className="size-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-stone-900 dark:text-white truncate">Team</h3>
                <p className="text-[11px] text-stone-500 truncate">Staff Invites</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Low Stock Section */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <IconAlertTriangle className="size-4 text-amber-600" />
              Running Low ({low.length})
            </h2>
            <Link href="/products" className="text-xs font-bold text-brand-700 dark:text-brand-400 hover:underline">
              Manage Catalog →
            </Link>
          </div>

          <Card className="divide-y divide-stone-100 p-0 overflow-hidden dark:divide-stone-800">
            {low.slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-xs sm:text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-stone-900 dark:text-white truncate block">
                    {p.name}
                  </span>
                  <span className="text-xs text-stone-500">
                    Reorder point: {p.reorder_level ?? 5} units
                  </span>
                </div>
                <Badge tone="amber">{p.current_stock} left</Badge>
              </div>
            ))}

            {!low.length && (
              <div className="px-4 py-4">
                <Empty>All inventory items are well stocked.</Empty>
              </div>
            )}
          </Card>
        </div>

        {/* Recent Sales Section */}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Recent Transactions
          </h2>

          <Card className="divide-y divide-stone-100 p-0 overflow-hidden dark:divide-stone-800">
            {sales.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-xs sm:text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-stone-900 dark:text-white">
                      {new Date(s.occurred_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-stone-400">•</span>
                    <span className="text-xs font-medium text-stone-600 dark:text-stone-300 truncate">
                      {nameOf(s.staff_id)}
                    </span>
                    {s.status === "voided" && <Badge tone="stone">voided</Badge>}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5 font-mono">
                    {new Date(s.occurred_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="font-mono text-sm font-extrabold text-stone-900 dark:text-white shrink-0">
                  ₦{(s.total || 0).toFixed(2)}
                </div>
              </div>
            ))}

            {!sales.length && (
              <div className="px-4 py-4">
                <Empty>No transactions recorded yet today.</Empty>
              </div>
            )}
          </Card>
        </div>
      </div>
    </OwnerShell>
  );
}
