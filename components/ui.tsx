import type { ButtonHTMLAttributes, ReactNode } from "react";
import Token from "@/components/brand/token";
import { IconCheck, IconAlertTriangle, IconClose } from "@/components/icons";

export const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 disabled:bg-stone-100 disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-brand-500";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark" | "outline";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
};

const btnSizes = {
  sm: "min-h-9 px-3 text-xs font-semibold rounded-lg",
  md: "min-h-10 px-4 text-sm font-semibold rounded-xl",
  lg: "min-h-12 px-5 text-base font-semibold rounded-xl",
  xl: "min-h-14 px-6 text-base font-bold rounded-2xl",
};

const btnVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98]",
  secondary: "border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 active:scale-[0.98] dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
  outline: "border border-stone-300 text-stone-700 hover:bg-stone-100 active:scale-[0.98] dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800",
  ghost: "text-stone-700 hover:bg-stone-100 active:scale-[0.98] dark:text-stone-300 dark:hover:bg-stone-800",
  danger: "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]",
  dark: "bg-stone-900 text-white hover:bg-stone-800 active:scale-[0.98] dark:bg-stone-100 dark:text-stone-900",
};

export function Btn({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition duration-150 disabled:pointer-events-none disabled:opacity-40 ${btnSizes[size]} ${btnVariants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="size-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm transition dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function Page({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <main className={`mx-auto w-full px-3.5 sm:px-6 pb-24 pt-4 md:pb-12 ${wide ? "max-w-6xl" : "max-w-md"}`}>
      {children}
    </main>
  );
}

export function TopBar({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
        <div className="flex items-center gap-2.5">
          <Token size={32} spinning={false} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base sm:text-lg font-bold tracking-tight text-stone-900 dark:text-white">{title}</h1>
          {sub && <p className="truncate text-xs font-medium text-stone-500 dark:text-stone-400">{sub}</p>}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const badgeTones = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/60",
  stone: "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  dark: "bg-stone-900 text-white border-stone-800 dark:bg-stone-100 dark:text-stone-900",
  brand: "bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-800/60",
};

export function Badge({
  tone = "stone",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold tracking-wide ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "stone",
  icon,
  trend,
  sub,
}: {
  label: string;
  value: string;
  tone?: keyof typeof badgeTones;
  icon?: ReactNode;
  trend?: string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</span>
        {icon && <div className="text-stone-400">{icon}</div>}
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-bold tracking-tight ${
          tone === "red" ? "text-red-600 dark:text-red-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-stone-900 dark:text-white"
        }`}
      >
        {value}
      </div>
      {(trend || sub) && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{trend || sub}</p>}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-400">
      <div className="mb-2 rounded-xl bg-stone-100 p-2.5 text-stone-400 dark:bg-stone-800">
        <IconAlertTriangle className="size-5" />
      </div>
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60">
      <IconAlertTriangle className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function SuccessText({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60">
      <IconCheck className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-xl transition-all dark:border-stone-800 dark:bg-stone-900">
        {title && (
          <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-3 dark:border-stone-800">
            <h3 className="text-base font-bold text-stone-900 dark:text-white">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
              aria-label="Close modal"
            >
              <IconClose className="size-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
