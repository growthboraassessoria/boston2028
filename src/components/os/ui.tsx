import { clsx } from "clsx";
import Link from "next/link";

export function OsTitle({ title, kicker, children, actions }: { title: string; kicker?: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <p className="label-mono text-[0.62rem] text-mist-500">{kicker}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-mist-50">{title}</h1>
        {children && <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-mist-300">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={clsx("rounded-[4px] border border-white/[0.07] bg-[#0a1630]", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <h2 className="label-mono text-[0.62rem] text-mist-400">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "alert" | "signal" }) {
  return (
    <div className="rounded-[4px] border border-white/[0.07] bg-[#0a1630] p-4">
      <p className="label-mono text-[0.6rem] text-mist-500">{label}</p>
      <p className={clsx("tabular mt-2 font-mono text-2xl", tone === "alert" ? "text-danger" : tone === "signal" ? "text-volt" : "text-mist-50")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-mist-500">{hint}</p>}
    </div>
  );
}

const PILL: Record<string, string> = {
  PRELIM_ELIGIBLE: "border-volt/40 text-volt",
  PRELIM_ALMOST: "border-warn/50 text-warn",
  PRELIM_NOT_NOW: "border-mist-400/40 text-mist-300",
  UNDER_REVIEW: "border-blue-300/40 text-blue-300",
  NEEDS_INFO: "border-warn/50 text-warn",
  TECH_APPROVED: "border-volt/50 text-volt",
  TECH_NOT_APPROVED: "border-mist-400/40 text-mist-300",
  REASSESSMENT_PENDING: "border-blue-300/40 text-blue-300",
  WITHDRAWN: "border-white/15 text-mist-500",
};

export function Pill({ children, status, className }: { children: React.ReactNode; status?: string; className?: string }) {
  return (
    <span className={clsx("label-mono inline-flex items-center whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-[0.58rem]",
      (status && PILL[status]) ?? "border-white/15 text-mist-300", className)}>{children}</span>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-[4px] border border-white/[0.07]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[#0b1833]">
          <tr>{head.map((h) => <th key={h} scope="col" className="label-mono whitespace-nowrap px-3 py-2.5 text-[0.6rem] font-normal text-mist-500">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-mist-400">{empty}</p>}
    </div>
  );
}

export function Td({ children, className, mono }: { children: React.ReactNode; className?: string; mono?: boolean }) {
  return <td className={clsx("px-3 py-2.5 align-top", mono && "tabular font-mono text-[0.8rem]", className)}>{children}</td>;
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-medium text-mist-50 underline-offset-4 hover:text-volt hover:underline">{children}</Link>;
}

export function PendingIntegration({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[4px] border border-warn/40 bg-warn/[0.07] px-3 py-2 text-sm text-mist-100">{children}</p>;
}
