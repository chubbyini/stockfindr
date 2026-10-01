"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const emptySubscribe = () => () => {};
function useHydration() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
import { useCart, useSession, round2 } from "@/store/pos";
import { useOwner } from "@/lib/auth/owner";
import { tilldb } from "@/lib/db/dexie";
import { db, enableOffline } from "@/lib/firebase/client";
import { pushOutbox } from "@/lib/sync/push";
import { diagnoseSync, type SyncDiagnosis } from "@/lib/sync/diagnose";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import type { Product } from "@/lib/types";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Badge, Btn, Empty, TopBar, inputCls, Card } from "@/components/ui";
import { EnsureOwnerTillAccount } from "@/components/owner-pin-setup";
import OwnerShell from "@/components/owner-shell";
import {
  IconCamera,
  IconPlus,
  IconMinus,
  IconLock,
  IconSell,
} from "@/components/icons";
import { getOpenShift, startShift, recordSaleToShift } from "@/lib/shifts";

function beep(ok = true) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 200);
  } catch {
    /* no audio */
  }
}

export default function SellPage() {
  const { lines, add, inc, dec, clear, restore, total } = useCart();
  const { shopId, shopName, staffId, staffName, deviceId, setSession } = useSession();
  const { user: fbUser, loading: fbLoading } = useOwner();
  const router = useRouter();

  const mounted = useHydration();

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [pending, setPending] = useState(0);
  const [syncErr, setSyncErr] = useState("");
  const [diag, setDiag] = useState<SyncDiagnosis | null>(null);

  // Mobile cart drawer toggle
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  async function runDiag() {
    setDiag(await diagnoseSync(shopId));
  }

  const [toast, setToast] = useState<null | { saleId: string; lines: typeof lines }>(null);
  const [scanMsg, setScanMsg] = useState("");
  const [quickAdd, setQuickAdd] = useState<null | { barcode: string }>(null);
  const [qaName, setQaName] = useState("");
  const [qaPrice, setQaPrice] = useState("");

  useEffect(() => {
    enableOffline();
    loadLocal();
    const t = setInterval(syncNow, 15000);
    const promo = setInterval(promoteHeld, 2000);
    return () => {
      clearInterval(t);
      clearInterval(promo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (fbLoading) return;
    const s = useSession.getState();
    if (s.staffId) return;
    (async () => {
      if (fbUser) {
        try {
          const snap = await getDoc(doc(db, "shops", s.shopId));
          if ((snap.data()?.ownerUid as string) === fbUser.uid) {
            const saved = localStorage.getItem("tilltrail-counter-name");
            const name =
              saved || fbUser.displayName || fbUser.email?.split("@")[0] || "Owner";
            localStorage.setItem("tilltrail-counter-name", name);
            setSession({
              role: "owner",
              staffId: `owner-${fbUser.uid}`,
              staffName: name,
              staffEmail: fbUser.email || "",
            });
            return;
          }
        } catch {
          /* fall through */
        }
        // Fallback for authenticated owner even if shop read errors
        const saved = localStorage.getItem("tilltrail-counter-name");
        const name = saved || fbUser.displayName || fbUser.email?.split("@")[0] || "Owner";
        setSession({
          role: "owner",
          staffId: `owner-${fbUser.uid}`,
          staffName: name,
          staffEmail: fbUser.email || "",
        });
        return;
      }
      router.push("/pin");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbLoading]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const lock = () => {
      setSession({ staffId: "", staffName: "", staffEmail: "" });
      router.push("/pin");
    };
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(lock, 5 * 60 * 1000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("touchstart", reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("touchstart", reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLocal() {
    const local = await tilldb.products.where("shopId").equals(shopId).toArray();
    setCatalog(local);
    const count = await tilldb.outbox
      .where("shopId")
      .equals(shopId)
      .filter((s) => s.status !== "synced")
      .count();
    setPending(count);

    try {
      const q = query(
        collection(db, `shops/${shopId}/products`),
        where("status", "in", ["active", "pending_review"])
      );
      const snap = await getDocs(q);
      const remote = snap.docs.map(
        (d) => ({ id: d.id, shopId, ...d.data() } as Product)
      );
      if (remote.length) {
        setCatalog(remote);
        await tilldb.products.bulkPut(remote);
      }
    } catch {
      /* offline */
    }
  }

  async function promoteHeld() {
    const due = await tilldb.outbox
      .where("syncAfter")
      .belowOrEqual(Date.now())
      .toArray();
    for (const s of due.filter((x) => x.status === "held")) {
      await tilldb.outbox.update(s.saleId, { status: "pending" });
    }
    const count = await tilldb.outbox
      .where("shopId")
      .equals(shopId)
      .filter((s) => s.status !== "synced")
      .count();
    setPending(count);
  }

  async function syncNow() {
    try {
      const r = await pushOutbox(shopId);
      if (r.pushed) loadLocal();
      if (r.failed > 0) {
        const f = await tilldb.outbox
          .where("shopId")
          .equals(shopId)
          .filter((s) => s.status === "failed")
          .first();
        const raw = f?.lastError || "will retry automatically";
        setSyncErr(
          "Sync stuck: " + raw.replace(/^FirebaseError:\s*/, "").slice(0, 120)
        );
      } else {
        setSyncErr("");
      }
    } catch {
      /* badge only */
    }
  }

  function findByBarcode(code: string) {
    return catalog.find((p) => p.barcode === code);
  }

  function handleBarcode(code: string) {
    const p = findByBarcode(code.trim());
    if (p) {
      add({ productId: p.id, name: p.name, price: p.price });
      beep(true);
      setScanMsg(`Added ${p.name}`);
    } else {
      beep(false);
      setQuickAdd({ barcode: code.trim() });
    }
  }

  async function startCameraScan() {
    setScanMsg("Point camera at barcode…");
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        undefined as unknown as string
      );
      handleBarcode(result.getText());
    } catch {
      setScanMsg("Camera scan failed — type barcode or tap a tile.");
    }
  }

  async function confirmSale() {
    if (!lines.length) return;
    const short = lines.filter((l) => {
      const p = catalog.find((c) => c.id === l.productId);
      return p != null && l.quantity > (p.current_stock ?? 0) + 1e-9;
    });
    if (short.length) {
      const p = catalog.find((c) => c.id === short[0].productId);
      setSyncErr(
        `Not enough ${p?.name ?? "stock"} — only ${
          p?.current_stock ?? 0
        } left. Restock it first.`
      );
      beep(false);
      return;
    }
    setSyncErr("");
    const saleId = crypto.randomUUID();
    const occurredAt = Date.now();
    const saleTotal = round2(total());
    await tilldb.outbox.put({
      saleId,
      shopId,
      staffId: staffId || "unknown",
      deviceId,
      lines: [...lines],
      total: saleTotal,
      occurredAt,
      status: "held",
      syncAfter: occurredAt + 10000,
      attempts: 0,
    });

    // Record sale against the active till shift for drawer balancing
    let currentShiftId = useSession.getState().shiftId;
    if (!currentShiftId && shopId && staffId) {
      try {
        const autoShift = await startShift(shopId, staffId, staffName, 0);
        currentShiftId = autoShift.id;
        setSession({ shiftId: autoShift.id });
      } catch {
        /* offline */
      }
    }
    if (currentShiftId) {
      recordSaleToShift(currentShiftId, saleTotal, paymentMethod).catch(() => {});
    }

    setToast({ saleId, lines: [...lines] });
    clear();
    setMobileCartOpen(false);
    setTimeout(async () => {
      setToast(null);
      await tilldb.outbox.update(saleId, { status: "pending" }).catch(() => {});
      syncNow();
    }, 10000);
  }

  async function undo() {
    if (!toast) return;
    await tilldb.outbox.delete(toast.saleId).catch(() => {});
    restore(toast.lines);
    setToast(null);
  }

  async function quickAddSave() {
    if (!qaName || !qaPrice) return;
    const id = "p-" + crypto.randomUUID().slice(0, 8);
    const prod: Product = {
      id,
      shopId,
      barcode: quickAdd?.barcode || null,
      name: qaName,
      price: Number.parseFloat(qaPrice),
      cost_price: null,
      reorder_level: 5,
      is_pinned: false,
      current_stock: 0,
      status: "pending_review",
      created_by: staffId,
      updatedAt: Date.now(),
    };
    await tilldb.products.put(prod);
    setCatalog((c) => [...c, prod]);
    add({ productId: id, name: prod.name, price: prod.price });
    try {
      const { setDoc } = await import("firebase/firestore");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _drop, ...body } = prod;
      await setDoc(doc(db, `shops/${shopId}/products/${id}`), body);
    } catch {
      /* will sync later */
    }
    setQuickAdd(null);
    setQaName("");
    setQaPrice("");
  }

  const pinned = catalog.filter((p) => p.is_pinned);
  const rest = catalog.filter((p) => !p.is_pinned);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? catalog
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.barcode || "").toLowerCase().includes(q)
        )
        .slice(0, 30)
    : [...pinned, ...rest].slice(0, 24);

  const totalLineCount = lines.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <OwnerShell>
      <EnsureOwnerTillAccount />
      <TopBar
        title="Sell POS"
        sub={mounted ? `${shopName || "Till"} • ${staffName || "Attendant"}` : undefined}
        right={
          <span className="flex items-center gap-2">
            <Badge tone={pending ? "amber" : "green"}>
              {pending ? `${pending} queued` : "synced"}
            </Badge>
            <Btn
              size="sm"
              variant="secondary"
              onClick={() => {
                setSession({ staffId: "", staffName: "", staffEmail: "" });
                router.push("/pin");
              }}
            >
              <IconLock className="size-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </Btn>
          </span>
        }
      />

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-3.5 sm:px-6 py-4 md:grid-cols-[1fr_360px] pb-28 md:pb-8">
        {/* Left Column: Product Search & Tile Grid */}
        <section className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or type barcode + Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search) handleBarcode(search);
                }}
                className={`${inputCls} min-h-11 pl-3.5`}
              />
            </div>
            <Btn size="md" variant="secondary" onClick={startCameraScan} className="shrink-0">
              <IconCamera className="size-4" />
              <span>Scan</span>
            </Btn>
          </div>

          {scanMsg && (
            <p
              className={`text-xs font-semibold ${
                scanMsg.startsWith("Added")
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-stone-500"
              }`}
            >
              {scanMsg}
            </p>
          )}

          {syncErr && (
            <div className="rounded-xl bg-red-50 p-3 text-xs border border-red-200 dark:bg-red-950/40 dark:border-red-800">
              <p className="font-semibold text-red-700 dark:text-red-300">{syncErr}</p>
              {!diag ? (
                <button
                  onClick={runDiag}
                  className="mt-1 font-bold text-stone-800 underline dark:text-stone-200"
                >
                  Diagnose connection
                </button>
              ) : (
                <div className="mt-2 text-stone-700 dark:text-stone-300 space-y-1">
                  <p>
                    {diag.signedIn
                      ? `Signed in: ${diag.email || diag.uid}`
                      : "Not signed in"}
                  </p>
                  {diag.fix && <p className="font-semibold">{diag.fix}</p>}
                </div>
              )}
            </div>
          )}

          {/* Product Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filtered.map((p) => {
              const isLow = (p.current_stock ?? 0) <= (p.reorder_level ?? 5);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    add({ productId: p.id, name: p.name, price: p.price });
                    beep(true);
                  }}
                  className="flex flex-col justify-between p-3.5 rounded-xl border border-stone-200 bg-white text-left shadow-xs transition hover:border-brand-500 active:scale-[0.98] dark:border-stone-800 dark:bg-stone-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-stone-400">
                        {p.is_pinned ? "PINNED" : "ITEM"}
                      </span>
                      {isLow && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                          Low: {p.current_stock}
                        </span>
                      )}
                    </div>
                    <h4 className="mt-1.5 text-sm font-bold text-stone-900 dark:text-white line-clamp-2 leading-snug">
                      {p.name}
                    </h4>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                    <span className="font-mono text-sm font-bold text-brand-700 dark:text-brand-400">
                      ₦{p.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-stone-500">Stock: {p.current_stock}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {!filtered.length && (
            <Empty>
              {q
                ? "No products match your search."
                : "No products added yet. Add products in Inventory."}
            </Empty>
          )}
        </section>

        {/* Right Column / Desktop Basket View */}
        <section className="hidden md:block">
          <Card className="p-4 sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
              <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <IconSell className="size-4 text-brand-600" />
                Current Basket
              </h3>
              <span className="text-xs font-semibold text-stone-500">
                {totalLineCount} items
              </span>
            </div>

            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
              {lines.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-400">
                  Basket is empty. Tap items or scan barcodes to start order.
                </div>
              ) : (
                lines.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-950/40"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                        {l.name}
                      </p>
                      <p className="text-xs font-mono text-stone-500">
                        ₦{(l.price * l.quantity).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => dec(l.productId)}
                        className="flex size-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      >
                        <IconMinus className="size-3" />
                      </button>
                      <span className="w-6 text-center font-mono text-xs font-bold">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => inc(l.productId)}
                        className="flex size-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      >
                        <IconPlus className="size-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Total
                </span>
                <span className="font-mono text-2xl font-extrabold text-stone-900 dark:text-white">
                  ₦{total().toFixed(2)}
                </span>
              </div>
              {/* Tender Selector */}
              <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-800 dark:bg-stone-900">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex flex-1 items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                    paymentMethod === "cash"
                      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                      : "text-stone-500 hover:text-stone-900 dark:text-stone-400"
                  }`}
                >
                  Cash Tender
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={`flex flex-1 items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                    paymentMethod === "transfer"
                      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                      : "text-stone-500 hover:text-stone-900 dark:text-stone-400"
                  }`}
                >
                  Bank Transfer
                </button>
              </div>

              <Btn
                size="lg"
                onClick={confirmSale}
                disabled={!lines.length}
                className="w-full text-base font-bold"
              >
                Complete {paymentMethod === "cash" ? "Cash" : "Transfer"} Sale (₦{total().toFixed(2)})
              </Btn>

              {toast && (
                <div className="flex items-center justify-between rounded-xl bg-stone-900 p-3 text-xs text-white">
                  <span>Sale Recorded ✓</span>
                  <button
                    onClick={undo}
                    className="font-bold underline underline-offset-2 hover:text-stone-200"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>
          </Card>
        </section>
      </main>

      {/* Mobile Floating Cart Summary Bar */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-stone-200 bg-white p-3 shadow-lg md:hidden dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
          <div>
            <p className="text-xs font-bold text-stone-500">
              Basket ({totalLineCount} items)
            </p>
            <p className="font-mono text-lg font-extrabold text-stone-900 dark:text-white">
              ₦{total().toFixed(2)}
            </p>
          </div>

          <Btn
            size="md"
            disabled={!lines.length}
            onClick={() => setMobileCartOpen(true)}
            className="px-5 font-bold"
          >
            Review & Pay
          </Btn>
        </div>
      </div>

      {/* Mobile Cart Modal Drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-stone-950/70 backdrop-blur-xs md:hidden">
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-stone-900 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 dark:border-stone-800">
              <h3 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <IconSell className="size-5 text-brand-600" />
                Current Basket ({totalLineCount} items)
              </h3>
              <button
                onClick={() => setMobileCartOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {lines.map((l) => (
                <div
                  key={l.productId}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                      {l.name}
                    </p>
                    <p className="text-xs font-mono text-stone-500">
                      ₦{(l.price * l.quantity).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => dec(l.productId)}
                      className="flex size-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700"
                    >
                      <IconMinus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center font-mono text-sm font-bold">
                      {l.quantity}
                    </span>
                    <button
                      onClick={() => inc(l.productId)}
                      className="flex size-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700"
                    >
                      <IconPlus className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Total Amount
                </span>
                <span className="font-mono text-2xl font-extrabold text-stone-900 dark:text-white">
                  ₦{total().toFixed(2)}
                </span>
              </div>

              {/* Mobile Tender Selector */}
              <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-800 dark:bg-stone-900">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex flex-1 items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                    paymentMethod === "cash"
                      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                      : "text-stone-500 hover:text-stone-900 dark:text-stone-400"
                  }`}
                >
                  Cash Tender
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={`flex flex-1 items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                    paymentMethod === "transfer"
                      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                      : "text-stone-500 hover:text-stone-900 dark:text-stone-400"
                  }`}
                >
                  Bank Transfer
                </button>
              </div>

              <Btn
                size="lg"
                onClick={confirmSale}
                disabled={!lines.length}
                className="w-full text-base font-bold"
              >
                Confirm {paymentMethod === "cash" ? "Cash" : "Transfer"} Sale (₦{total().toFixed(2)})
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Unbarcoded Product Modal */}
      {quickAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-bold text-stone-900 dark:text-white">
              Unrecognized Barcode
            </h3>
            <p className="mt-1 font-mono text-xs text-stone-500">
              Barcode: {quickAdd.barcode}
            </p>

            <div className="mt-4 space-y-3">
              <input
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Product name"
                className={inputCls}
              />
              <input
                value={qaPrice}
                onChange={(e) => setQaPrice(e.target.value)}
                placeholder="Price (e.g. 500.00)"
                inputMode="decimal"
                className={inputCls}
              />
            </div>

            <div className="mt-5 flex gap-2">
              <Btn
                variant="secondary"
                onClick={() => setQuickAdd(null)}
                className="flex-1"
              >
                Cancel
              </Btn>
              <Btn onClick={quickAddSave} className="flex-1">
                Add & Add to Cart
              </Btn>
            </div>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
