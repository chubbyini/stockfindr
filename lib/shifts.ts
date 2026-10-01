import { doc, getDoc, getDocs, setDoc, collection, query, orderBy, limit as fbLimit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { tilldb } from "@/lib/db/dexie";
import type { TillShift } from "@/lib/types";

/**
 * Retrieves the currently open till shift for this shop and staff member.
 * Checks local Dexie storage first for zero-latency offline operation,
 * falling back to Firestore if not found locally.
 */
export async function getOpenShift(shopId: string, staffId: string): Promise<TillShift | null> {
  if (!shopId || !staffId) return null;
  try {
    const local = await tilldb.shifts
      .where("shopId")
      .equals(shopId)
      .filter((s) => s.staffId === staffId && s.status === "open")
      .first();

    if (local) return local;

    // Fallback: check cloud if online
    const q = query(
      collection(db, `shops/${shopId}/shifts`),
      orderBy("openedAt", "desc"),
      fbLimit(5)
    );
    const snap = await getDocs(q);
    const cloudOpen = snap.docs
      .map((d) => d.data() as TillShift)
      .find((s) => s.staffId === staffId && s.status === "open");

    if (cloudOpen) {
      await tilldb.shifts.put(cloudOpen);
      return cloudOpen;
    }
  } catch {
    /* offline fallback */
  }
  return null;
}

/**
 * Initiates a new till shift with an opening cash float.
 */
export async function startShift(
  shopId: string,
  staffId: string,
  staffName: string,
  openingFloat: number
): Promise<TillShift> {
  const floatAmt = Math.max(0, Number(openingFloat) || 0);
  const shift: TillShift = {
    id: `shift-${crypto.randomUUID().slice(0, 8)}`,
    shopId,
    staffId,
    staffName: staffName || "Attendant",
    openedAt: Date.now(),
    openingFloat: floatAmt,
    cashSales: 0,
    transferSales: 0,
    cashDrops: 0,
    expectedCash: floatAmt,
    status: "open",
  };

  // 1. Write locally immediately (works offline)
  await tilldb.shifts.put(shift);

  // 2. Sync to cloud in background
  try {
    await setDoc(doc(db, `shops/${shopId}/shifts/${shift.id}`), shift);
  } catch {
    /* offline — will sync later */
  }

  return shift;
}

/**
 * Updates an open shift whenever a checkout occurs.
 */
export async function recordSaleToShift(
  shiftId: string,
  amount: number,
  method: "cash" | "transfer" = "cash"
): Promise<void> {
  if (!shiftId) return;
  try {
    const shift = await tilldb.shifts.get(shiftId);
    if (!shift || shift.status !== "open") return;

    if (method === "cash") {
      shift.cashSales = Math.round((shift.cashSales + amount) * 100) / 100;
    } else {
      shift.transferSales = Math.round((shift.transferSales + amount) * 100) / 100;
    }
    shift.expectedCash = Math.round((shift.openingFloat + shift.cashSales - shift.cashDrops) * 100) / 100;

    await tilldb.shifts.put(shift);

    setDoc(doc(db, `shops/${shift.shopId}/shifts/${shift.id}`), shift, { merge: true }).catch(() => {});
  } catch {
    /* ignore offline write failure */
  }
}

/**
 * Records a mid-shift cash drop / petty cash expense from the drawer.
 */
export async function recordDropToShift(shiftId: string, amount: number): Promise<void> {
  if (!shiftId) return;
  try {
    const shift = await tilldb.shifts.get(shiftId);
    if (!shift || shift.status !== "open") return;

    shift.cashDrops = Math.round((shift.cashDrops + amount) * 100) / 100;
    shift.expectedCash = Math.round((shift.openingFloat + shift.cashSales - shift.cashDrops) * 100) / 100;

    await tilldb.shifts.put(shift);

    setDoc(doc(db, `shops/${shift.shopId}/shifts/${shift.id}`), shift, { merge: true }).catch(() => {});
  } catch {
    /* ignore offline write failure */
  }
}

/**
 * Closes the shift, balances actual cash counted against expected cash, and records variance.
 */
export async function closeShift(
  shiftId: string,
  countedCash: number,
  notes?: string
): Promise<TillShift> {
  const shift = await tilldb.shifts.get(shiftId);
  if (!shift) throw new Error("Shift record not found.");

  const counted = Math.max(0, Number(countedCash) || 0);
  const variance = Math.round((counted - shift.expectedCash) * 100) / 100;

  shift.closedAt = Date.now();
  shift.countedCash = counted;
  shift.variance = variance;
  shift.status = "closed";
  if (notes) shift.notes = notes.trim();

  // Save locally
  await tilldb.shifts.put(shift);

  // Sync to cloud
  try {
    await setDoc(doc(db, `shops/${shift.shopId}/shifts/${shift.id}`), shift, { merge: true });
  } catch {
    /* offline */
  }

  return shift;
}

/**
 * Lists past shifts for owner audit and variance reporting.
 */
export async function listShifts(shopId: string, max = 25): Promise<TillShift[]> {
  const map = new Map<string, TillShift>();

  try {
    const local = await tilldb.shifts
      .where("shopId")
      .equals(shopId)
      .toArray();
    local.forEach((s) => map.set(s.id, s));
  } catch {
    /* ignore */
  }

  try {
    const q = query(
      collection(db, `shops/${shopId}/shifts`),
      orderBy("openedAt", "desc"),
      fbLimit(max)
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as TillShift;
      map.set(d.id, data);
      tilldb.shifts.put(data).catch(() => {});
    });
  } catch {
    /* offline */
  }

  return [...map.values()].sort((a, b) => b.openedAt - a.openedAt);
}
