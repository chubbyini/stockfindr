import type { ButtonHTMLAttributes, ReactNode } from "react";
import Token from "@/components/brand/token";

export const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 outline-none transition placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-200";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
};

const btnSizes = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-13 px-5 text-lg",
};

const btnVariants = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-800",
  secondary: "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50",
  ghost: "px-1 text-brand-800 underline underline-offset-4",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  dark: "bg-stone-900 text-white hover:bg-stone-800",
};

export function Btn({ variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${btnSizes[size]} ${btnVariants[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${className}`}>
      {children}
    </div>
  );
}

export function Page({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <main className={`mx-auto w-full px-4 py-5 ${wide ? "max-w-5xl" : "max-w-md"}`}>
      {children}
    </main>
  );
}

export function TopBar({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 border-b border-stone-200 bg-paper/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <Token size={34} spinning={false} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
          {sub && <p className="truncate text-xs text-stone-500">{sub}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const badgeTones = {
  green: "bg-brand-100 text-brand-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  stone: "bg-stone-100 text-stone-600",
  dark: "bg-stone-900 text-white",
};

export function Badge({ tone = "stone", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone = "stone" }: { label: string; value: string; tone?: keyof typeof badgeTones }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : ""}`}>
        {value}
      </div>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm font-medium text-red-600">{children}</p>;
}
