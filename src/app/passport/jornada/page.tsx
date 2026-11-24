import type { Metadata } from "next";
import Link from "next/link";
import { getPassport } from "@/lib/data/passport";
import { athleteStatusView } from "@/lib/domain/athlete-status";
import { formatDuration } from "@/lib/domain/time";
import { JourneyDecision } from "@/components/passport/InlineActions";
import { PageTitle, Panel } from "@/components/passport/ui";
import { buttonClass } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Minha jornada" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${d}T12:00:00-03:00`));
const DIST: Record<string, string> = { MARATHON: "Maratona", HALF: "Meia maratona", "10K": "10 km", "5K": "5 km", "3K": "3 km" };

export default async function JornadaPage({ searchParams }: { searchParams: Promise<{ aceito?: string; recusado?: string }> }) {
  const [d, sp] = await Promise.all([getPassport(), searchParams]);
  const view = athleteStatusView(d.situation);
  const e = d.situation.enrollment;
  const isNext = e?.journey === "BORA_NEXT";

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow="Boston Passport" title="Minha jornada" />
      {sp.aceito && <p role="status" className="mb-5 rounded-md border border-volt/30 bg-volt/10 p-3 text-sm text-mist-50">Bem-vindo! Sua jornada começou.</p>}
      {sp.recusado && <p role="status" className="mb-5 rounded-md border border-white/15 bg-white/5 p-3 text-sm text-mist-50">Registramos sua decisão. A coordenação pode conversar com você sobre o melhor momento.</p>}
      <div className="grid gap-5">
        <Panel tone={view.tone}>
          <p className="label-mono text-mist-300">{view.label}</p>
          <h2 className="mt-2 text-xl font-semibold text-mist-50">{view.headline}</h2>
          <p className="mt-2 leading-relaxed text-mist-200">{view.body}</p>

          {e?.status === "OFFERED" && isNext && (
            <>
              <ul className="mt-4 grid gap-2 text-sm text-mist-100">
                <li>· Metas intermediárias definidas com seu treinador.</li>
                <li>· Reavaliação com a coordenação técnica (proposta: a cada 90 dias).</li>
                <li>· Sem plano separado e sem cobrança adicional para aluno BORA ativo.</li>
                <li>· A passagem para o Road to Boston depende de nova decisão técnica.</li>
              </ul>
              <JourneyDecision enrollmentId={e.id} journeyLabel="BORA NEXT" />
            </>
          )}

          {e?.status === "PENDING_ENROLLMENT" && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-mist-100">
              <p className="font-semibold text-mist-50">Como seguir</p>
              <ol className="mt-2 grid gap-1.5">
                <li>1. A equipe da BORA entra em contato para combinar sua matrícula {isNext ? "normal (mesma mensalidade dos alunos, sem plano separado)" : "no Plano Elite, com valores e condições"}.</li>
                <li>2. Com a matrícula feita, a equipe confirma seu vínculo no sistema.</li>
                <li>3. Sua jornada é liberada aqui no Passport{isNext ? ", com o aceite do BORA NEXT" : ""}.</li>
              </ol>
            </div>
          )}

          {!e && view.action && (
            <Link href={view.action.href} className={buttonClass("outline", "md", "mt-5")}>{view.action.label}</Link>
          )}
        </Panel>

        {e?.status === "ACTIVE" && (
          <>
            <Panel>
              <h2 className="label-mono text-mist-300">Ciclo</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-mist-400">Jornada</dt><dd className="mt-0.5 text-mist-50">{isNext ? "BORA NEXT" : "Road to Boston 2028"}</dd></div>
                <div><dt className="text-mist-400">Treinador</dt><dd className="mt-0.5 text-mist-50">{d.coachName ?? "A coordenação vai definir"}</dd></div>
                <div><dt className="text-mist-400">Prova alvo</dt><dd className="mt-0.5 text-mist-50">{d.application?.targetRace ?? "A combinar"}</dd></div>
                <div><dt className="text-mist-400">Próxima reavaliação</dt><dd className="tabular mt-0.5 text-mist-50">{d.situation.nextReassessmentOn ? fmtDay(d.situation.nextReassessmentOn) : "A agendar"}</dd></div>
              </dl>
            </Panel>
            <Panel>
              <h2 className="label-mono text-mist-300">Metas</h2>
              {d.goals.length ? (
                <ul className="mt-3 grid gap-2">
                  {d.goals.map((g) => (
                    <li key={g.id} className="rounded-md border border-white/10 p-3">
                      <p className="font-medium text-mist-50">{g.title}</p>
                      <p className="tabular mt-0.5 text-sm text-mist-300">
                        {[g.targetDistance ? DIST[g.targetDistance] : null, g.targetSeconds ? formatDuration(g.targetSeconds) : null, g.dueOn ? `até ${fmtDay(g.dueOn)}` : null].filter(Boolean).join(" · ")}
                        {g.status !== "ACTIVE" && ` · ${g.status === "ACHIEVED" ? "conquistada" : g.status === "MISSED" ? "não atingida" : "cancelada"}`}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-mist-300">Seu treinador cadastra as metas do ciclo. Elas aparecem aqui.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/passport/testes" className={buttonClass("outline", "sm")}>Testes do ciclo</Link>
                <Link href="/passport/indicadores" className={buttonClass("ghost", "sm")}>Minha evolução</Link>
              </div>
            </Panel>
          </>
        )}

        <p className="text-xs leading-relaxed text-mist-400">
          {e?.journey === "BORA_NEXT"
            ? "O BORA NEXT e a passagem para o Road to Boston são decisões da coordenação técnica da BORA."
            : "A aprovação técnica é uma decisão da coordenação técnica da BORA."} A inscrição na Boston Marathon é feita e decidida pela B.A.A.
        </p>
      </div>
    </div>
  );
}
