import { clsx } from "clsx";

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="label-mono text-mist-400">{eyebrow}</p>}
      <h1 className="display mt-1.5 text-[clamp(1.9rem,1.4rem+2vw,2.8rem)] text-mist-50">{title}</h1>
      {children && <div className="mt-2 text-mist-200">{children}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  success: "border-volt/30 bg-volt/[0.06]",
  progress: "border-blue-300/30 bg-blue-700/20",
  attention: "border-warn/40 bg-warn/[0.07]",
  calm: "border-white/10 bg-night-850",
  neutral: "border-white/10 bg-night-850",
};

export function Panel({ tone = "neutral", className, children }: { tone?: string; className?: string; children: React.ReactNode }) {
  return <section className={clsx("rounded-xl border p-5 sm:p-6", TONES[tone] ?? TONES.neutral, className)}>{children}</section>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 p-8 text-center">
      <p className="font-semibold text-mist-50">{title}</p>
      {children && <div className="mt-2 text-sm leading-relaxed text-mist-300">{children}</div>}
    </div>
  );
}
