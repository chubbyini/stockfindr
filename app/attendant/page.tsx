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
  IconCheck,
  IconStore,
} from "@/components/icons";
import {
  getOpenShift,
  startShift,
  recordDropToShift,
  closeShift,
} from "@/lib/shifts";
import type { TillShift } from "@/lib/types";

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
  const { shopId, shopName, staffId, staffName, shiftId, setSession } = useSession();
  const router = useRouter();
  const mounted = useHydration();

  const [sales, setSales] = useState<AttendantSale[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Shift & Cash Drawer State
  const [shift, setShift] = useState<TillShift | null>(null);
  const [openFloatModalOpen, setOpenFloatModalOpen] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState("");
  const [openingFloatMsg, setOpeningFloatMsg] = useState("");

  // Cash Drop State
  const [cashDropOpen, setCashDropOpen] = useState(false);
  const [dropAmount, setDropAmount] = useState("");
  const [dropReason, setDropReason] = useState("");
  const [dropMsg, setDropMsg] = useState("");

  // Close Till Reconciliation State
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [closeShiftMsg, setCloseShiftMsg] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);

  // Z-Report Summary Modal State
  const [zReportModalOpen, setZReportModalOpen] = useState(false);
  const [zReportData, setZReportData] = useState<TillShift | null>(null);

  // Guard: if not signed into a till session, verify storage before redirecting
  useEffect(() => {
    if (!mounted) return;

    const currentStaffId =
      staffId || (typeof window !== "undefined" ? localStorage.getItem("tilltrail-staff-id") : null);
    const currentShopId =
      shopId || (typeof window !== "undefined" ? localStorage.getItem("tilltrail-shop") : null);

    if (!currentStaffId || !currentShopId) {
      router.replace("/login");
      return;
    }

    if (!staffId && currentStaffId) {
      setSession({
        staffId: currentStaffId,
        staffName:
          (typeof window !== "undefined" && localStorage.getItem("tilltrail-staff-name")) ||
          "Counter Attendant",
        shopId: currentShopId,
        shopName:
          (typeof window !== "undefined" && localStorage.getItem("tilltrail-shop-name")) ||
          currentShopId,
        role:
          (typeof window !== "undefined" &&
            (localStorage.getItem("tilltrail-role") as "owner" | "attendant")) ||
          "attendant",
      });
    }
  }, [mounted, shopId, staffId, router, setSession]);

  // Load Active Shift
  useEffect(() => {
    if (!shopId || !staffId) return;

    let active = true;
    (async () => {
      try {
        const current = await getOpenShift(shopId, staffId);
        if (!active) return;
        setShift(current);
        if (current) {
          setSession({ shiftId: current.id });
        } else {
          setOpenFloatModalOpen(true);
        }
      } catch {
        /* offline fallback */
      }
    })();

    return () => {
      active = false;
    };
  }, [shopId, staffId, setSession]);

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

  // Handle Starting a Shift with Opening Cash Float
  async function handleStartShift(zeroFloat = false) {
    const floatVal = zeroFloat ? 0 : Number.parseFloat(openingFloatInput);
    if (!zeroFloat && (isNaN(floatVal) || floatVal < 0)) {
      setOpeningFloatMsg("Enter a valid opening cash float (or 0 for empty drawer).");
      return;
    }

    try {
      const newShift = await startShift(shopId, staffId, staffName, floatVal || 0);
      setShift(newShift);
      setSession({ shiftId: newShift.id });
      setOpenFloatModalOpen(false);
      setOpeningFloatInput("");
      setOpeningFloatMsg("");
    } catch {
      setOpeningFloatMsg("Could not start shift. Please retry.");
    }
  }

  // Handle Logging Cash Drop (Petty Cash / Owner Pickup)
  async function handleRecordCashDrop() {
    const amt = Number.parseFloat(dropAmount);
    if (!amt || amt <= 0 || !dropReason.trim()) {
      setDropMsg("Enter a valid cash amount and expense reason.");
      return;
    }

    try {
      if (shift?.id) {
        await recordDropToShift(shift.id, amt);
        // Refresh shift state
        const refreshed = await getOpenShift(shopId, staffId);
        if (refreshed) setShift(refreshed);
      }

      // Also persist to local log
      const dropKey = `stockfindr-cashdrops-${shopId}-${staffId}`;
      const existing = JSON.parse(localStorage.getItem(dropKey) || "[]");
      existing.unshift({
        id: crypto.randomUUID(),
        amount: amt,
        reason: dropReason.trim(),
        timestamp: Date.now(),
      });
      localStorage.setItem(dropKey, JSON.stringify(existing));

      setDropAmount("");
      setDropReason("");
      setDropMsg("");
      setCashDropOpen(false);
    } catch {
      setDropMsg("Failed to record cash drop.");
    }
  }

  // Live Variance for Close Till Modal
  const countedNum = Number.parseFloat(countedCashInput);
  const expectedNum = shift ? shift.expectedCash : 0;
  const hasCountedInput = !isNaN(countedNum);
  const liveVariance = hasCountedInput ? Math.round((countedNum - expectedNum) * 100) / 100 : 0;

  // Handle Closing the Shift (End of Day Z-Report)
  async function handleCloseShift() {
    if (!shift?.id) return;
    if (isNaN(countedNum) || countedNum < 0) {
      setCloseShiftMsg("Please enter the total physical cash counted in the drawer.");
      return;
    }

    setClosingBusy(true);
    setCloseShiftMsg("");
    try {
      const finalized = await closeShift(shift.id, countedNum, shiftNotes);
      setShift(null);
      setSession({ shiftId: "" });
      setCloseShiftOpen(false);
      setCountedCashInput("");
      setShiftNotes("");

      // Open Z-Report modal
      setZReportData(finalized);
      setZReportModalOpen(true);
    } catch {
      setCloseShiftMsg("Could not close shift. Please try again.");
    } finally {
      setClosingBusy(false);
    }
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
              Register active at <b>{shopName || "this store"}</b>. All sales queue offline if network drops.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Btn size="md" onClick={() => router.push("/sell")} className="font-semibold shadow-xs">
              <IconSell className="size-4" />
              <span>Open POS Register</span>
            </Btn>
          </div>
        </div>

        {/* Cash Drawer & Shift Float Reconciliation Card */}
        <Card className="p-5 sm:p-6 border-stone-200 dark:border-stone-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4 dark:border-stone-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-base font-bold text-stone-900 dark:text-white">
                  Cash Drawer &amp; Shift Reconciliation
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-stone-500">
                {shift
                  ? `Shift started at ${new Date(shift.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "No shift active. Enter opening float to balance cash."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {shift ? (
                <>
                  <Btn size="sm" variant="secondary" onClick={() => setCashDropOpen(true)}>
                    <IconAlertTriangle className="size-3.5" />
                    <span>Log Cash Drop</span>
                  </Btn>
                  <Btn size="sm" onClick={() => setCloseShiftOpen(true)} className="font-semibold">
                    <IconCheck className="size-3.5" />
                    <span>Close Till &amp; Reconcile</span>
                  </Btn>
                </>
              ) : (
                <Btn size="sm" onClick={() => setOpenFloatModalOpen(true)} className="font-semibold">
                  <span>Start Shift (Opening Float)</span>
                </Btn>
              )}
            </div>
          </div>

          {shift ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-stone-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Opening Cash Float
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-stone-900 dark:text-white">
                  ₦{shift.openingFloat.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">Starting drawer cash</p>
              </div>

              <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-stone-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Cash Sales Rung
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  ₦{shift.cashSales.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  +₦{shift.transferSales.toLocaleString("en-NG", { minimumFractionDigits: 2 })} transfer
                </p>
              </div>

              <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-stone-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Petty Cash Drops
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                  -₦{shift.cashDrops.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-500">Expenses / withdrawals</p>
              </div>

              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Expected Cash in Drawer
                </p>
                <p className="mt-1 font-mono text-xl font-black text-emerald-950 dark:text-emerald-200">
                  ₦{shift.expectedCash.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  Must match physical drawer
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-6 text-center dark:border-stone-800">
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                No active till shift for this session.
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Enter your starting drawer float to track cash accurately and prevent shortages.
              </p>
              <Btn size="sm" onClick={() => setOpenFloatModalOpen(true)} className="mt-3 font-semibold">
                Open Cash Drawer Float
              </Btn>
            </div>
          )}
        </Card>

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
                <p className="truncate text-sm font-bold text-stone-900 dark:text-white">Sell &amp; Scan</p>
                <p className="truncate text-xs text-stone-500">Checkout items, barcodes &amp; cash</p>
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
                <p className="truncate text-xs text-stone-500">Check shelf prices &amp; quantities</p>
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

      {/* 1. Modal: Opening Cash Float */}
      <Modal
        isOpen={openFloatModalOpen}
        onClose={() => setOpenFloatModalOpen(false)}
        title="Start Shift &bull; Opening Cash Float"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-500">
            Count the physical cash currently inside the cash drawer before making sales. This ensures accurate reconciliation at the end of the shift.
          </p>

          <Field label="Opening Cash in Drawer (₦)" hint="Example: 10000 for change float">
            <input
              value={openingFloatInput}
              onChange={(e) => setOpeningFloatInput(e.target.value)}
              placeholder="0.00"
              type="number"
              inputMode="decimal"
              autoFocus
              className={`${inputCls} text-lg font-mono font-semibold`}
            />
          </Field>

          {openingFloatMsg && <p className="text-xs text-red-600 dark:text-red-400">{openingFloatMsg}</p>}

          <div className="flex flex-col gap-2 pt-2">
            <Btn onClick={() => handleStartShift(false)} className="w-full font-semibold">
              Confirm Opening Float &amp; Start Shift
            </Btn>
            <Btn variant="secondary" onClick={() => handleStartShift(true)} className="w-full text-xs">
              Start with ₦0 Float (Empty Drawer)
            </Btn>
          </div>
        </div>
      </Modal>

      {/* 2. Modal: Petty Cash Drop */}
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

      {/* 3. Modal: Close Till & End-of-Day Reconciliation */}
      <Modal
        isOpen={closeShiftOpen}
        onClose={() => setCloseShiftOpen(false)}
        title="End of Shift &bull; Cash Drawer Reconciliation"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-500">
            Count all physical banknotes and coins currently in the register. The system will compare your count against expected sales to detect shortages or overages.
          </p>

          {shift && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs space-y-1.5 dark:border-stone-800 dark:bg-stone-950/50">
              <div className="flex justify-between text-stone-500">
                <span>Opening Float:</span>
                <span className="font-mono">₦{shift.openingFloat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>Cash Sales Rung:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">+₦{shift.cashSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>Petty Cash Drops:</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">-₦{shift.cashDrops.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-stone-200 pt-1.5 text-stone-900 dark:border-stone-800 dark:text-white">
                <span>Expected Drawer Total:</span>
                <span className="font-mono text-sm">₦{shift.expectedCash.toFixed(2)}</span>
              </div>
            </div>
          )}

          <Field label="Actual Physical Cash Counted (₦)" hint="Count notes and coins in the drawer right now">
            <input
              value={countedCashInput}
              onChange={(e) => setCountedCashInput(e.target.value)}
              placeholder="0.00"
              type="number"
              inputMode="decimal"
              autoFocus
              className={`${inputCls} text-xl font-mono font-bold`}
            />
          </Field>

          {/* Real-time Variance Badge */}
          {hasCountedInput && (
            <div
              className={`rounded-xl border p-3 text-center text-xs font-bold ${
                liveVariance === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : liveVariance < 0
                  ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                  : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
              }`}
            >
              {liveVariance === 0 && "✓ Exact Match: Drawer is perfectly balanced!"}
              {liveVariance < 0 && `⚠ Cash Shortage: -₦${Math.abs(liveVariance).toFixed(2)} (Cash missing from drawer)`}
              {liveVariance > 0 && `ℹ Cash Overage: +₦${liveVariance.toFixed(2)} (Extra cash in drawer)`}
            </div>
          )}

          <Field label="Handover Notes / Discrepancy Reason" hint="Optional explanation for manager or shift log">
            <textarea
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Balanced drawer handed to Sarah / Change shortage of ₦50"
              className={inputCls}
            />
          </Field>

          {closeShiftMsg && <p className="text-xs text-red-600 dark:text-red-400">{closeShiftMsg}</p>}

          <div className="flex gap-2 pt-2">
            <Btn variant="secondary" onClick={() => setCloseShiftOpen(false)} className="flex-1">
              Cancel
            </Btn>
            <Btn
              onClick={handleCloseShift}
              disabled={closingBusy || !hasCountedInput}
              className="flex-1 font-semibold"
            >
              {closingBusy ? "Closing Till…" : "Finalize &amp; Close Till"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* 4. Modal: Z-Report Summary */}
      <Modal
        isOpen={zReportModalOpen}
        onClose={() => setZReportModalOpen(false)}
        title="Shift Z-Report &bull; Finalized"
      >
        {zReportData && (
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-white p-4 font-mono text-xs space-y-2 dark:border-stone-800 dark:bg-stone-950">
              <div className="text-center border-b border-stone-200 pb-2 dark:border-stone-800">
                <p className="font-bold text-sm text-stone-900 dark:text-white uppercase tracking-wider">
                  {shopName || "Stockfindr POS"}
                </p>
                <p className="text-[10px] text-stone-400">SHIFT Z-REPORT RECONCILIATION</p>
              </div>

              <div className="flex justify-between">
                <span className="text-stone-500">Cashier:</span>
                <span className="font-bold text-stone-900 dark:text-white">{zReportData.staffName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Opened:</span>
                <span>{new Date(zReportData.openedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Closed:</span>
                <span>{zReportData.closedAt ? new Date(zReportData.closedAt).toLocaleTimeString() : "Now"}</span>
              </div>

              <div className="border-t border-dashed border-stone-200 pt-2 space-y-1 dark:border-stone-800">
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <span>₦{zReportData.openingFloat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash Sales:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">+₦{zReportData.cashSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transfer Sales:</span>
                  <span>₦{zReportData.transferSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash Drops:</span>
                  <span className="text-amber-600 dark:text-amber-400">-₦{zReportData.cashDrops.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-stone-200 pt-2 space-y-1 font-bold text-stone-900 dark:border-stone-800 dark:text-white">
                <div className="flex justify-between">
                  <span>Expected Cash:</span>
                  <span>₦{zReportData.expectedCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Actual Counted:</span>
                  <span>₦{(zReportData.countedCash || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-stone-200 pt-1 dark:border-stone-800">
                  <span>Variance:</span>
                  <span
                    className={
                      (zReportData.variance || 0) === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : (zReportData.variance || 0) < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-blue-600 dark:text-blue-400"
                    }
                  >
                    ₦{(zReportData.variance || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {zReportData.notes && (
                <div className="border-t border-stone-200 pt-2 text-[11px] text-stone-500 dark:border-stone-800">
                  <span className="font-semibold">Notes:</span> {zReportData.notes}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Btn
                variant="secondary"
                onClick={() => window.print()}
                className="flex-1 text-xs"
              >
                Print / Export Z-Report
              </Btn>
              <Btn
                onClick={() => {
                  setZReportModalOpen(false);
                  setOpenFloatModalOpen(true);
                }}
                className="flex-1 font-semibold text-xs"
              >
                Start New Shift
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </OwnerShell>
  );
}
