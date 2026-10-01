import {
  doc,
  runTransaction,
  serverTimestamp,
  increment,
  collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import type { OutboxSale } from "@/lib/types";

// Push pending outbox sales to Firestore idempotently.
// Doc ID = client UUID, so retries never double-count.
export async function pushOutbox(shopId: string): Promise<{ pushed: number; failed: number }> {
  const now = Date.now();
  const due = await tilldb.outbox
    .where("shopId")
    .equals(shopId)
    .filter((s) => (s.status === "pending" || s.status === "failed") && s.syncAfter <= now)
    .toArray();

  let pushed = 0;
  let failed = 0;

  for (const sale of due) {
    try {
      await pushOneSale(sale);
      await tilldb.outbox.update(sale.saleId, { status: "synced" });
      // keep synced briefly for undo audit, then delete
      pushed++;
    } catch (e) {
      failed++;
      const attempts = (sale.attempts || 0) + 1;
      await tilldb.outbox.update(sale.saleId, {
        status: "failed",
        attempts,
        lastError: e instanceof Error ? e.message : String(e),
        // exponential backoff: 5s, 20s, 60s, cap 5min
        syncAfter: Date.now() + Math.min(5 * 60 * 1000, 5000 * Math.pow(2, attempts)),
      });
    }
  }
  return { pushed, failed };
}

async function pushOneSale(sale: OutboxSale) {
  const saleRef = doc(db, `shops/${sale.shopId}/sales/${sale.saleId}`);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(saleRef);
    if (existing.exists()) return; // idempotent replay

    tx.set(saleRef, {
      shop_id: sale.shopId,
      staff_id: sale.staffId,
      device_id: sale.deviceId,
      total: sale.total,
      status: "completed",
      occurred_at: sale.occurredAt,
      received_at: serverTimestamp(),
    });

    for (const line of sale.lines) {
      const itemRef = doc(collection(saleRef, "items"));
      tx.set(itemRef, {
        product_id: line.productId,
        quantity: line.quantity,
        price_at_time: line.price,
      });
      const ledgerRef = doc(collection(db, `shops/${sale.shopId}/ledger`));
      tx.set(ledgerRef, {
        product_id: line.productId,
        change_amount: -line.quantity,
        reason: "sale",
        reference_id: sale.saleId,
        staff_id: sale.staffId,
        occurred_at: sale.occurredAt,
        received_at: serverTimestamp(),
      });
      const prodRef = doc(db, `shops/${sale.shopId}/products/${line.productId}`);
      tx.update(prodRef, { current_stock: increment(-line.quantity) });
    }
  });
}

export async function voidSaleRemote(shopId: string, saleId: string, staffId: string, reason: string) {
  const saleRef = doc(db, `shops/${shopId}/sales/${saleId}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(saleRef);
    if (!snap.exists()) throw new Error("Sale not found");
    const data = snap.data();
    if (data.status === "voided") return;
    // restore stock via ledger: read items subcollection is not possible in tx listing,
    // so client passes lines — simpler: caller writes void + ledger via API route with admin.
    tx.update(saleRef, { status: "voided", voidReason: reason, voidBy: staffId });
  });
}
