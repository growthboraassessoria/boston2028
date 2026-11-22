import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { formatDuration, pacePerKm, type Distance } from "@/lib/domain/time";
import { EvolutionTabs, TestResultForm } from "@/components/passport/athlete-forms";
import { EmptyState, PageTitle, Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Testes do ciclo" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(`${d.slice(0, 10)}T12:00:00-03:00`));
const fmtMonth = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" })
  .format(new Date(`${d.slice(0, 10)}T12:00:00-03:00`));
const pctFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function distanceKey(meters: number | null): Distance | null {
  if (meters === 3000) return "3K";
  if (meters === 5000) return "5K";
  if (meters === 10000) return "10K";
  if (meters !== null && meters >= 21000 && meters <= 21200) return "HALF";
  if (meters === 42195) return "MARATHON";
  return null;
}

const PLACEHOLDER: Record<Distance, string> = { "3K": "11:45", "5K": "19:30", "10K": "41:20", HALF: "1:32:10", MARATHON: "3:15:00" };

const TEST_STATUS: Record<string, { label: string; className: string }> = {
  planned: { label: "Previsto", className: "border-white/15 text-mist-200" },
  open: { label: "Aberto para envio", className: "border-volt/50 text-volt" },
  closed: { label: "Encerrado", className: "border-white/15 text-mist-400" },
  cancelled: { label: "Cancelado", className: "border-white/15 text-mist-400 line-through decoration-1" },
};

const RESULT_STATUS: Record<string, string> = {
  SUBMITTED: "Enviado · aguardando validação",
  VALIDATED: "Validado pela equipe técnica",
  REJECTED: "Não validado",
};

// Linguagem de treino, nunca de promessa: o nível não é qualificação nem garante inscrição.
const LEVEL_LABEL: Record<string, string> = {
  BOSTON_SEGURO: "Abaixo do índice, com folga",
  INDICE: "Dentro do índice",
  NA_ROTA: "Perto do índice",
  EM_PREPARACAO: "Em preparação",
};

function pctText(pct: number) {
  if (pct === 0) return "no índice da sua faixa";
  return `${pctFmt.format(Math.abs(pct))}% ${pct > 0 ? "acima" : "abaixo"} do índice da sua faixa`;
}

export default async function TestesPage() {
  const d = await getPassport();
  const tests = await asUser(d.user, (tx) => tx`
    select t.id, t.name, t.distance_m, t.planned_month::text as planned_month, t.test_date::text as test_date, t.date_confirmed,
           t.format_note, t.status,
           r.seconds, r.status as result_status, r.level, r.normalized_pct, r.equivalent_marathon_seconds, r.review_note
    from rtb.tests t
    left join rtb.test_results r on r.test_id = t.id and r.user_id = ${d.user.id}
    where t.cycle_id = rtb.current_cycle_id()
    order by t.planned_month, t.name`);

  const s = d.situation;
  const canSubmit = s.accessStatus === "ACTIVE_MEMBER" && (s.journeyStatus === "ROAD_TO_BOSTON" || s.journeyStatus === "BORA_NEXT");
  const journeyName = s.enrollment?.journey === "BORA_NEXT" ? "BORA NEXT" : "Road to Boston 2028";

  return (
    <div className="mx-auto max-w-2xl">
      <EvolutionTabs />
      <PageTitle eyebrow="Evolução" title="Testes do ciclo" />

      <div className="grid gap-5">
        {canSubmit ? (
          <Panel>
            <p className="label-mono text-mist-300">{journeyName}</p>
            <p className="mt-2 leading-relaxed text-mist-100">
              Os testes medem sua evolução no ciclo. Quando a equipe técnica abrir um teste, o envio do seu tempo aparece nele.
              A equipe valida o resultado e o carimbo entra no seu passaporte.
            </p>
          </Panel>
        ) : (
          <Panel tone="calm">
            <p className="label-mono text-mist-300">Calendário do ciclo</p>
            <p className="mt-2 leading-relaxed text-mist-100">
              Você pode acompanhar os testes previstos. O envio de resultados fica disponível com a jornada ativa e a matrícula confirmada pela equipe da BORA.
            </p>
            <Link href="/passport/jornada" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-mist-50 underline underline-offset-4">
              Ver minha jornada
            </Link>
          </Panel>
        )}

        {tests.length === 0 ? (
          <EmptyState title="Calendário em definição">Os testes do ciclo aparecem aqui assim que a coordenação técnica publicar.</EmptyState>
        ) : (
          <ol className="grid gap-4" aria-label="Testes do ciclo">
            {tests.map((t) => {
              const key = distanceKey(t.distance_m ?? null);
              const km = t.distance_m ? Number(t.distance_m) / 1000 : null;
              const st = TEST_STATUS[String(t.status)] ?? { label: String(t.status), className: "border-white/15 text-mist-200" };
              const hasResult = t.seconds !== null && t.seconds !== undefined;
              const validated = t.result_status === "VALIDATED";
              const pct = t.normalized_pct === null || t.normalized_pct === undefined ? null : Number(t.normalized_pct);
              const showForm = canSubmit && t.status === "open" && !validated;
              return (
                <li key={t.id}>
                  <Panel>
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <p className="label-mono text-mist-400">{fmtMonth(String(t.planned_month))}</p>
                        <h2 className="mt-1 text-lg font-semibold leading-snug text-mist-50">{t.name}</h2>
                      </div>
                      <span className={clsx("label-mono shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem]", st.className)}>{st.label}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-mist-400">Distância</dt>
                        <dd className="tabular mt-0.5 text-mist-50">{km ? `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : "A definir"}</dd>
                      </div>
                      <div>
                        <dt className="text-mist-400">Data</dt>
                        <dd className="tabular mt-0.5 text-mist-50">{t.date_confirmed && t.test_date ? fmtDay(String(t.test_date)) : "Data a confirmar"}</dd>
                      </div>
                    </dl>
                    {t.format_note && <p className="mt-3 text-sm leading-relaxed text-mist-300">{t.format_note}</p>}

                    {hasResult && (
                      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="label-mono text-mist-300">Seu resultado</p>
                          <p className="text-xs text-mist-200">{RESULT_STATUS[String(t.result_status)] ?? "Enviado"}</p>
                        </div>
                        <p className="mt-1.5 text-2xl font-semibold text-mist-50">{formatDuration(Number(t.seconds))}</p>
                        {km && <p className="tabular text-sm text-mist-300">Ritmo médio {pacePerKm(Number(t.seconds), km)}</p>}
                        {validated && t.equivalent_marathon_seconds && (
                          <p className="mt-2 text-sm leading-relaxed text-mist-200">
                            Equivalente de maratona <strong className="tabular font-semibold text-mist-50">{formatDuration(Number(t.equivalent_marathon_seconds))}</strong>
                            {pct !== null && <>, {pctText(pct)}</>}.
                          </p>
                        )}
                        {validated && t.level && (
                          <p className="mt-1 text-sm text-mist-200">Nível: <strong className="font-semibold text-mist-50">{LEVEL_LABEL[String(t.level)] ?? String(t.level)}</strong></p>
                        )}
                        {t.result_status === "REJECTED" && (
                          <p className="mt-2 text-sm leading-relaxed text-mist-200">
                            {t.review_note ? <>Nota da equipe: {t.review_note}</> : "A equipe técnica não validou este envio."}
                            {t.status === "open" && canSubmit && " Você pode enviar de novo abaixo."}
                          </p>
                        )}
                      </div>
                    )}

                    {showForm && (
                      <TestResultForm testId={String(t.id)} distanceKey={key} placeholder={key ? PLACEHOLDER[key] : "45:00"}
                        resubmit={hasResult} />
                    )}
                  </Panel>
                </li>
              );
            })}
          </ol>
        )}

        <p className="text-xs leading-relaxed text-mist-400">
          O nível compara o equivalente de maratona do teste com o índice da sua faixa. É uma referência de treino, não uma qualificação:
          a inscrição na Boston Marathon é feita e decidida pela B.A.A.
        </p>
      </div>
    </div>
  );
}
