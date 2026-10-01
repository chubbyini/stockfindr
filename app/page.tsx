"use client";

import Link from "next/link";
import Token from "@/components/brand/token";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import {
  IconArrowRight,
  IconCheck,
  IconLock,
  IconShield,
  IconStore,
  IconWifiOff,
  IconZap,
  IconAnalytics,
  IconSell,
  IconStaff,
} from "@/components/icons";

export default function LandingPage() {
  const { user } = useOwner();
  const { role, staffName, shopName } = useSession();

  return (
    <div className="min-h-screen bg-[#fafaf8] text-stone-900 selection:bg-stone-900 selection:text-white dark:bg-[#0c0a09] dark:text-stone-100">
      {/* Background Subtle Grid Texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035] dark:opacity-[0.045]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#fafaf8]/85 backdrop-blur-xl dark:border-stone-800/80 dark:bg-[#0c0a09]/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <Token size={32} spinning={false} className="transition group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-stone-950 dark:text-white">
                Stockfindr
              </span>
              <span className="hidden font-mono text-[9px] font-semibold tracking-widest text-stone-600 uppercase sm:inline dark:text-stone-400">
                Sovereign Commerce OS
              </span>
            </div>
          </Link>

          {/* Center Institutional Status Badge */}
          <div className="hidden items-center gap-2 rounded-full border border-stone-200/70 bg-white/70 px-3 py-1 font-mono text-[11px] font-medium text-stone-600 shadow-2xs md:inline-flex dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-300">
            <span className="size-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 animate-pulse" />
            <span>Core Engine: Operational &bull; Local Outbox Active</span>
          </div>

          <div className="flex items-center gap-3">
            {/* If user is already logged in, show direct resume button */}
            {user || (role === "attendant" && staffName) ? (
              <Link
                href={user ? "/dashboard" : "/attendant"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-600 hover:text-white dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500 dark:hover:text-stone-950"
              >
                <span>Resume {user ? "Dashboard" : "Till"}</span>
                <IconArrowRight className="size-3.5" />
              </Link>
            ) : null}

            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-xs font-bold text-white shadow-sm ring-1 ring-white/10 transition hover:bg-stone-800 active:scale-[0.98] dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
            >
              <span>Launch Register</span>
              <IconArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Returning User Smart Banner */}
      {(user || (role === "attendant" && staffName)) && (
        <aside aria-label="Active session banner" className="border-b border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-center text-xs font-medium text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
          <span>
            Active authenticated session on this terminal:{" "}
            <strong>{user ? `Owner (${user.email})` : `Attendant (${staffName} • ${shopName})`}</strong>.
          </span>{" "}
          <Link
            href={user ? "/dashboard" : "/attendant"}
            className="ml-1.5 font-bold underline underline-offset-4 hover:opacity-80"
          >
            Enter {user ? "Owner Command Tower" : "Counter Till"} &rarr;
          </Link>
        </aside>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-8 sm:pt-28 sm:pb-32">
        <div className="mx-auto max-w-5xl text-center">
          {/* Subtle Tag Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white/90 px-4 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-900/80 dark:text-stone-300">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-[11px] tracking-wider uppercase">
              Mission-Critical Retail Infrastructure
            </span>
          </div>

          {/* Billion Dollar Headline */}
          <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-7xl sm:leading-[1.08]">
            Sovereign Commerce.
            <br />
            <span className="bg-gradient-to-r from-stone-500 via-stone-700 to-stone-900 bg-clip-text text-transparent dark:from-stone-400 dark:via-stone-200 dark:to-stone-100">
              Zero Disruption.
            </span>
          </h1>

          {/* Authoritative Sub-manifesto */}
          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed font-normal text-stone-600 sm:text-xl sm:leading-relaxed dark:text-stone-400">
            When ground-level connectivity fails, your retail business cannot stop.
            Stockfindr keeps the till running offline with an append-only stock ledger,
            exactly-once cloud sync, and a clean split between owner oversight and counter speed.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-stone-950 px-7 py-4 text-sm font-bold text-white shadow-xl ring-1 ring-white/10 transition hover:bg-stone-800 active:scale-[0.99] sm:w-auto dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
            >
              <span>Access System Gateway</span>
              <IconArrowRight className="size-4" />
            </Link>

            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-stone-200/90 bg-white/80 px-7 py-4 text-sm font-bold text-stone-800 shadow-2xs backdrop-blur-md transition hover:bg-stone-50 active:scale-[0.99] sm:w-auto dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <IconLock className="size-4 text-stone-400" />
              <span>Attendant PIN Keypad</span>
            </Link>
          </div>

          {/* Stately Micro Metrics */}
          <div className="mt-14 grid grid-cols-2 gap-4 border-t border-stone-200/70 pt-8 sm:grid-cols-4 sm:gap-8 dark:border-stone-800/80">
            <div>
              <p className="font-mono text-2xl font-black text-stone-900 dark:text-white">
                Zero
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Blocked Sales When Offline
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-black text-stone-900 dark:text-white">
                100%
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Offline Outbox Retention
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-black text-stone-900 dark:text-white">
                Per-sale
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Cost &amp; Margin Tracking
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-black text-stone-900 dark:text-white">
                Once
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Every Sale Synced Exactly Once
              </p>
            </div>
          </div>
        </div>

        {/* The Glass Terminal: Institutional POS Telemetry Preview */}
        <div className="mx-auto mt-16 max-w-5xl px-2 sm:mt-24 sm:px-0">
          <div className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white/90 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:border-stone-800 dark:bg-stone-900/70 dark:ring-white/5 sm:p-7">
            {/* Terminal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
                  <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
                  <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
                </div>
                <span className="font-mono text-xs font-bold tracking-wider text-stone-500 uppercase">
                  Terminal 01 &bull; Flagship Node &bull; Sovereign Register
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[10px] font-bold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Encrypted Local Dexie Queue: 0 Pending Synced</span>
              </div>
            </div>

            {/* Telemetry Row */}
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/70 bg-stone-50/70 p-4 dark:border-stone-800/80 dark:bg-stone-950/50">
                <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                  Gross Turnover (Today)
                </span>
                <p className="mt-1 font-mono text-2xl font-black text-stone-900 dark:text-white">
                  ₦1,248,500.00
                </p>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>&uarr; 38 Transactions</span>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200/70 bg-stone-50/70 p-4 dark:border-stone-800/80 dark:bg-stone-950/50">
                <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                  Verified Gross Margin
                </span>
                <p className="mt-1 font-mono text-2xl font-black text-stone-900 dark:text-white">
                  34.8%
                </p>
                <p className="mt-2 text-[11px] text-stone-500">
                  ₦434,478.00 net margin audit
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/70 bg-stone-50/70 p-4 dark:border-stone-800/80 dark:bg-stone-950/50">
                <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                  COGS Accountability
                </span>
                <p className="mt-1 font-mono text-2xl font-black text-stone-900 dark:text-white">
                  100%
                </p>
                <p className="mt-2 text-[11px] text-stone-500">
                  0.0% unverified line shrinkage
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/70 bg-stone-50/70 p-4 dark:border-stone-800/80 dark:bg-stone-950/50">
                <span className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                  Inventory Velocity
                </span>
                <p className="mt-1 font-mono text-2xl font-black text-amber-600 dark:text-amber-400">
                  2 Items Low
                </p>
                <p className="mt-2 text-[11px] text-stone-500">
                  Automated reorder triggers active
                </p>
              </div>
            </div>

            {/* Live Ledger Transaction Stream Simulation */}
            <div className="mt-6 rounded-2xl border border-stone-200/60 bg-white p-4 font-mono text-xs dark:border-stone-800/70 dark:bg-stone-950/70">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2 text-[11px] font-bold text-stone-400 uppercase dark:border-stone-800">
                <span>Recent Checkout Settlement</span>
                <span>Tender &bull; Timestamp</span>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-900">
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                      Cart #084 &bull; 3x Premium Engine Oil 5L
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-stone-600 dark:text-stone-400">
                    <span className="font-bold text-stone-900 dark:text-white">
                      ₦84,000.00
                    </span>
                    <span className="text-[11px] text-stone-400">Instant Transfer &bull; 14:22:08</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-stone-900 dark:text-stone-100">
                      Cart #083 &bull; 12x Industrial Spark Plugs
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-stone-600 dark:text-stone-400">
                    <span className="font-bold text-stone-900 dark:text-white">
                      ₦24,600.00
                    </span>
                    <span className="text-[11px] text-stone-400">Cash Register &bull; 14:18:41</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 3 Sovereign Pillars */}
      <section className="border-t border-stone-200/80 bg-white/50 py-20 dark:border-stone-800/80 dark:bg-stone-900/20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="max-w-3xl">
            <span className="font-mono text-xs font-bold tracking-widest text-stone-500 uppercase">
              Architectural Foundations
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Engineered for the reality of commerce.
            </h2>
            <p className="mt-4 text-base text-stone-600 dark:text-stone-400">
              Most software assumes an infallible high-speed fiber connection and flawless trust.
              Stockfindr assumes cellular dropouts, grid fluctuations, and the absolute necessity of financial auditing.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {/* Pillar 1 */}
            <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-xs transition hover:border-stone-300 dark:border-stone-800/80 dark:bg-stone-900/60 dark:hover:border-stone-700">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                <IconWifiOff className="size-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-stone-950 dark:text-white">
                Unbreakable Offline Execution
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                When the cell tower drops or fiber is cut, sales continue at full speed.
                Every cart is written to an encrypted local Dexie IndexedDB instance and synchronized when connectivity resumes.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-xs transition hover:border-stone-300 dark:border-stone-800/80 dark:bg-stone-900/60 dark:hover:border-stone-700">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                <IconShield className="size-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-stone-950 dark:text-white">
                Principal-Agent Governance
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Separates the counter cashier from confidential shop margins and supplier agreements.
                Attendants unlock with offline PINs; owners maintain full control over prices, reorders, and revenue.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-xs transition hover:border-stone-300 dark:border-stone-800/80 dark:bg-stone-900/60 dark:hover:border-stone-700">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                <IconAnalytics className="size-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-stone-950 dark:text-white">
                Cost of Goods (COGS) Clarity
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Revenue is vanity; gross profit is sanity. Stockfindr deducts purchase costs at the moment of sale,
                revealing true product margins, preventing cash drawer leakage, and calculating actual net yield.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Architecture: Owner Desk vs Counter Terminal */}
      <section className="border-t border-stone-200/80 py-20 dark:border-stone-800/80 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="text-center">
            <span className="font-mono text-xs font-bold tracking-widest text-stone-500 uppercase">
              Role-Segregated Ecosystem
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Two distinct operational perspectives.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-stone-600 dark:text-stone-400">
              Designed specifically for how retail businesses operate on the ground.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            {/* Perspective A: Business Owner */}
            <div className="flex flex-col justify-between rounded-3xl border border-stone-200/80 bg-white p-8 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/60 sm:p-10">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
                    <IconStore className="size-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-stone-950 dark:text-white">
                      The Owner Control Tower
                    </h3>
                    <span className="font-mono text-xs text-stone-500">
                      Strategic Revenue &amp; Inventory Governance
                    </span>
                  </div>
                </div>

                <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">
                  Accessible from any phone, tablet, or browser with Google OAuth or instant magic link.
                </p>

                <ul className="mt-6 space-y-3.5 text-xs text-stone-600 dark:text-stone-300">
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Run several shops from one account and switch between them in seconds.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Revenue, profit and margin analytics per shop, plus nightly Telegram summaries.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Low-stock warnings before shelves run empty, with supplier reorder drafts.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Single-use invite codes for staff and tills that auto-lock when idle.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-stone-100 dark:border-stone-800">
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 rounded-xl bg-stone-950 py-3.5 text-xs font-bold text-white transition hover:bg-stone-800 active:scale-[0.99] dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
                >
                  <span>Sign In as Business Owner</span>
                  <IconArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>

            {/* Perspective B: Counter Attendant (Inverted Theme) */}
            <div className="flex flex-col justify-between rounded-3xl border border-stone-800 bg-stone-950 p-8 shadow-xl text-white sm:p-10 dark:border-stone-800 dark:bg-stone-900/90">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-stone-800 bg-stone-900 text-stone-100">
                    <IconStaff className="size-6 text-stone-200" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-white">
                      The Counter Sales Terminal
                    </h3>
                    <span className="font-mono text-xs text-stone-400">
                      Lightning-Fast Checkout &amp; Drawer Ledger
                    </span>
                  </div>
                </div>

                <p className="mt-6 text-sm text-stone-300">
                  Built for cashiers, till clerks, and retail attendants. Fast, intuitive, and distraction-free.
                </p>

                <ul className="mt-6 space-y-3.5 text-xs text-stone-300">
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                    <span>Shop + email + 4-digit PIN unlock that works with zero network.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                    <span>Camera barcode scanning plus tap tiles for unbarcoded goods.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                    <span>10-second undo on every sale — mistakes are cheap to fix.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <IconCheck className="size-4 shrink-0 text-emerald-400" />
                    <span>Sales queue offline and sync exactly once when back online.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-stone-800/80">
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#fafaf8] py-3.5 text-xs font-bold text-stone-950 shadow-md transition hover:bg-white active:scale-[0.99]"
                >
                  <span>Unlock Counter Register (PIN)</span>
                  <IconArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Invitation / Final CTA */}
      <section className="relative overflow-hidden border-t border-stone-200/80 bg-stone-950 py-20 text-white dark:border-stone-800/80 dark:bg-black sm:py-32">
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-8">
          <Token size={64} spinning={false} className="mx-auto" />
          <h2 className="mt-8 text-3xl font-black tracking-tight sm:text-5xl sm:leading-tight">
            Deploy sovereign retail continuity across your stores.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-stone-400">
            Sign in with your owner credentials or authenticate at the counter till with your staff PIN.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-stone-950 shadow-2xl transition hover:bg-stone-100 active:scale-[0.99] sm:w-auto"
            >
              <span>Enter System Gateway</span>
              <IconArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stately Footer */}
      <footer className="border-t border-stone-200/80 bg-[#fafaf8] py-8 text-center text-xs text-stone-500 dark:border-stone-800/80 dark:bg-[#0c0a09] dark:text-stone-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-8">
          <p className="font-mono text-[11px]">
            &copy; {new Date().getFullYear()} Stockfindr Core. Sovereign offline-first commerce infrastructure.
          </p>
          <div className="flex items-center gap-6 font-mono text-[11px]">
            <Link href="/login" className="hover:text-stone-900 dark:hover:text-white">
              Gateway
            </Link>
            <Link href="/pin" className="hover:text-stone-900 dark:hover:text-white">
              Till PIN
            </Link>
            <Link href="/join" className="hover:text-stone-900 dark:hover:text-white">
              Join Shop
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
