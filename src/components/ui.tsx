import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-2">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

/** Progress toward a target. Over-target is shown as a full bar plus the overage in text. */
export function Meter({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target != null && value > target * 1.05;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-ink-2">
          {Math.round(value)}
          {target ? ` / ${Math.round(target)}` : ""} {unit}
          {over && <span className="ml-1 text-critical">(+{Math.round(value - target!)})</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={target ?? undefined} aria-label={label}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${target ? pct : 0}%` }} />
      </div>
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-line bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2 text-ink-2",
  danger: "text-critical hover:bg-surface-2",
};

export function Button({ variant = "secondary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${BTN[variant]} ${className}`}
    />
  );
}

const fieldCls = "rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** Full width unless the caller sets a width class. */
const width = (cls?: string) => (cls && /(^|\s)(max-)?w-/.test(cls) ? "" : "w-full");

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${fieldCls} ${width(p.className)} ${p.className ?? ""}`} />;
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${fieldCls} ${width(p.className)} ${p.className ?? ""}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** Parses a number input; empty string -> null. */
export const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
