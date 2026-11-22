import Link from "next/link";
import { notFound } from "next/navigation";
import { clsx } from "clsx";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { APPLICATION_STATUS_OS, MEMBERSHIP_LABEL } from "@/lib/domain/athlete-status";
import { REASON_LABEL, type PrelimReason } from "@/lib/domain/triage";
import { CATEGORY_LABEL } from "@/lib/domain/standards";
import { formatDuration, formatGap } from "@/lib/domain/time";
import { signedUrl } from "@/lib/storage";
import { day, dt, slaInfo } from "@/lib/os/format";
import { Card, Pill } from "@/components/os/ui";
import { CoachSelect, ContactForm, DecisionPanel, GoalForm, NoteForm, PauseToggle, PoloForm, VerifyForm } from "@/components/os/Forms";

export const metadata = { title: "Ficha do atleta" };

const TABS = [
  ["identidade", "Identidade"], ["vinculo", "Vínculo"], ["qualificacao", "Qualificação"], ["analise", "Análise técnica"],
  ["comercial", "Comercial"], ["jornada", "Jornada"], ["testes", "Testes"], ["mensagens", "Mensagens"], ["beneficios", "Benefícios"], ["auditoria", "Auditoria"],
] as const;

const DECISION_LABEL: Record<string, string> = {
  APPROVE_ROAD: "Aprovou Road to Boston", NOT_APPROVED: "Não aprovou tecnicamente", FORWARD_NEXT: "Encaminhou ao BORA NEXT",
  REQUEST_INFO: "Pediu mais informações", KEEP_MONITORING: "Manteve em acompanhamento",
};

function Fact({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="border-b border-white/[0.05] py-2">
      <dt className="label-mono text-[0.58rem] text-mist-500">{k}</dt>
      <dd className={clsx("mt-0.5 text-sm text-mist-100", mono && "tabular font-mono")}>{v ?? "—"}</dd>
    </div>
  );
}

