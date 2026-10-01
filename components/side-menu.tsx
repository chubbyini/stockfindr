"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["Dashboard", "/dashboard"],
  ["Sell", "/sell"],
  ["Products", "/products"],
  ["Analytics", "/analytics"],
  ["Staff", "/staff"],
] as const;

// Owner navigation: fixed sidebar on desktop, bottom tab bar on phones.
export default function SideMenu() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/dashboard" ? path === href : path.startsWith(href);
  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="sticky top-20 space-y-1 rounded-2xl border border-stone-200 bg-white p-2">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`block rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active(href)
                  ? "bg-brand-700 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`py-2.5 text-center text-[11px] font-semibold ${
                active(href) ? "text-brand-700" : "text-stone-500"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
