"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRight, Lock } from "lucide-react";
import { BoraShield } from "@/components/brand/Bora";
import { Qr } from "@/components/passport/Qr";
import { Stamp } from "@/components/passport/Stamp";
import { Guilloche } from "@/components/passport/Guilloche";
import { formatDuration } from "@/lib/domain/time";
import type { BookData } from "./types";

export const PAGE_TITLES = ["Identificação", "Minha jornada", "Carimbos", "Minha evolução", "Benefícios"] as const;

export function PaperPage({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="light relative flex h-full flex-col overflow-hidden rounded-r-[10px] rounded-l-[3px] bg-paper">
      <Guilloche className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-ink/[0.10] to-transparent" aria-hidden />
      <div className="relative flex items-center justify-between border-b border-ink/10 px-5 pb-2 pt-4 sm:px-6">
        <span className="label-mono text-[0.6rem] text-mist-600">Boston Passport · RTB 2028</span>
        <span className="label-mono text-[0.6rem] text-mist-600">{String(index + 1).padStart(2, "0")} / 05</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6">{children}</div>
    </div>
  );
}

function H({ children, id }: { children: React.ReactNode; id: string }) {
  return <h2 id={id} tabIndex={-1} className="display text-[1.7rem] leading-none text-ink outline-none sm:text-[2.1rem]">{children}</h2>;
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="border-b border-ink/10 py-1.5">
      <dt className="label-mono text-[0.58rem] text-mist-600">{k}</dt>
      <dd className={clsx("mt-0.5 text-[0.9rem] leading-snug text-ink", mono && "tabular font-mono")}>{v}</dd>
    </div>
  );
}

const TONE: Record<string, string> = {
  success: "border-blue-700/30 bg-blue-700/[0.07]",
  progress: "border-blue-700/30 bg-blue-700/[0.05]",
  attention: "border-warn/50 bg-warn/[0.10]",
  calm: "border-ink/15 bg-white/50",
  neutral: "border-ink/15 bg-white/50",
};

export function IdentityPage({ d }: { d: BookData }) {
  const initials = d.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <PaperPage index={0}>
      <H id="page-0">Identificação</H>
      <div className="mt-3 grid grid-cols-[5.25rem_1fr] gap-3.5 sm:grid-cols-[6.5rem_1fr]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-night-800">
          {d.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.avatarUrl} alt={`Foto de ${d.firstName}`} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-linear-to-b from-blue-700 to-night-900">
              <span className="display text-4xl text-mist-50">{initials}</span>
            </div>
          )}
          <BoraShield className="absolute bottom-1.5 right-1.5 h-5 w-auto text-white/70" />
        </div>
        <dl className="min-w-0">
          <Row k="Nome" v={<span className="break-words font-semibold">{d.fullName}</span>} />
          <Row k="Cidade" v={d.city ? `${d.city}${d.uf ? ` / ${d.uf}` : ""}` : "—"} />
          <Row k="Nº do passaporte" v={d.passportNumber} mono />
        </dl>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4">
        <Row k="Emitido em" v={d.issuedAt} mono />
        <Row k="Categoria" v={`${d.categoryLabel}${d.ageGroup ? ` · ${d.ageGroup}` : ""}`} />
        <Row k="Status esportivo" v={d.status.label} />
        <Row k="Vínculo BORA" v={d.membershipLabel} />
      </dl>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-[4.5rem] shrink-0 rounded-md bg-white p-1 shadow-sm">
          <Qr value={d.qrUrl} title="QR interno do passaporte (só a equipe BORA consegue consultar)" className="h-auto w-full" />
        </div>
        <p className="text-[0.7rem] leading-snug text-mist-600">
          QR interno: a equipe BORA confere sua elegibilidade num ambiente autorizado. O código não carrega dados pessoais.
        </p>
      </div>
    </PaperPage>
  );
}

