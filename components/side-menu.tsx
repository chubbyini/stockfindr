"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/store/pos";
import Token from "@/components/brand/token";
import ShopSwitcher from "./shop-switcher";
import {
  IconDashboard,
  IconSell,
  IconProducts,
  IconAnalytics,
  IconStaff,
  IconLock,
} from "./icons";

const LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: IconDashboard },
  { label: "Sell POS", href: "/sell", icon: IconSell },
  { label: "Products", href: "/products", icon: IconProducts },
  { label: "Analytics", href: "/analytics", icon: IconAnalytics },
  { label: "Staff", href: "/staff", icon: IconStaff },
] as const;

// Owner navigation: fixed full-height sticky sidebar on desktop, clean bottom tab bar on mobile.
export default function SideMenu() {
  const path = usePathname();
  const router = useRouter();
  const { staffName, role, setSession } = useSession();

  const active = (href: string) =>
    href === "/dashboard" ? path === href : path.startsWith(href);

  return (
    <>
      {/* Desktop Fixed Full-Height Sticky Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-64 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 md:flex">
        {/* Brand Header */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800/80">
          <Token size={32} spinning={false} />
          <div>
            <span className="block text-base font-extrabold tracking-tight text-stone-900 dark:text-white">
              Stockfindr
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Counter POS
            </span>
          </div>
        </div>

        {/* Integrated Shop Switcher */}
        <div className="border-b border-stone-100 bg-stone-50/70 p-3 dark:border-stone-800/80 dark:bg-stone-950/40">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Active Shop
          </p>
          <ShopSwitcher />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Navigation
          </p>
          {LINKS.map((item) => {
            const Icon = item.icon;
            const isSelected = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isSelected
                    ? "bg-brand-600 text-white shadow-xs font-bold"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
                }`}
              >
                <Icon className={`size-4.5 shrink-0 ${isSelected ? "text-white" : "text-stone-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: User Identity & Lock */}
        <div className="border-t border-stone-100 p-3 dark:border-stone-800">
          <div className="flex items-center justify-between rounded-xl bg-stone-50 p-2.5 dark:bg-stone-950/50">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-bold text-stone-900 dark:text-stone-100">
                {staffName || "Attendant"}
              </p>
              <p className="truncate text-[10px] font-medium text-stone-500 capitalize">
                {role || "Staff"}
              </p>
            </div>
            <button
              onClick={() => {
                setSession({ staffId: "", staffName: "", staffEmail: "" });
                router.push("/pin");
              }}
              title="Lock Counter"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              <IconLock className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Floating Bottom Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md md:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="grid grid-cols-5 py-1">
          {LINKS.map((item) => {
            const Icon = item.icon;
            const isSelected = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-2 text-center text-[10px] font-bold transition ${
                  isSelected ? "text-brand-600 dark:text-brand-400" : "text-stone-500 hover:text-stone-800 dark:text-stone-400"
                }`}
              >
                <Icon className="mb-0.5 size-5" />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

