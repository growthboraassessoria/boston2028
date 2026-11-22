import Link from "next/link";
import { clsx } from "clsx";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { formatDuration } from "@/lib/domain/time";
import { day, dt, TZ } from "@/lib/os/format";
import { Card, OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";
import { GoalForm } from "@/components/os/Forms";
import { ExpandRow, ReassessmentForm } from "@/components/os/admin-forms";

export const metadata = { title: "Jornadas" };

const JOURNEYS = [
  ["ROAD_TO_BOSTON", "Road to Boston 2028", "Ciclo de preparação para a qualificação."],
  ["BORA_NEXT", "BORA NEXT", "Caminho de desenvolvimento, com metas intermediárias e reavaliação."],
] as const;
const STATUS: Record<string, string> = {
  OFFERED: "Convite enviado", PENDING_ENROLLMENT: "Aguardando matrícula", ACTIVE: "Ativa", PAUSED: "Pausada", COMPLETED: "Concluída", CANCELLED: "Cancelada",
};
const STATUS_TONE: Record<string, string> = { ACTIVE: "border-volt/50 text-volt", PAUSED: "border-warn/50 text-warn", CANCELLED: "border-white/15 text-mist-500" };
const FILTERS = [
  ["abertas", "Em aberto"], ["ACTIVE", "Ativas"], ["PENDING_ENROLLMENT", "Aguardando matrícula"], ["OFFERED", "Convite enviado"],
  ["PAUSED", "Pausadas"], ["encerradas", "Concluídas e canceladas"], ["todas", "Todas"],
] as const;
type StatusFilter = (typeof FILTERS)[number][0];
const GOAL_STATUS: Record<string, string> = { ACTIVE: "ativa", ACHIEVED: "alcançada", MISSED: "não alcançada", CANCELLED: "cancelada" };
const DISTANCE: Record<string, string> = { MARATHON: "Maratona", HALF: "Meia", "10K": "10 km", "5K": "5 km", "3K": "3 km" };
const REASSESS: Record<string, string> = { SCHEDULED: "agendada", DONE: "feita", CANCELLED: "cancelada" };
const MEMBERSHIP: Record<string, string> = {
  PENDENTE: "Não conferida", ATIVO_CONFIRMADO: "Verificada", EX_ALUNO_CONFIRMADO: "Ex-aluno", NAO_ALUNO_CONFIRMADO: "Não aluno", DIVERGENCIA: "Em divergência",
};

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function JornadasPage({ searchParams }: { searchParams: Promise<{ jornada?: string; status?: string; q?: string }> }) {
  const ctx = await requireStaff("super_admin", "technical_director", "coach");
  const sp = await searchParams;
  const jornada = JOURNEYS.find(([k]) => k === sp.jornada)?.[0] ?? "todas";
  const status: StatusFilter = FILTERS.find(([k]) => k === sp.status)?.[0] ?? "abertas";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const canCoach = hasRole(ctx, "technical_director", "coach");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

  const d = await asUser(ctx.user, async (tx) => {
    const rows = await tx`
      select e.id, e.user_id, e.application_id, e.journey, e.status, e.offered_at, e.accepted_at, e.activated_at, e.ended_at, e.end_reason,
             p.full_name, p.city, p.uf, p.passport_number, s.membership_verified, s.polo,
             (select sd.display_name from rtb.athlete_coach_assignments ca join rtb.staff_directory sd on sd.user_id = ca.coach_user_id
               where ca.athlete_id = e.user_id and ca.ends_at is null limit 1) as coach_name
      from rtb.journey_enrollments e
      join rtb.profiles p on p.user_id = e.user_id
      left join rtb.athlete_states s on s.user_id = e.user_id
      where e.cycle_id = rtb.current_cycle_id()
        and (${jornada}::text = 'todas' or e.journey = ${jornada}::text)
        and (${status}::text = 'todas'
             or (${status}::text = 'abertas' and e.status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED'))
             or (${status}::text = 'encerradas' and e.status in ('COMPLETED', 'CANCELLED'))
             or e.status = ${status}::text)
        and (${q}::text = '' or p.full_name ilike ${like(q)} or p.passport_number ilike ${like(q)})
      order by array_position(array['ACTIVE', 'PENDING_ENROLLMENT', 'OFFERED', 'PAUSED', 'COMPLETED', 'CANCELLED'], e.status), p.full_name
      limit 400`;
    const counts = await tx`
      select journey, status, count(*)::int as n from rtb.journey_enrollments where cycle_id = rtb.current_cycle_id() group by journey, status`;
    const goals = await tx`
      select g.id, g.user_id, g.title, g.target_distance, g.target_seconds, g.due_on::text as due_on, g.status
      from rtb.training_goals g
      where g.user_id in (select e.user_id from rtb.journey_enrollments e where e.cycle_id = rtb.current_cycle_id())
      order by (g.status = 'ACTIVE') desc, g.due_on nulls last, g.created_at desc`;
    const reassess = await tx`
      select r.id, r.user_id, r.scheduled_for::text as scheduled_for, r.reason, r.status
      from rtb.reassessments r
      where r.user_id in (select e.user_id from rtb.journey_enrollments e where e.cycle_id = rtb.current_cycle_id())
      order by r.scheduled_for`;
    const [cycle] = await tx`select name from rtb.program_cycles where id = rtb.current_cycle_id()`;
    return { rows, counts, goals, reassess, cycle };
  });

  const goalsBy = new Map<string, (typeof d.goals)[number][]>();
  for (const g of d.goals) goalsBy.set(g.user_id, [...(goalsBy.get(g.user_id) ?? []), g]);
  const reassessBy = new Map<string, (typeof d.reassess)[number][]>();
  for (const r of d.reassess) reassessBy.set(r.user_id, [...(reassessBy.get(r.user_id) ?? []), r]);
  const count = (j: string, s: string) => d.counts.find((c) => c.journey === j && c.status === s)?.n ?? 0;
  const link = (params: { jornada?: string; status?: string }) => {
    const u = new URLSearchParams();
    const j = params.jornada ?? jornada;
    const s = params.status ?? status;
    if (j !== "todas") u.set("jornada", j);
    if (s !== "abertas") u.set("status", s);
    if (q) u.set("q", q);
    const str = u.toString();
    return `/os/jornadas${str ? `?${str}` : ""}`;
  };
  const head = ["Atleta", "Status", "Matrícula", "Treinador", "Metas ativas", "Próxima reavaliação", "Desde", "Ação"];
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100";
  const shown = JOURNEYS.filter(([k]) => jornada === "todas" || jornada === k);

  return (
    <div className="grid gap-5">
      <OsTitle kicker={d.cycle?.name ?? "Ciclo atual"} title="Jornadas">
        Toda jornada nasce de uma decisão técnica humana. Ela só fica ativa com a matrícula verificada pela equipe de vínculo.
        Metas e reavaliações são da coordenação técnica e do treinador atribuído.
      </OsTitle>

      <div className="grid gap-3 md:grid-cols-2">
        {JOURNEYS.map(([k, name, about]) => (
          <Card key={k} title={name}>
            <p className="mb-3 text-xs text-mist-400">{about}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {["ACTIVE", "PENDING_ENROLLMENT", "OFFERED", "PAUSED"].map((s) => (
                <div key={s} className="flex flex-col justify-between gap-1">
                  <dt className="label-mono text-[0.56rem] text-mist-500">{STATUS[s]}</dt>
                  <dd><Link href={link({ jornada: k, status: s })} aria-label={`${name}: ${count(k, s)} ${STATUS[s]?.toLowerCase()}`}
                    className="tabular font-mono text-xl text-mist-50 hover:text-volt">{count(k, s)}</Link></dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>

      <form role="search" className="flex flex-wrap gap-2" action="/os/jornadas">
        <select name="jornada" defaultValue={jornada} aria-label="Jornada" className={sel}>
          <option value="todas">Todas as jornadas</option>
          {JOURNEYS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Status da jornada" className={sel}>
          {FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Nome ou passaporte" aria-label="Buscar atleta" className={`${sel} w-56 max-w-full`} />
        <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Filtrar</button>
        {(q || jornada !== "todas" || status !== "abertas") && <Link href="/os/jornadas" className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
      </form>

      {shown.map(([k, name]) => {
        const rows = d.rows.filter((r) => r.journey === k);
        return (
          <section key={k} aria-labelledby={`sec-${k}`} className="grid gap-2">
            <h2 id={`sec-${k}`} className="label-mono text-[0.62rem] text-mist-400">{name} · <span className="tabular">{rows.length}</span></h2>
            <Table head={head} empty={rows.length ? undefined : "Nenhuma jornada com esses filtros."}>
              {rows.map((e) => {
                const goals = goalsBy.get(e.user_id) ?? [];
                const reassess = reassessBy.get(e.user_id) ?? [];
                const next = reassess.find((r) => r.status === "SCHEDULED" && r.scheduled_for >= today);
                const closed = e.status === "COMPLETED" || e.status === "CANCELLED";
                return (
                  <ExpandRow key={e.id} colSpan={head.length} label="Metas" name={e.full_name}
                    cells={<>
                      <Td>
                        <RowLink href={`/os/candidatos/${e.application_id}?aba=jornada`}>{e.full_name}</RowLink>
                        <p className="tabular whitespace-nowrap font-mono text-[0.7rem] text-mist-500">{e.passport_number}</p>
                        <p className="text-xs text-mist-500">{e.city ?? "—"}{e.uf ? `/${e.uf}` : ""}{e.polo ? ` · polo ${e.polo}` : ""}</p>
                      </Td>
                      <Td>
                        <Pill className={STATUS_TONE[e.status]}>{STATUS[e.status] ?? e.status}</Pill>
                        {e.end_reason && <p className="mt-1 text-xs text-mist-500">{e.end_reason === "membership_changed" ? "vínculo mudou" : e.end_reason}</p>}
                      </Td>
                      <Td className={clsx("text-xs", e.membership_verified === "ATIVO_CONFIRMADO" ? "text-volt" : "text-mist-300")}>{MEMBERSHIP[e.membership_verified] ?? "—"}</Td>
                      <Td className="text-xs">{e.coach_name ?? <span className="text-mist-500">Sem treinador</span>}</Td>
                      <Td mono className="text-xs">{goals.filter((g) => g.status === "ACTIVE").length}</Td>
                      <Td mono className="text-xs">{next ? day(next.scheduled_for) : "—"}</Td>
                      <Td mono className="text-xs text-mist-400">{dt(e.activated_at ?? e.offered_at)}</Td>
                    </>}
                    detail={
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div className="grid content-start gap-2">
                          <p className="label-mono text-[0.6rem] text-mist-500">Metas</p>
                          {goals.length ? goals.map((g) => (
                            <p key={g.id} className="border-b border-white/5 pb-2 text-sm text-mist-100">
                              {g.title}
                              <span className="tabular ml-2 font-mono text-xs text-mist-400">
                                {[g.target_distance && DISTANCE[g.target_distance], g.target_seconds && formatDuration(g.target_seconds), g.due_on && `até ${day(g.due_on)}`, GOAL_STATUS[g.status]]
                                  .filter(Boolean).join(" · ")}
                              </span>
                            </p>
                          )) : <p className="text-sm text-mist-400">Nenhuma meta ainda.</p>}
                          {canCoach && e.status === "ACTIVE" && <div className="mt-2"><GoalForm userId={e.user_id} /></div>}
                          {canCoach && e.status !== "ACTIVE" && <p className="text-xs text-mist-500">Metas só com a jornada ativa (matrícula verificada).</p>}
                        </div>
                        <div className="grid content-start gap-2">
                          <p className="label-mono text-[0.6rem] text-mist-500">Reavaliações</p>
                          {reassess.length ? reassess.map((r) => (
                            <p key={r.id} className="tabular border-b border-white/5 pb-2 text-sm text-mist-200">
                              <span className="font-mono">{day(r.scheduled_for)}</span> · {REASSESS[r.status] ?? r.status}{r.reason ? ` · ${r.reason}` : ""}
                            </p>
                          )) : <p className="text-sm text-mist-400">Nenhuma reavaliação.</p>}
                          {canCoach && !closed && <div className="mt-2"><ReassessmentForm userId={e.user_id} applicationId={e.application_id} minDate={today} /></div>}
                          {!canCoach && <p className="text-xs text-mist-500">Metas e reavaliações são registradas pela coordenação técnica ou pelo treinador atribuído.</p>}
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </Table>
          </section>
        );
      })}
    </div>
  );
}
