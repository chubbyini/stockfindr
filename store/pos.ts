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
  staffId: string;
  staffName: string;
  role: "owner" | "attendant";
  deviceId: string;
  setSession: (s: Partial<SessionState>) => void;
  clear: () => void;
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
  staffId: "",
  staffName: "",
  role: "attendant",
  deviceId: typeof window !== "undefined" ? getDeviceId() : "server",
  setSession: (s) =>
    set((prev) => {
      const next = { ...prev, ...s };
      try {
        localStorage.setItem("tilltrail-shop", next.shopId);
      } catch { /* ignore */ }
      return next;
    }),
  clear: () => set({ staffId: "", staffName: "" }),
}));
