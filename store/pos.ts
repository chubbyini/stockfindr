import { create } from "zustand";
import type { CartLine } from "@/lib/types";

interface CartState {
  lines: CartLine[];
  add: (p: { productId: string; name: string; price: number }, qty?: number) => void;
  inc: (productId: string) => void;
  dec: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  restore: (lines: CartLine[]) => void;
  total: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  add: (p, qty = 1) =>
    set((s) => {
      const found = s.lines.find((l) => l.productId === p.productId);
      if (found) {
        return {
          lines: s.lines.map((l) =>
            l.productId === p.productId ? { ...l, quantity: round3(l.quantity + qty) } : l
          ),
        };
      }
      return { lines: [...s.lines, { ...p, quantity: round3(qty) }] };
    }),
  inc: (id) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.productId === id ? { ...l, quantity: round3(l.quantity + 1) } : l)),
    })),
  dec: (id) =>
    set((s) => ({
      // minus at qty 1 removes the line
      lines: s.lines.flatMap((l) => {
        if (l.productId !== id) return [l];
        const next = round3(l.quantity - 1);
        return next <= 0 ? [] : [{ ...l, quantity: next }];
      }),
    })),
  remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== id) })),
  clear: () => set({ lines: [] }),
  restore: (lines) => set({ lines }),
  total: () => round2(get().lines.reduce((a, l) => a + l.price * l.quantity, 0)),
}));

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

interface SessionState {
  shopId: string;
  shopName: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: "owner" | "attendant";
  deviceId: string;
  setSession: (s: Partial<SessionState>) => void;
  clear: () => void;
}

export interface KnownShop {
  id: string;
  name: string;
}

const REGISTRY_KEY = "tilltrail-shops";

// Every shop this device has ever opened, for the PIN screen's shop picker.
// Local only — the server source of truth stays in users/{uid}/shops.
export function knownShops(): KnownShop[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const list = raw ? (JSON.parse(raw) as KnownShop[]) : [];
    return list.filter((s) => s && s.id);
  } catch {
    return [];
  }
}

export function rememberShop(id: string, name: string) {
  try {
    const list = knownShops().filter((s) => s.id !== id);
    list.unshift({ id, name: name || id });
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list.slice(0, 10)));
  } catch { /* ignore */ }
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("tilltrail-device-id");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("tilltrail-device-id", id);
  }
  return id;
}

export const useSession = create<SessionState>((set) => ({
  shopId: typeof window !== "undefined" ? localStorage.getItem("tilltrail-shop") || "demo-shop" : "demo-shop",
  shopName: typeof window !== "undefined" ? localStorage.getItem("tilltrail-shop-name") || "" : "",
  staffId: typeof window !== "undefined" ? localStorage.getItem("tilltrail-staff-id") || "" : "",
  staffName: typeof window !== "undefined" ? localStorage.getItem("tilltrail-staff-name") || "" : "",
  staffEmail: typeof window !== "undefined" ? localStorage.getItem("tilltrail-staff-email") || "" : "",
  role: typeof window !== "undefined" ? (localStorage.getItem("tilltrail-role") as "owner" | "attendant") || "owner" : "owner",
  deviceId: typeof window !== "undefined" ? getDeviceId() : "server",
  setSession: (s) =>
    set((prev) => {
      const next = { ...prev, ...s };
      try {
        localStorage.setItem("tilltrail-shop", next.shopId);
        localStorage.setItem("tilltrail-shop-name", next.shopName || "");
        if (next.staffId !== undefined) localStorage.setItem("tilltrail-staff-id", next.staffId);
        if (next.staffName !== undefined) localStorage.setItem("tilltrail-staff-name", next.staffName);
        if (next.staffEmail !== undefined) localStorage.setItem("tilltrail-staff-email", next.staffEmail);
        if (next.role !== undefined) localStorage.setItem("tilltrail-role", next.role);
        if (next.shopId) rememberShop(next.shopId, next.shopName || next.shopId);
      } catch { /* ignore */ }
      return next;
    }),
  clear: () => {
    try {
      localStorage.removeItem("tilltrail-staff-id");
      localStorage.removeItem("tilltrail-staff-name");
      localStorage.removeItem("tilltrail-staff-email");
    } catch { /* ignore */ }
    set({ staffId: "", staffName: "", staffEmail: "" });
  },
}));
