"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import OwnerShell from "@/components/owner-shell";
import { Badge, Btn, Card, Empty, Stat, TopBar, Modal, Field, inputCls } from "@/components/ui";
import {
  IconSell,
  IconProducts,
  IconLock,
  IconAlertTriangle,
} from "@/components/icons";

const emptySubscribe = () => () => {};
function useHydration() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

interface AttendantSale {
  saleId: string;
  total: number;
  occurredAt: number;
  status: string;
  itemCount: number;
}

export default function AttendantDashboardPage() {
  const { shopId, shopName, staffId, staffName, setSession } = useSession();
  const router = useRouter();
  const mounted = useHydration();

  const [sales, setSales] = useState<AttendantSale[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [cashDropOpen, setCashDropOpen] = useState(false);
  const [dropAmount, setDropAmount] = useState("");
  const [dropReason, setDropReason] = useState("");
  const [dropMsg, setDropMsg] = useState("");

  // Guard: if not signed into a till session, go to /login
  useEffect(() => {
    if (!shopId || !staffId) {
      router.replace("/login");
    }
  }, [shopId, staffId, router]);

  // Load today's sales made by this attendant from Dexie
  useEffect(() => {
    if (!shopId) return;

    let active = true;
    (async () => {
      try {
        const outboxSales = await tilldb.outbox
          .where("shopId")
          .equals(shopId)
          .toArray();

        if (!active) return;

        const mySales = outboxSales
          .filter((s) => s.staffId === staffId)
          .map((s) => ({
            saleId: s.saleId,
            total: s.total,
            occurredAt: s.occurredAt,
            status: s.status,
            itemCount: s.lines.reduce((acc, l) => acc + l.quantity, 0),
          }))
          .sort((a, b) => b.occurredAt - a.occurredAt);

        setSales(mySales);
        setPendingCount(outboxSales.filter((s) => s.status !== "synced").length);
      } catch {
        /* offline fallback */
      }
    })();

    return () => {
      active = false;
    };
  }, [shopId, staffId]);

  const todayRevenue = sales.reduce((acc, s) => acc + s.total, 0);

  function handleRecordCashDrop() {
    const amt = Number.parseFloat(dropAmount);
    if (!amt || amt <= 0 || !dropReason.trim()) {
      setDropMsg("Enter a valid cash amount and expense reason.");
      return;
    }
    // Save petty cash record to localStorage log for shift accounting
    try {
      const dropKey = `stockfindr-cashdrops-${shopId}-${staffId}`;
      const existing = JSON.parse(localStorage.getItem(dropKey) || "[]");
      existing.unshift({
        id: crypto.randomUUID(),
        amount: amt,
        reason: dropReason.trim(),
        timestamp: Date.now(),
      });
      localStorage.setItem(dropKey, JSON.stringify(existing));
    } catch {
      /* ignore */
    }

    setDropAmount("");
    setDropReason("");
    setDropMsg("");
    setCashDropOpen(false);
  }

  return (
    <OwnerShell>
      <TopBar
        title="My Counter Till"
        sub={mounted ? `${shopName || "Till"} • Counter Active` : undefined}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={pendingCount > 0 ? "amber" : "green"}>
              {pendingCount > 0 ? `${pendingCount} queued offline` : "All Synced"}
            </Badge>
            <Btn
              size="sm"
              variant="secondary"
              onClick={() => {
                setSession({ staffId: "", staffName: "", staffEmail: "" });
                router.push("/login");
              }}
            >
              <IconLock className="size-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </Btn>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Attendant Shift Greeting Banner */}
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">
              Hello, {staffName || "Attendant"}
            </h1>
            <p className="mt-0.5 text-xs text-stone-500">
              Your register is active at <b>{shopName || "this store"}</b>. All sales queue offline if the internet drops.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Btn size="md" onClick={() => router.push("/sell")} className="font-semibold shadow-xs">
              <IconSell className="size-4" />
              <span>Open POS Register</span>
            </Btn>
          </div>
        </div>

        {/* Shift Metrics */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="My Sales Today"
            value={`₦${todayRevenue.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
            trend={`${sales.length} transactions completed`}
          />
          <Stat
            label="Transactions Count"
            value={String(sales.length)}
            trend="Rounds served at register"
          />
          <Stat
            label="Offline Queue"
            value={String(pendingCount)}
            trend={pendingCount ? "Pending background sync" : "Everything backed up"}
          />
        </div>

        {/* Fast Action Cards */}
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
            Counter Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/sell"
              className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-xs dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                <IconSell className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-stone-900 dark:text-white">Sell & Scan</p>
                <p className="truncate text-xs text-stone-500">Checkout items, barcodes & cash</p>
              </div>
            </Link>

            <Link
              href="/products"
              className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-xs dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                <IconProducts className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-stone-900 dark:text-white">Stock Lookup</p>
                <p className="truncate text-xs text-stone-500">Check shelf prices & quantities</p>
              </div>
            </Link>

            <button
              onClick={() => setCashDropOpen(true)}
              className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand-500 hover:shadow-xs dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <IconAlertTriangle className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-stone-900 dark:text-white">Petty Cash Drop</p>
                <p className="truncate text-xs text-stone-500">Log cash taken from drawer</p>
              </div>
            </button>
          </div>
        </div>

        {/* My Recent Sales Feed */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              My Recent Register Sales
            </h2>
            <span className="text-xs text-stone-400">Today&apos;s shift feed</span>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {sales.slice(0, 10).map((s) => (
                <div key={s.saleId} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-900 dark:text-white">
                        ₦{s.total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                      <Badge tone={s.status === "synced" ? "green" : "amber"}>
                        {s.status === "synced" ? "Synced" : "Queued"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {new Date(s.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {s.itemCount} items
                    </p>
                  </div>
                  <span className="font-mono text-xs text-stone-400">
                    #{s.saleId.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>

            {!sales.length && (
              <div className="px-4 py-8">
                <Empty>No sales recorded yet this shift. Tap &apos;Open POS Register&apos; to start.</Empty>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Petty Cash Drop Modal */}
      <Modal isOpen={cashDropOpen} onClose={() => setCashDropOpen(false)} title="Log Cash Drawer Removal">
        <div className="space-y-4">
          <p className="text-xs text-stone-500">
            Record any physical cash removed from the drawer (e.g., generator fuel, delivery courier, supplier payment).
          </p>

          <Field label="Cash Amount (₦)">
            <input
              value={dropAmount}
              onChange={(e) => setDropAmount(e.target.value)}
              placeholder="e.g. 2500"
              type="number"
              inputMode="decimal"
              className={inputCls}
            />
          </Field>

          <Field label="Reason / Expense Tag">
            <input
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              placeholder="e.g. Generator Fuel / Dispatch Fee"
              className={inputCls}
            />
          </Field>

          {dropMsg && <p className="text-xs text-red-600 dark:text-red-400">{dropMsg}</p>}

          <div className="flex gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setCashDropOpen(false)} className="flex-1">
              Cancel
            </Btn>
            <Btn onClick={handleRecordCashDrop} className="flex-1 font-semibold">
              Save Cash Drop
            </Btn>
          </div>
        </div>
      </Modal>
    </OwnerShell>
  );
}