export function JourneyPage({ d }: { d: BookData }) {
  const j = d.journey;
  return (
    <PaperPage index={1}>
      <H id="page-1">Minha jornada</H>
      <div className={clsx("mt-4 rounded-lg border p-4", TONE[d.status.tone])}>
        <p className="font-semibold leading-snug text-ink">{d.status.headline}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-mist-700">{d.status.body}</p>
        {d.status.action && (
          <Link href={d.status.action.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">
            {d.status.action.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {j.message && (
        <figure className="mt-4 border-l-2 border-blue-700 pl-3">
          <blockquote className="text-sm italic leading-relaxed text-mist-800">“{j.message}”</blockquote>
          <figcaption className="label-mono mt-1 text-[0.6rem] text-mist-600">{j.coachName ? `${j.coachName} · ` : ""}Coordenação técnica BORA</figcaption>
        </figure>
      )}
      <dl className="mt-3">
        <Row k="Prova alvo" v={j.targetRace ? `${j.targetRace}${j.targetRaceConfirmed && j.targetRaceDate ? ` · ${j.targetRaceDate}` : " · data a confirmar"}` : "A definir na candidatura"} />
        <Row k="Treinador" v={j.coachName ?? "Definido após a entrada na jornada"} />
      </dl>
      <ol className="mt-4 grid gap-2" aria-label="Etapas da jornada">
        {j.steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full border text-[0.6rem]",
              s.state === "done" ? "border-blue-700 bg-blue-700 text-white" : s.state === "current" ? "border-blue-700 text-blue-700" : "border-ink/20 text-transparent")} aria-hidden>
              {s.state === "done" ? "✓" : "•"}
            </span>
            <span className={clsx(s.state === "todo" ? "text-mist-500" : "text-ink", s.state === "current" && "font-semibold")}>{s.label}</span>
            <span className="sr-only">{s.state === "done" ? "concluída" : s.state === "current" ? "etapa atual" : "a seguir"}</span>
          </li>
        ))}
      </ol>
    </PaperPage>
  );
}

export function StampsPage({ d }: { d: BookData }) {
  return (
    <PaperPage index={2}>
      <H id="page-2">Carimbos da jornada</H>
      <p className="mt-2 text-sm leading-relaxed text-mist-700">Cada etapa validada ganha um carimbo da BORA.</p>
      <ul className="mt-3 grid grid-cols-3 gap-2.5">
        {d.stamps.map((s) => (
          <li key={s.slug + s.date}><Stamp title={s.name} date={s.date} kind={s.kind} className="w-full" /></li>
        ))}
        {d.upcomingStamps.map((t) => (
          <li key={t}><Stamp title={t} empty className="w-full" /></li>
        ))}
      </ul>
    </PaperPage>
  );
}

function EvolutionChart({ points, reference }: { points: BookData["evolution"]["points"]; reference: number | null }) {
  if (points.length === 0) {
    return <p className="mt-3 rounded-md border border-dashed border-ink/20 p-4 text-sm text-mist-600">Suas marcas e testes validados aparecem aqui.</p>;
  }
  const values = points.map((p) => p.seconds).concat(reference ? [reference] : []);
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values) * 1.03;
  const W = 300, H = 120;
  const x = (i: number) => (points.length === 1 ? W / 2 : 16 + (i * (W - 32)) / (points.length - 1));
  const y = (s: number) => 10 + ((s - min) / (max - min)) * (H - 20);
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução: tempo equivalente de maratona ao longo do tempo (menor é melhor)">
        {reference && (
          <g>
            <line x1="0" x2={W} y1={y(reference)} y2={y(reference)} stroke="#0b3476" strokeDasharray="4 4" strokeWidth="1" />
            <text x={W - 2} y={y(reference) - 4} textAnchor="end" fontSize="9" fill="#0b3476" fontFamily="var(--font-mono)">ÍNDICE {formatDuration(reference)}</text>
          </g>
        )}
        <polyline fill="none" stroke="#0a1324" strokeWidth="1.5" points={points.map((p, i) => `${x(i)},${y(p.seconds)}`).join(" ")} />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.seconds)} r="3.5" fill={p.kind === "test" ? "#0b3476" : "#0a1324"} />
        ))}
      </svg>
      <figcaption className="sr-only">
        {points.map((p) => `${p.label}: ${formatDuration(p.seconds)}`).join("; ")}
      </figcaption>
    </figure>
  );
}

