import {
  doc,
  runTransaction,
  serverTimestamp,
  increment,
  collection,
  type DocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
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

  // No server identity → every write would be denied. Fail fast with an
  // actionable message instead of a silent retry storm. (Auth state may
  // still be restoring at boot, so wait for it first; backoff retries
  // automatically once the till is re-linked via /login.)
  try {
    await auth.authStateReady();
  } catch { /* proceed — worst case the transaction denies and we report */ }
  if (!auth.currentUser) {
    for (const sale of due) {
      await tilldb.outbox.update(sale.saleId, {
        status: "failed",
        attempts: (sale.attempts || 0) + 1,
        lastError:
          "Till not signed in — sales are safe locally. Open /login on this device to reconnect, then sync resumes.",
        syncAfter: Date.now() + 60000,
      });
      failed++;
    }
    return { pushed, failed };
  }

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
    // Phase 1 — READS ONLY. Firestore aborts transactions that read after
    // writing, so every get happens up front: idempotency check + one
    // product snapshot per line (freezes cost, detects offline quick-adds).
    const existing = await tx.get(saleRef);
    if (existing.exists()) return; // idempotent replay
    const prodRefs = sale.lines.map((line) =>
      doc(db, `shops/${sale.shopId}/products/${line.productId}`)
    );
    const prodSnaps: DocumentSnapshot<DocumentData>[] = [];
    for (const ref of prodRefs) {
      prodSnaps.push(await tx.get(ref));
    }

    // Phase 2 — WRITES ONLY.
    tx.set(saleRef, {
      shop_id: sale.shopId,
      staff_id: sale.staffId,
      device_id: sale.deviceId,
      total: sale.total,
      status: "completed",
      occurred_at: sale.occurredAt,
      received_at: serverTimestamp(),
    });

    sale.lines.forEach((line, i) => {
      const prodSnap = prodSnaps[i];
      const costAtTime = prodSnap.exists()
        ? Number(prodSnap.data().cost_price ?? 0) || 0
        : 0;
      if (!prodSnap.exists()) {
        // Quick-add made while offline: heal with a review stub instead of
        // failing the whole sale on a missing doc.
        tx.set(prodRefs[i], {
          barcode: null,
          name: line.name,
          price: line.price,
          cost_price: null,
          reorder_level: 5,
          is_pinned: false,
          current_stock: 0,
          status: "pending_review",
          created_by: sale.staffId,
          updatedAt: Date.now(),
        });
      }
      const itemRef = doc(collection(saleRef, "items"));
      tx.set(itemRef, {
        product_id: line.productId,
        quantity: line.quantity,
        price_at_time: line.price,
        cost_at_time: costAtTime,
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
      // set+merge (not update): never dies on a missing doc.
      tx.set(prodRefs[i], { current_stock: increment(-line.quantity) }, { merge: true });
    });
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
