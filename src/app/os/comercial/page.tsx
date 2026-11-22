import Link from "next/link";
import { clsx } from "clsx";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { APPLICATION_STATUS_OS } from "@/lib/domain/athlete-status";
import { day, dt, TZ } from "@/lib/os/format";
import { Kpi, OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";
import { ExpandRow, OpportunityForm } from "@/components/os/admin-forms";

export const metadata = { title: "Comercial" };

const STATUS: Record<string, string> = {
  OPEN: "Aberta", CONTACTED: "Contato feito", NEGOTIATING: "Em conversa", ON_HOLD: "Em espera", WON: "Ganha", LOST: "Perdida",
};
const STATUS_TONE: Record<string, string> = { WON: "border-volt/50 text-volt", LOST: "border-white/15 text-mist-500" };
const ORIGIN: Record<string, string> = {
  ROAD_APPROVED_NON_MEMBER: "Aprovado Road, sem matrícula", NEXT_FORWARDED_NON_MEMBER: "Indicado ao NEXT, sem matrícula",
  FORMER_MEMBER_RETURN: "Ex-aluno voltando", OTHER: "Outra origem",
};
const MEMBERSHIP: Record<string, string> = {
  PENDENTE: "Não conferida", ATIVO_CONFIRMADO: "Verificada", EX_ALUNO_CONFIRMADO: "Ex-aluno (conferido)",
  NAO_ALUNO_CONFIRMADO: "Não aluno (conferido)", DIVERGENCIA: "Em divergência",
};
const KIND: Record<string, string> = { note: "nota", call: "ligação", message: "mensagem", meeting: "reunião", status_change: "status", system: "sistema" };

const VIEWS = [["abertas", "Abertas"], ["ganhas", "Ganhas"], ["perdidas", "Perdidas"], ["todas", "Todas"]] as const;
type View = (typeof VIEWS)[number][0];
const OWNERS = [["todos", "Qualquer responsável"], ["meus", "Comigo"], ["sem", "Sem responsável"]] as const;
type Owner = (typeof OWNERS)[number][0];
const OPEN = ["OPEN", "CONTACTED", "NEGOTIATING", "ON_HOLD"];

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function ComercialPage({ searchParams }: { searchParams: Promise<{ ver?: string; dono?: string; q?: string }> }) {
  const ctx = await requireStaff("super_admin", "commercial");
  const sp = await searchParams;
  const view: View = VIEWS.find(([k]) => k === sp.ver)?.[0] ?? "abertas";
  const dono: Owner = OWNERS.find(([k]) => k === sp.dono)?.[0] ?? "todos";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

  const d = await asUser(ctx.user, async (tx) => {
    const rows = await tx`
      select o.id, o.user_id, o.application_id, o.origin, o.status, o.owner_id, o.next_action, o.next_action_on::text as next_action_on,
             o.lost_reason, o.converted_at, o.created_at, o.updated_at,
             p.full_name, p.email::text as email, p.phone_e164, p.city, p.uf, p.passport_number,
             a.status as application_status, s.membership_verified, sd.display_name as owner_name
      from rtb.commercial_opportunities o
      join rtb.profiles p on p.user_id = o.user_id
      left join rtb.applications a on a.id = o.application_id
      left join rtb.athlete_states s on s.user_id = o.user_id
      left join rtb.staff_directory sd on sd.user_id = o.owner_id
      where (${view}::text = 'todas'
             or (${view}::text = 'abertas' and o.status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD'))
             or (${view}::text = 'ganhas' and o.status = 'WON')
             or (${view}::text = 'perdidas' and o.status = 'LOST'))
        and (${dono}::text = 'todos' or (${dono}::text = 'meus' and o.owner_id = ${ctx.user.id}) or (${dono}::text = 'sem' and o.owner_id is null))
        and (${q}::text = '' or p.full_name ilike ${like(q)} or p.email::text ilike ${like(q)} or p.passport_number ilike ${like(q)})
      order by case o.status when 'OPEN' then 0 when 'CONTACTED' then 1 when 'NEGOTIATING' then 2 when 'ON_HOLD' then 3 else 4 end,
               o.next_action_on nulls last, o.created_at
      limit 300`;
    const [k] = await tx`
      select count(*) filter (where status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD'))::int as open,
             count(*) filter (where status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD') and next_action_on < ${today}::date)::int as overdue,
             count(*) filter (where status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD') and owner_id is null)::int as unowned,
             count(*) filter (where status = 'WON')::int as won,
             count(*) filter (where status = 'LOST')::int as lost,
             count(*)::int as total
      from rtb.commercial_opportunities`;
    const owners = await tx`select user_id, display_name from rtb.staff_by_role('commercial')`;
    const acts = await tx`
      select h.opportunity_id, h.kind, h.note, h.created_at, sd.display_name
      from (select a.*, row_number() over (partition by a.opportunity_id order by a.created_at desc) as n from rtb.commercial_activities a) h
      left join rtb.staff_directory sd on sd.user_id = h.actor_id
      where h.n <= 5
      order by h.created_at desc`;
    return { rows, k, owners, acts };
  });

  const owners = d.owners.map((o) => ({ id: o.user_id as string, name: o.display_name as string }));
  const actsBy = new Map<string, (typeof d.acts)[number][]>();
  for (const a of d.acts) actsBy.set(a.opportunity_id, [...(actsBy.get(a.opportunity_id) ?? []), a]);
  const counts: Record<View, number> = { abertas: d.k?.open ?? 0, ganhas: d.k?.won ?? 0, perdidas: d.k?.lost ?? 0, todas: d.k?.total ?? 0 };
  const link = (v: View) => `/os/comercial?ver=${v}${dono !== "todos" ? `&dono=${dono}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const head = ["Atleta", "Contato", "Origem", "Status", "Matrícula", "Responsável", "Próxima ação", "Ação"];
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100";

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Comercial" title="Oportunidades">
        A oportunidade nasce só pela regra do fluxo: aprovado no Road ou indicado ao NEXT sem matrícula ativa.
        <strong className="text-mist-50"> “Ganha” só vale com a matrícula verificada pela equipe de vínculo</strong> (a verificação marca sozinha).
        Nenhuma receita é registrada aqui.
      </OsTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Abertas" value={d.k?.open ?? 0} hint={`${d.k?.unowned ?? 0} sem responsável`} />
        <Kpi label="Próxima ação vencida" value={d.k?.overdue ?? 0} tone={d.k?.overdue ? "alert" : undefined} hint="abertas com data passada" />
        <Kpi label="Ganhas" value={d.k?.won ?? 0} hint="matrícula verificada" tone={d.k?.won ? "signal" : undefined} />
        <Kpi label="Perdidas" value={d.k?.lost ?? 0} hint="com motivo registrado" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Situação das oportunidades" className="flex flex-wrap gap-1">
          {VIEWS.map(([k, labelText]) => (
            <Link key={k} href={link(k)} aria-current={view === k ? "page" : undefined}
              className={clsx("label-mono rounded-[3px] border px-2.5 py-2 text-[0.62rem]", view === k ? "border-volt text-volt" : "border-white/10 text-mist-400 hover:text-mist-100")}>
              {labelText} <span className="tabular">({counts[k]})</span>
            </Link>
          ))}
        </nav>
        <form role="search" className="flex flex-wrap gap-2" action="/os/comercial">
          <input type="hidden" name="ver" value={view} />
          <select name="dono" defaultValue={dono} aria-label="Responsável" className={sel}>
            {OWNERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="Nome, e-mail ou passaporte" aria-label="Buscar atleta" className={`${sel} w-60 max-w-full`} />
          <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Filtrar</button>
          {(q || dono !== "todos") && <Link href={`/os/comercial?ver=${view}`} className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
        </form>
      </div>

      <Table head={head} empty={d.rows.length ? undefined : "Nenhuma oportunidade com esses filtros."}>
        {d.rows.map((o) => {
          const overdue = OPEN.includes(o.status) && !!o.next_action_on && o.next_action_on < today;
          const verified = o.membership_verified === "ATIVO_CONFIRMADO";
          const acts = actsBy.get(o.id) ?? [];
          const ownerList = o.owner_id && !owners.some((x) => x.id === o.owner_id)
            ? [...owners, { id: o.owner_id as string, name: (o.owner_name as string | null) ?? "Responsável atual" }] : owners;
          return (
            <ExpandRow key={o.id} colSpan={head.length} label="Editar" name={o.full_name}
              cells={<>
                <Td>
                  {o.application_id ? <RowLink href={`/os/candidatos/${o.application_id}?aba=comercial`}>{o.full_name}</RowLink>
                    : <span className="font-medium text-mist-50">{o.full_name}</span>}
                  <p className="tabular whitespace-nowrap font-mono text-[0.7rem] text-mist-500">{o.passport_number}</p>
                  <p className="text-xs text-mist-500">{o.city ?? "—"}{o.uf ? `/${o.uf}` : ""}</p>
                </Td>
                <Td className="text-xs">
                  <p className="max-w-[14rem] break-all text-mist-200">{o.email}</p>
                  {o.phone_e164 ? <a href={`tel:${o.phone_e164}`} className="tabular font-mono text-mist-300 hover:text-volt">{o.phone_e164}</a> : <span className="text-mist-500">sem telefone</span>}
                </Td>
                <Td className="text-xs text-mist-300">{ORIGIN[o.origin] ?? o.origin}</Td>
                <Td><Pill className={STATUS_TONE[o.status]}>{STATUS[o.status] ?? o.status}</Pill></Td>
                <Td className={clsx("text-xs", verified ? "text-volt" : "text-mist-300")}>{MEMBERSHIP[o.membership_verified] ?? "—"}</Td>
                <Td className="text-xs">{o.owner_name ?? <span className="text-mist-500">Sem responsável</span>}</Td>
                <Td className="text-xs">
                  <p className="max-w-[14rem] text-mist-200">{o.next_action ?? <span className="text-mist-500">—</span>}</p>
                  {o.next_action_on && <p className={clsx("tabular font-mono", overdue ? "text-danger" : "text-mist-400")}>{day(o.next_action_on)}{overdue ? " · vencida" : ""}</p>}
                </Td>
              </>}
              detail={
                <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
                  <OpportunityForm canWin={verified} owners={ownerList}
                    initial={{ id: o.id, status: o.status, ownerId: o.owner_id ?? "", nextAction: o.next_action ?? "", nextActionOn: o.next_action_on ?? "", lostReason: o.lost_reason ?? "" }} />
                  <div className="grid content-start gap-2">
                    <p className="label-mono text-[0.6rem] text-mist-500">Histórico</p>
                    {acts.length ? acts.map((a, i) => (
                      <p key={i} className="border-b border-white/5 pb-2 text-sm text-mist-200">
                        <span className="label-mono mr-1.5 text-[0.58rem] text-mist-500">{KIND[a.kind] ?? a.kind}</span>{a.note ?? "—"}
                        <span className="tabular block font-mono text-xs text-mist-500">{a.display_name ?? "Sistema"} · {dt(a.created_at)}</span>
                      </p>
                    )) : <p className="text-sm text-mist-400">Sem registros ainda.</p>}
                    <p className="text-xs text-mist-500">
                      Candidatura: {o.application_status ? APPLICATION_STATUS_OS[o.application_status as keyof typeof APPLICATION_STATUS_OS] ?? o.application_status : "—"}
                      {" · "}criada {dt(o.created_at)}{o.converted_at ? ` · ganha ${dt(o.converted_at)}` : ""}
                    </p>
                    {o.status === "LOST" && o.lost_reason && <p className="text-xs text-mist-400">Motivo da perda: {o.lost_reason}</p>}
                  </div>
                </div>
              }
            />
          );
        })}
      </Table>
    </div>
  );
}
