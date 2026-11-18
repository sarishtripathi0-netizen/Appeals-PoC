import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeatureRefTag } from "./FeatureRef";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function FeatureRef({ ids, note }: { ids: string[]; note?: string }) {
  if ((await cookies()).get("fref")?.value === "off") return null;
  return <FeatureRefTag ids={ids} note={note} />;
}

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ok = one(sp.ok);
  const err = one(sp.err);
  if (!ok && !err) return null;
  return (
    <div role="status" className={`mb-4 rounded-md border px-3 py-2 text-sm ${err ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
      {err ?? ok}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle ? <p className="muted mt-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  grey: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  red: "bg-rose-50 text-rose-800 border-rose-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
  purple: "bg-violet-50 text-violet-800 border-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="h2">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{children}</p>;
}

export function Stat({ label, value, href, tone }: { label: string; value: ReactNode; href?: string; tone?: Tone }) {
  const inner = (
    <div className={`card h-full ${tone === "red" ? "border-rose-200" : tone === "amber" ? "border-amber-200" : ""}`}>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

/** Placeholder for a screen that a later milestone fills in. */
export function Planned({ milestone, children }: { milestone: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-sm text-indigo-900">
      <span className="font-semibold">Coming in milestone {milestone}:</span> {children}
    </div>
  );
}

export function Back({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="no-print mb-3 inline-block text-sm text-brand-700 hover:underline">← {children}</Link>;
}

export function HiddenBack({ value }: { value: string }) {
  return <input type="hidden" name="back" value={value} />;
}