export function EvolutionPage({ d }: { d: BookData }) {
  const e = d.evolution;
  return (
    <PaperPage index={3}>
      <H id="page-3">Minha evolução</H>
      <dl className="mt-3 grid grid-cols-2 gap-x-4">
        <Row k="Melhor marca" v={e.best ? e.best.time : "—"} mono />
        <Row k="Ritmo" v={e.best ? e.best.pace : "—"} mono />
        <Row k="Índice da faixa" v={e.reference ?? "—"} mono />
        <Row k="Diferença" v={e.gap ?? "—"} mono />
      </dl>
      {e.best && <p className="mt-1 text-xs text-mist-600">{e.best.label} · {e.best.date}</p>}
      <EvolutionChart points={e.points} reference={e.referenceSeconds} />
      {e.unlocked ? (
        <div className="mt-3">
          <p className="label-mono text-[0.6rem] text-mist-600">Metas</p>
          {e.goals.length ? (
            <ul className="mt-1.5 grid gap-1.5">
              {e.goals.map((g) => <li key={g.title} className="rounded-md border border-ink/10 bg-white/60 px-3 py-2 text-sm text-ink"><strong>{g.title}</strong> <span className="text-mist-600">· {g.detail}</span></li>)}
            </ul>
          ) : <p className="mt-1 text-sm text-mist-600">Seu treinador cadastra as metas do ciclo.</p>}
          {e.nextReassessment && <p className="mt-2 text-sm text-mist-700">Próxima reavaliação: <strong className="tabular">{e.nextReassessment}</strong></p>}
        </div>
      ) : (
        <p className="mt-3 flex gap-2 rounded-md border border-ink/15 bg-white/60 p-3 text-sm leading-relaxed text-mist-700">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> Metas, reavaliações e testes completos aparecem com a matrícula ativa confirmada e a jornada liberada pela coordenação.
        </p>
      )}
    </PaperPage>
  );
}

const LOCK_COPY: Record<string, string> = {
  requires_active_member: "Exige matrícula ativa confirmada",
  journey_mismatch: "Exclusivo de outra jornada",
  location_mismatch: "Fora da sua região",
  limit_reached: "Você já usou",
  pending_redemption: "Resgate em andamento",
  sold_out: "Esgotado",
};

export function BenefitsPage({ d }: { d: BookData }) {
  const b = d.benefits;
  return (
    <PaperPage index={4}>
      <H id="page-4">Benefícios</H>
      <p className="mt-2 text-sm leading-relaxed text-mist-700">
        {b.availableCount > 0 ? `${b.availableCount} benefício${b.availableCount > 1 ? "s" : ""} disponível${b.availableCount > 1 ? "is" : ""} para você agora.`
          : "Os benefícios de parceiros aparecem aqui conforme seu status e seu vínculo."}
      </p>
      <ul className="mt-3 grid gap-2">
        {b.top.map((x) => (
          <li key={x.slug}>
            <Link href={`/passport/beneficios/${x.slug}`} className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-ink/10 bg-white/70 px-3 py-2.5 hover:border-blue-700/40">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{x.title}</span>
                <span className="block text-xs text-mist-600">{x.partner}{x.locked ? ` · ${LOCK_COPY[x.locked] ?? "Indisponível"}` : ""}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-blue-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/passport/beneficios" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline-offset-4 hover:underline">Ver vitrine</Link>
        <Link href="/passport/resgates" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline-offset-4 hover:underline">
          Meus resgates{b.redemptions ? ` (${b.redemptions})` : ""}
        </Link>
      </div>
    </PaperPage>
  );
}
