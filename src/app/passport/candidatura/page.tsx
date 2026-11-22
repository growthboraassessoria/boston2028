import type { Metadata } from "next";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { athleteStatusView } from "@/lib/domain/athlete-status";
import { formatDuration } from "@/lib/domain/time";
import { ApplicationForm } from "@/components/passport/ApplicationForm";
import { InfoResponseForm, WithdrawButton } from "@/components/passport/InlineActions";
import { PageTitle, Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Candidatura" };

const EVENT_LABEL: Record<string, string> = {
  "application.submitted": "Candidatura enviada",
  "application.withdrawn": "Candidatura retirada",
  "info.answered": "Você respondeu à coordenação",
  "decision.approve_road": "Aprovação técnica registrada",
  "decision.not_approved": "Parecer técnico registrado",
  "decision.forward_next": "Caminho de desenvolvimento definido pela coordenação",
  "decision.request_info": "A coordenação pediu mais informações",
  "decision.keep_monitoring": "Em acompanhamento, com reavaliação marcada",
  "journey.accepted": "Você entrou na jornada",
  "journey.declined": "Você preferiu não entrar agora",
  "membership.verified": "Vínculo com a BORA atualizado",
};

const fmt = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const fmtDay = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${d}T12:00:00-03:00`));

export default async function CandidaturaPage({ searchParams }: { searchParams: Promise<{ enviada?: string; aviso?: string; respondida?: string; retirada?: string }> }) {
  const [d, sp] = await Promise.all([getPassport(), searchParams]);
  const { races, requests, events, answers } = await asUser(d.user, async (tx) => ({
    races: await tx`select id, name, city, race_date::text as race_date, race_date_confirmed from rtb.target_races where status <> 'archived' order by sort_order`,
    requests: d.application ? await tx`select id, message, status, response, requested_at, responded_at from rtb.info_requests where application_id = ${d.application.id} order by requested_at desc` : [],
    events: await tx`select type, created_at from rtb.application_events where user_id = ${d.user.id} and visibility = 'athlete' order by created_at desc limit 30`,
    answers: d.application ? await tx`
      select a.sessions_4plus, a.target_race_choice, h.injury_in_treatment, m.distance, m.seconds, m.mark_date::text as mark_date, m.race_name
      from rtb.applications a left join rtb.application_health h on h.application_id = a.id left join rtb.performance_marks m on m.id = a.mark_id
      where a.id = ${d.application.id}` : [],
  }));

  const app = d.application;
  const showForm = !app || app.status === "WITHDRAWN" || app.status === "DRAFT";
  const view = athleteStatusView(d.situation);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow="Road to Boston 2028" title="Candidatura" />
      {sp.enviada && <p role="status" className="mb-5 rounded-md border border-volt/30 bg-volt/10 p-3 text-sm text-mist-50">Candidatura enviada. A coordenação técnica vai analisar; você acompanha tudo aqui.</p>}
      {sp.aviso && <p role="status" className="mb-5 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-mist-50">{sp.aviso}</p>}
      {sp.respondida && <p role="status" className="mb-5 rounded-md border border-volt/30 bg-volt/10 p-3 text-sm text-mist-50">Resposta enviada para a coordenação técnica.</p>}
      {sp.retirada && <p role="status" className="mb-5 rounded-md border border-white/15 bg-white/5 p-3 text-sm text-mist-50">Candidatura retirada. Seu histórico continua no Passport.</p>}

      {showForm ? (
        <Panel>
          <p className="mb-6 text-sm leading-relaxed text-mist-200">
            Leva poucos minutos. Suas respostas vão para a coordenação técnica da BORA, que avalia cada caso pessoalmente.
          </p>
          <ApplicationForm races={races.map((r) => ({ id: r.id, name: r.name, city: r.city,
            dateLabel: r.race_date_confirmed && r.race_date ? fmtDay(r.race_date) : "data a confirmar" }))} />
        </Panel>
      ) : (
        <div className="grid gap-5">
          <Panel tone={view.tone}>
            <p className="label-mono text-mist-300">Situação</p>
            <h2 className="mt-2 text-xl font-semibold text-mist-50">{view.headline}</h2>
            <p className="mt-2 leading-relaxed text-mist-200">{view.body}</p>
            {app?.athleteMessage && !requests.some((r) => r.status === "OPEN") && (
              <blockquote className="mt-4 border-l-2 border-volt pl-3 text-sm italic leading-relaxed text-mist-100">
                “{app.athleteMessage}”<span className="mt-1 block not-italic text-xs text-mist-400">Coordenação técnica BORA</span>
              </blockquote>
            )}
          </Panel>

          {requests.filter((r) => r.status === "OPEN").map((r) => (
            <Panel key={r.id} tone="attention">
              <p className="label-mono text-warn">Pedido da coordenação</p>
              <p className="mt-2 leading-relaxed text-mist-50">{r.message}</p>
              <InfoResponseForm requestId={r.id} />
            </Panel>
          ))}

          {answers[0] && (
            <Panel>
              <h2 className="label-mono text-mist-300">Suas respostas</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-mist-400">Prova alvo</dt><dd className="mt-0.5 text-mist-50">{app?.targetRace ?? "Nenhuma por enquanto"}</dd></div>
                <div><dt className="text-mist-400">Marca recente</dt><dd className="tabular mt-0.5 text-mist-50">
                  {answers[0].seconds ? `${answers[0].distance === "HALF" ? "Meia" : "Maratona"} ${formatDuration(answers[0].seconds)} · ${fmtDay(answers[0].mark_date)}` : "Sem marca recente"}</dd></div>
                <div><dt className="text-mist-400">4 treinos por semana</dt><dd className="mt-0.5 text-mist-50">{answers[0].sessions_4plus ? "Sim" : "Não"}</dd></div>
                <div><dt className="text-mist-400">Lesão em tratamento</dt><dd className="mt-0.5 text-mist-50">{answers[0].injury_in_treatment ? "Sim" : "Não"}</dd></div>
              </dl>
              <p className="mt-4 text-xs text-mist-400">Precisa corrigir algo? Peça em Configurações › Seus dados (retificação) ou responda a coordenação quando ela entrar em contato.</p>
            </Panel>
          )}

          <Panel>
            <h2 className="label-mono text-mist-300">Histórico</h2>
            <ol className="mt-3 grid gap-3">
              {events.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2 text-sm">
                  <span className="text-mist-100">{EVENT_LABEL[e.type] ?? "Atualização"}</span>
                  <span className="tabular shrink-0 font-mono text-xs text-mist-400">{fmt(e.created_at)}</span>
                </li>
              ))}
            </ol>
          </Panel>
          {app && !["WITHDRAWN", "TECH_NOT_APPROVED"].includes(app.status ?? "") && <WithdrawButton applicationId={app.id} />}
        </div>
      )}
    </div>
  );
}