export default async function FichaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const ctx = await requireStaff();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "identidade";
  const isTech = hasRole(ctx, "technical_director");

  const d = await asUser(ctx.user, async (tx) => {
    const [c] = await tx`select * from rtb.os_candidates where application_id = ${id}`;
    if (!c) return null;
    const uid = c.user_id as string;
    const [health] = await tx`select injury_in_treatment, retain_until from rtb.application_health where application_id = ${id}`;
    const claims = await tx`select answer, coach_name, support_point, no_polo, created_at from rtb.membership_claims where user_id = ${uid} order by created_at desc`;
    const verifications = await tx`select status, previous_status, source, note, created_at, external_member_id from rtb.membership_verifications where user_id = ${uid} order by created_at desc`;
    const decisions = await tx`select d.decision, d.reason, d.next_step, d.next_step_on, d.message_to_athlete, d.created_at, d.from_status, d.to_status, sd.display_name
      from rtb.technical_decisions d left join rtb.staff_directory sd on sd.user_id = d.decided_by where d.application_id = ${id} order by d.created_at desc`;
    const notes = await tx`select r.note, r.created_at, sd.display_name from rtb.technical_reviews r left join rtb.staff_directory sd on sd.user_id = r.author_id where r.application_id = ${id} order by r.created_at desc`;
    const contacts = await tx`select c.channel, c.outcome, c.note, c.created_at, sd.display_name from rtb.contact_attempts c left join rtb.staff_directory sd on sd.user_id = c.actor_id where c.application_id = ${id} order by c.created_at desc`;
    const infos = await tx`select message, status, response, requested_at, responded_at from rtb.info_requests where application_id = ${id} order by requested_at desc`;
    const docs = await tx`select id, kind, storage_path, mime, original_name, created_at from rtb.application_documents where application_id = ${id} and deleted_at is null order by created_at desc`;
    const journeys = await tx`select journey, status, offered_at, activated_at, ended_at, end_reason from rtb.journey_enrollments where application_id = ${id} order by created_at desc`;
    const reassess = await tx`select scheduled_for::text as d, status, reason from rtb.reassessments where application_id = ${id} order by scheduled_for desc`;
    const goals = await tx`select title, target_distance, target_seconds, due_on::text as due_on, status from rtb.training_goals where user_id = ${uid} order by created_at desc`;
    const opps = await tx`select id, origin, status, next_action, next_action_on::text as next_action_on, created_at from rtb.commercial_opportunities where user_id = ${uid} order by created_at desc`;
    const tests = await tx`select t.name, r.seconds, r.status, r.level, r.normalized_pct from rtb.test_results r join rtb.tests t on t.id = r.test_id where r.user_id = ${uid} order by t.planned_month`;
    const events = await tx`select type, from_status, to_status, visibility, created_at from rtb.application_events where user_id = ${uid} order by created_at desc limit 60`;
    const redemptions = await tx`select b.title, r.status, r.created_at from rtb.benefit_redemptions r join rtb.benefits b on b.id = r.benefit_id where r.user_id = ${uid} order by r.created_at desc`;
    const outbox = await tx`select template_key, status, created_at, last_error from rtb.email_outbox where user_id = ${uid} order by created_at desc limit 30`;
    const audit = await tx`select action, entity, data, created_at from rtb.audit_logs where entity_id in (${id}, ${uid}) order by created_at desc limit 60`;
    const coaches = await tx`select user_id as id, display_name as name from rtb.staff_by_role('coach')`;
    const [coach] = await tx`select coach_user_id from rtb.athlete_coach_assignments where athlete_id = ${uid} and ends_at is null`;
    const sims = await tx`select distance, mark_seconds, internal_fit, created_at from rtb.index_simulations where user_id = ${uid} order by created_at desc limit 5`;
    return { c, health, claims, verifications, decisions, notes, contacts, infos, docs, journeys, reassess, goals, opps, tests, events, redemptions, outbox, audit, coaches, coach, sims };
  });
  if (!d) notFound();
  const c = d.c;
  const sla = slaInfo(c.sla_due_at, c.first_contact_at);
  const docLinks = await Promise.all(d.docs.map(async (x) => ({
    id: x.id as string, kind: x.kind as string, original_name: (x.original_name as string | null) ?? null, created_at: x.created_at as Date,
    url: await signedUrl(x.storage_path as string),
  })));
  const hasOpenNext = d.journeys.some((j) => j.journey === "BORA_NEXT" && ["OFFERED", "PENDING_ENROLLMENT", "ACTIVE", "PAUSED"].includes(j.status));
  const st = c.status as string;
  const allowed = ["DRAFT", "SUBMITTED", "WITHDRAWN"].includes(st) ? [] : ([
    st !== "PRELIM_NOT_NOW" && st !== "TECH_APPROVED" ? "APPROVE_ROAD" : null,
    st !== "PRELIM_NOT_NOW" && !hasOpenNext ? "FORWARD_NEXT" : null,
    "REQUEST_INFO", "KEEP_MONITORING",
    st !== "TECH_NOT_APPROVED" ? "NOT_APPROVED" : null,
  ].filter(Boolean) as ("APPROVE_ROAD" | "NOT_APPROVED" | "FORWARD_NEXT" | "REQUEST_INFO" | "KEEP_MONITORING")[]);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/os/candidatos" className="label-mono text-[0.6rem] text-mist-500 hover:text-mist-200">← Candidatos</Link>
          <h1 className="mt-2 text-2xl font-semibold text-mist-50">{c.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill status={st}>{APPLICATION_STATUS_OS[st as keyof typeof APPLICATION_STATUS_OS]}</Pill>
            <Pill>{c.passport_number}</Pill>
            <Pill>{MEMBERSHIP_LABEL[c.membership_verified as keyof typeof MEMBERSHIP_LABEL]}</Pill>
            {c.open_journey && <Pill className="border-volt/40 text-volt">{c.open_journey === "BORA_NEXT" ? "NEXT" : "Road"} · {c.open_journey_status}</Pill>}
            {c.late_entry && <Pill className="border-warn/50 text-warn">Entrada tardia</Pill>}
            {sla && <Pill className={sla.tone === "alert" ? "border-danger/60 text-danger" : sla.tone === "warn" ? "border-warn/50 text-warn" : ""}>SLA · {sla.label}</Pill>}
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <nav aria-label="Abas da ficha" className="mb-4 flex gap-1 overflow-x-auto border-b border-white/[0.06] pb-px">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`?aba=${k}`} scroll={false} aria-current={tab === k ? "page" : undefined}
                className={clsx("label-mono whitespace-nowrap border-b-2 px-3 py-2 text-[0.6rem]", tab === k ? "border-volt text-volt" : "border-transparent text-mist-400 hover:text-mist-100")}>{label}</Link>
            ))}
          </nav>

          {tab === "identidade" && (
            <Card title="Identidade">
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <Fact k="Nome" v={c.full_name} /><Fact k="E-mail" v={c.email} /><Fact k="WhatsApp" v={c.phone_e164} mono />
                <Fact k="Cidade" v={c.city ? `${c.city}/${c.uf}` : null} /><Fact k="Nascimento" v={day(c.birth_date)} mono />
                <Fact k="Categoria" v={CATEGORY_LABEL[c.category as keyof typeof CATEGORY_LABEL]} /><Fact k="Idade em 17/04/2028" v={c.age_on_race_day} mono />
                <Fact k="Faixa" v={c.age_group} mono /><Fact k="Polo" v={c.polo} />
              </dl>
              {hasRole(ctx, "super_admin", "technical_director", "membership_verifier") && <div className="mt-4"><PoloForm userId={c.user_id} current={c.polo} /></div>}
            </Card>
          )}

          {tab === "vinculo" && (
            <div className="grid gap-4">
              <Card title="Autodeclaração (não libera nada)">
                {d.claims.map((x, i) => (
                  <p key={i} className="border-b border-white/5 py-2 text-sm">
                    <strong className="text-mist-50">{x.answer === "SIM_ATUAL" ? "Sim, atualmente" : x.answer === "EX_ALUNO" ? "Já foi aluno" : "Não"}</strong>
                    {x.coach_name && ` · treinador: ${x.coach_name}`}{x.support_point && ` · ponto: ${x.support_point}`}{x.no_polo && " · sem polo"}
                    <span className="tabular ml-2 font-mono text-xs text-mist-500">{dt(x.created_at)}</span>
                  </p>
                ))}
              </Card>
              <Card title="Verificação (histórico)">
                {d.verifications.length ? d.verifications.map((v, i) => (
                  <p key={i} className="border-b border-white/5 py-2 text-sm">{v.previous_status ?? "—"} → <strong className="text-mist-50">{v.status}</strong> · {v.source} · {v.note}
                    {v.external_member_id && ` · Running ${v.external_member_id}`}<span className="tabular ml-2 font-mono text-xs text-mist-500">{dt(v.created_at)}</span></p>
                )) : <p className="text-sm text-mist-400">Ainda não verificado.</p>}
                {hasRole(ctx, "membership_verifier", "super_admin") && <div className="mt-4"><VerifyForm userId={c.user_id} current={c.membership_verified} /></div>}
              </Card>
            </div>
          )}

          {tab === "qualificacao" && (
            <div className="grid gap-4">
              <Card title="Triagem preliminar (não é decisão)">
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <Fact k="Resultado" v={c.prelim_result} /><Fact k="Motivos" v={(c.prelim_reasons as PrelimReason[]).map((x) => REASON_LABEL[x] ?? x).join(" · ") || "Na régua"} />
                  <Fact k="Marca" v={c.mark_seconds ? `${c.mark_distance === "HALF" ? "Meia" : "Maratona"} ${formatDuration(c.mark_seconds)} · ${day(c.mark_date)}${c.mark_race_name ? ` · ${c.mark_race_name}` : ""}` : "Sem marca"} />
                  <Fact k="Índice da faixa" v={c.standard_seconds ? formatDuration(c.standard_seconds) : null} mono />
                  <Fact k="Equivalente maratona" v={c.projected_marathon_seconds ? formatDuration(c.projected_marathon_seconds) : null} mono />
                  <Fact k="Diferença" v={c.gap_seconds !== null ? formatGap(c.gap_seconds) : null} mono />
                  <Fact k="Prova alvo" v={c.target_race_name ?? "Nenhuma"} /><Fact k="4 treinos/semana" v={c.sessions_4plus ? "Sim" : "Não"} />
                  <Fact k="Lesão em tratamento" v={d.health ? (d.health.injury_in_treatment ? "Sim" : "Não") : <span className="text-mist-500">Restrito à coordenação técnica</span>} />
                </dl>
              </Card>
              <Card title="Comprovantes">
                {docLinks.length ? docLinks.map((x) => (
                  <p key={x.id} className="py-1 text-sm">{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-volt hover:underline">{x.original_name ?? x.kind}</a> : x.original_name} · {x.kind} · <span className="tabular font-mono text-xs text-mist-500">{dt(x.created_at)}</span></p>
                )) : <p className="text-sm text-mist-400">Nenhum documento.</p>}
              </Card>
              <Card title="Simulações do Index Lab">
                {d.sims.length ? d.sims.map((s, i) => <p key={i} className="tabular font-mono text-xs">{s.distance} {formatDuration(s.mark_seconds)} · {s.internal_fit} · {dt(s.created_at)}</p>) : <p className="text-sm text-mist-400">Nenhuma simulação ligada à conta.</p>}
              </Card>
            </div>
          )}

          {tab === "analise" && (
            <div className="grid gap-4">
              <Card title="Decisões técnicas (append-only)">
                {d.decisions.length ? d.decisions.map((x, i) => (
                  <div key={i} className="border-b border-white/5 py-3 text-sm">
                    <p className="font-semibold text-mist-50">{DECISION_LABEL[x.decision]} <span className="font-normal text-mist-400">· {x.from_status} → {x.to_status}</span></p>
                    <p className="mt-1 text-mist-200">Motivo: {x.reason}</p>
                    <p className="text-mist-200">Próximo passo: {x.next_step}{x.next_step_on ? ` (${day(x.next_step_on)})` : ""}</p>
                    {x.message_to_athlete && <p className="text-mist-300">Ao atleta: “{x.message_to_athlete}”</p>}
                    <p className="tabular mt-1 font-mono text-xs text-mist-500">{x.display_name ?? "Coordenação"} · {dt(x.created_at)}</p>
                  </div>
                )) : <p className="text-sm text-mist-400">Nenhuma decisão registrada.</p>}
              </Card>
              <Card title="Pedidos de informação">
                {d.infos.length ? d.infos.map((x, i) => (
                  <div key={i} className="border-b border-white/5 py-2 text-sm"><p className="text-mist-100">{x.message}</p>
                    <p className="text-mist-300">{x.status === "ANSWERED" ? `Resposta: ${x.response}` : "Aguardando resposta"}</p></div>
                )) : <p className="text-sm text-mist-400">Nenhum pedido.</p>}
              </Card>
              <Card title="Notas técnicas">
                {d.notes.map((x, i) => <p key={i} className="border-b border-white/5 py-2 text-sm text-mist-100">{x.note}<span className="tabular ml-2 font-mono text-xs text-mist-500">{x.display_name ?? ""} {dt(x.created_at)}</span></p>)}
                {(isTech || hasRole(ctx, "coach")) && <div className="mt-3"><NoteForm applicationId={id} /></div>}
              </Card>
            </div>
          )}

          {tab === "comercial" && (
            <Card title="Oportunidades">
              {d.opps.length ? d.opps.map((o) => (
                <p key={o.id} className="border-b border-white/5 py-2 text-sm"><strong className="text-mist-50">{o.status}</strong> · {o.origin}{o.next_action ? ` · próxima ação: ${o.next_action}` : ""}{o.next_action_on ? ` (${day(o.next_action_on)})` : ""}</p>
              )) : <p className="text-sm text-mist-400">Sem oportunidade comercial (nasce só pela regra: aprovado/NEXT sem matrícula).</p>}
              {hasRole(ctx, "commercial", "super_admin") && d.opps.length > 0 && <Link href="/os/comercial" className="mt-3 inline-block text-sm text-volt hover:underline">Gerenciar no Comercial →</Link>}
            </Card>
          )}

          {tab === "jornada" && (
            <div className="grid gap-4">
              <Card title="Jornadas (nascem só de decisão técnica)">
                {d.journeys.length ? d.journeys.map((j, i) => (
                  <p key={i} className="border-b border-white/5 py-2 text-sm"><strong className="text-mist-50">{j.journey === "BORA_NEXT" ? "BORA NEXT" : "Road to Boston"}</strong> · {j.status}
                    {j.activated_at && ` · ativa desde ${day(j.activated_at)}`}{j.end_reason && ` · ${j.end_reason}`}</p>
                )) : <p className="text-sm text-mist-400">Nenhuma jornada.</p>}
              </Card>
              <Card title="Treinador">
                {hasRole(ctx, "super_admin", "technical_director") ? <CoachSelect athleteId={c.user_id} coaches={d.coaches.map((x) => ({ id: x.id, name: x.name }))} current={d.coach?.coach_user_id ?? null} />
                  : <p className="text-sm text-mist-300">{d.coach ? "Atribuído" : "Sem treinador"}</p>}
              </Card>
              <Card title="Metas e reavaliações">
                {d.goals.map((g, i) => <p key={i} className="tabular border-b border-white/5 py-2 text-sm">{g.title} · {g.target_distance ?? ""} {g.target_seconds ? formatDuration(g.target_seconds) : ""} {g.due_on ? `até ${day(g.due_on)}` : ""} · {g.status}</p>)}
                {d.reassess.map((r, i) => <p key={i} className="tabular py-1 text-sm text-mist-300">Reavaliação {day(r.d)} · {r.status}{r.reason ? ` · ${r.reason}` : ""}</p>)}
                {c.open_journey_status === "ACTIVE" && (isTech || hasRole(ctx, "coach")) && <div className="mt-3"><GoalForm userId={c.user_id} /></div>}
              </Card>
            </div>
          )}

          {tab === "testes" && (
            <Card title="Testes do ciclo">
              {d.tests.length ? d.tests.map((t, i) => <p key={i} className="tabular border-b border-white/5 py-2 font-mono text-sm">{t.name} · {formatDuration(t.seconds)} · {t.status}{t.level ? ` · ${t.level} (${t.normalized_pct}%)` : ""}</p>)
                : <p className="text-sm text-mist-400">Nenhum resultado.</p>}
            </Card>
          )}

          {tab === "mensagens" && (
            <div className="grid gap-4">
              <Card title="Contatos registrados">
                {d.contacts.length ? d.contacts.map((x, i) => <p key={i} className="border-b border-white/5 py-2 text-sm">{x.channel} · {x.outcome}{x.note ? ` · ${x.note}` : ""}<span className="tabular ml-2 font-mono text-xs text-mist-500">{x.display_name ?? ""} {dt(x.created_at)}</span></p>)
                  : <p className="text-sm text-mist-400">Nenhum contato registrado.</p>}
              </Card>
              <Card title="E-mails">
                {d.outbox.length ? d.outbox.map((x, i) => <p key={i} className="tabular font-mono text-xs">{x.template_key} · {x.status}{x.last_error ? ` · ${x.last_error}` : ""} · {dt(x.created_at)}</p>)
                  : <p className="text-sm text-mist-400">Sem acesso ou sem e-mails (Comunicações é de growth/admin).</p>}
              </Card>
              <Card title="Cronologia">
                {d.events.map((e, i) => <p key={i} className="tabular font-mono text-xs text-mist-300">{dt(e.created_at)} · {e.type}{e.to_status ? ` → ${e.to_status}` : ""} {e.visibility === "internal" ? "(interno)" : ""}</p>)}
              </Card>
            </div>
          )}

          {tab === "beneficios" && (
            <Card title="Resgates">
              {d.redemptions.length ? d.redemptions.map((r, i) => <p key={i} className="text-sm">{r.title} · {r.status} · <span className="tabular font-mono text-xs">{dt(r.created_at)}</span></p>)
                : <p className="text-sm text-mist-400">Nenhum resgate (ou sem acesso: benefícios são de growth/admin).</p>}
            </Card>
          )}

          {tab === "auditoria" && (
            <Card title="Auditoria imutável">
              {d.audit.length ? d.audit.map((a, i) => <p key={i} className="tabular font-mono text-xs text-mist-300">{dt(a.created_at)} · {a.action} · {a.entity} · {JSON.stringify(a.data).slice(0, 140)}</p>)
                : <p className="text-sm text-mist-400">Auditoria visível só para super_admin.</p>}
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {isTech ? (
            <Card title="Decisão técnica">
              <DecisionPanel applicationId={id} allowed={allowed} status={st} />
              <p className="mt-3 text-xs leading-relaxed text-mist-500">Cada ação exige motivo e próximo passo, gera evento auditável e avisa o atleta. Decisões são reversíveis por nova decisão; nada é apagado.</p>
            </Card>
          ) : (
            <Card title="Decisão técnica"><p className="text-sm text-mist-300">Somente a coordenação técnica (papel atribuído no banco) registra decisões.</p></Card>
          )}
          {(isTech || hasRole(ctx, "coach", "commercial")) && <Card title="Registrar contato (SLA)"><ContactForm applicationId={id} /></Card>}
          {hasRole(ctx, "super_admin", "technical_director", "commercial", "growth") && (
            <Card title="Automações"><PauseToggle userId={c.user_id} paused={c.automations_paused} /></Card>
          )}
        </aside>
      </div>
    </div>
  );
}
