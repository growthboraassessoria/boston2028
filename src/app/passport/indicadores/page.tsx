import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/domain/standards";
import { formatDuration, formatGap, MARATHON_KM, pacePerKm } from "@/lib/domain/time";
import { EvolutionChart, EvolutionTabs, type EvolutionPoint } from "@/components/passport/athlete-forms";
import { PageTitle, Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Minha evolução" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(`${d.slice(0, 10)}T12:00:00-03:00`));
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-09-11" → "set/26" (eixo do gráfico). */
const fmtShort = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""}/${d.slice(2, 4)}`;

const DIST: Record<string, string> = { MARATHON: "Maratona", HALF: "Meia maratona", "10K": "10 km", "5K": "5 km", "3K": "3 km" };
const GOAL_STATUS: Record<string, string> = { ACTIVE: "em andamento", ACHIEVED: "conquistada", MISSED: "não atingida", CANCELLED: "cancelada" };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-night-850 p-4">
      <p className="text-xs text-mist-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-mist-50 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-mist-400">{sub}</p>}
    </div>
  );
}

export default async function IndicadoresPage() {
  const d = await getPassport();
  const { tests, reassessment } = await asUser(d.user, async (tx) => ({
    tests: await tx`
      select t.name, coalesce(case when t.date_confirmed then t.test_date end, r.validated_at::date, t.planned_month)::text as d,
             r.equivalent_marathon_seconds as eq
      from rtb.test_results r join rtb.tests t on t.id = r.test_id
      where r.user_id = ${d.user.id} and r.status = 'VALIDATED' and r.equivalent_marathon_seconds is not null`,
    reassessment: (await tx`
      select scheduled_for::text as day from rtb.reassessments
      where user_id = ${d.user.id} and status = 'SCHEDULED' and scheduled_for >= current_date
      order by scheduled_for limit 1`)[0],
  }));

  // Marcas de maratona e meia em equivalente de maratona (meia × 2 só como estimativa interna, como no passaporte).
  const marks = d.marks
    .filter((m) => m.distance === "MARATHON" || m.distance === "HALF")
    .map((m) => ({ ...m, equivalent: m.distance === "HALF" ? m.seconds * 2 : m.seconds }));
  const best = marks.reduce<(typeof marks)[number] | null>((acc, m) => (!acc || m.equivalent < acc.equivalent ? m : acc), null);

  const points: EvolutionPoint[] = [
    ...marks.map((m) => ({
      date: m.date.slice(0, 10), dateLabel: fmtShort(m.date), seconds: m.equivalent, kind: "mark" as const,
      label: m.distance === "HALF" ? "Meia × 2 (estimativa)" : `Maratona${m.race ? ` · ${m.race}` : ""}`,
    })),
    ...tests.map((t) => ({
      date: String(t.d).slice(0, 10), dateLabel: fmtShort(String(t.d)), seconds: Number(t.eq), kind: "test" as const, label: String(t.name),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const a = d.application;
  const standard = a?.standardSeconds ?? null;
  const gap = best && standard ? best.equivalent - standard : null;
  const unlocked = d.situation.accessStatus === "ACTIVE_MEMBER" && (d.situation.journeyStatus === "ROAD_TO_BOSTON" || d.situation.journeyStatus === "BORA_NEXT");
  const nextOn = (reassessment?.day as string | undefined) ?? d.situation.nextReassessmentOn;

  return (
    <div className="mx-auto max-w-2xl">
      <EvolutionTabs />
      <PageTitle eyebrow="Evolução" title="Minha evolução" />

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Melhor marca" value={best ? formatDuration(best.equivalent) : "—"}
            sub={best ? `${best.distance === "HALF" ? "Meia × 2 (estimativa)" : "Maratona"} · ${fmtDay(best.date)}` : "Informe uma marca na candidatura"} />
          <Tile label="Ritmo médio" value={best ? pacePerKm(best.equivalent, MARATHON_KM) : "—"} sub={best ? "Na maratona" : null} />
          <Tile label="Índice da sua faixa" value={standard ? formatDuration(standard) : "—"}
            sub={standard ? [a?.ageGroup ? `Faixa ${a.ageGroup}` : null, CATEGORY_LABEL[d.profile.category]].filter(Boolean).join(" · ") : "Aparece depois da candidatura"} />
          <Tile label="Diferença para o índice" value={gap === null ? "—" : formatGap(gap)}
            sub={gap === null ? null : gap > 0 ? "Acima do índice" : gap < 0 ? "Abaixo do índice" : "No índice"} />
        </div>

        <Panel>
          <h2 className="label-mono text-mist-300">Equivalente de maratona no tempo</h2>
          {points.length ? (
            <>
              <EvolutionChart points={points} reference={standard} referenceLabel={standard ? `Índice ${formatDuration(standard)}` : null} />
              <details className="mt-4 rounded-md border border-white/10">
                <summary className="flex min-h-11 cursor-pointer items-center px-3.5 text-sm font-medium text-mist-100">Ver os números</summary>
                <table className="w-full border-t border-white/10 text-left text-sm">
                  <caption className="sr-only">Marcas e testes em equivalente de maratona</caption>
                  <thead>
                    <tr className="text-xs text-mist-400">
                      <th scope="col" className="px-3.5 py-2 font-normal">Data</th>
                      <th scope="col" className="px-3.5 py-2 font-normal">Origem</th>
                      <th scope="col" className="px-3.5 py-2 text-right font-normal">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="tabular px-3.5 py-2 text-mist-200">{fmtDay(p.date)}</td>
                        <td className="px-3.5 py-2 text-mist-200">{p.kind === "test" ? `Teste · ${p.label}` : p.label}</td>
                        <td className="tabular px-3.5 py-2 text-right font-medium text-mist-50">{formatDuration(p.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-white/12 p-4 text-sm leading-relaxed text-mist-300">
              Suas marcas e os testes validados aparecem aqui, comparados com o índice da sua faixa.
            </p>
          )}
        </Panel>

        <Panel>
          <h2 className="label-mono text-mist-300">Metas do ciclo</h2>
          {d.goals.length ? (
            <ul className="mt-3 grid gap-2">
              {d.goals.map((g) => (
                <li key={g.id} className="rounded-md border border-white/10 p-3">
                  <p className="font-medium text-mist-50">{g.title}</p>
                  <p className="tabular mt-0.5 text-sm text-mist-300">
                    {[g.targetDistance ? DIST[g.targetDistance] : null, g.targetSeconds ? formatDuration(g.targetSeconds) : null,
                      g.dueOn ? `até ${fmtDay(g.dueOn)}` : null, GOAL_STATUS[g.status] ?? null].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : unlocked ? (
            <p className="mt-2 text-sm leading-relaxed text-mist-300">Seu treinador cadastra as metas do ciclo. Elas aparecem aqui.</p>
          ) : (
            <p className="mt-3 flex gap-2.5 rounded-md border border-white/10 bg-white/[0.03] p-3.5 text-sm leading-relaxed text-mist-200">
              <Lock className="mt-0.5 size-4 shrink-0 text-mist-400" aria-hidden />
              Metas, reavaliações e testes completos aparecem com a matrícula ativa confirmada e a jornada liberada pela coordenação técnica.
            </p>
          )}
        </Panel>

        {(nextOn || unlocked) && (
          <Panel>
            <h2 className="label-mono text-mist-300">Próxima reavaliação</h2>
            <p className="tabular mt-2 text-lg font-semibold text-mist-50">{nextOn ? fmtDay(nextOn) : "A agendar"}</p>
            <p className="mt-1 text-sm text-mist-300">
              {nextOn ? "Data prevista pela coordenação técnica. Pode mudar." : "A coordenação técnica agenda com você e seu treinador."}
            </p>
          </Panel>
        )}

        {tests.length === 0 && unlocked && (
          <p className="text-sm text-mist-300">
            Os testes validados entram no gráfico. Veja o calendário em{" "}
            <Link href="/passport/testes" className="font-medium text-mist-50 underline underline-offset-4">Testes do ciclo</Link>.
          </p>
        )}

        <p className="text-xs leading-relaxed text-mist-400">
          Meia maratona × 2 é só uma estimativa interna para comparar com o índice. Os testes usam a fórmula de equivalência definida pela coordenação técnica.
          Atingir o índice não garante inscrição: a Boston Marathon é decidida pela B.A.A.
        </p>
      </div>
    </div>
  );
}
