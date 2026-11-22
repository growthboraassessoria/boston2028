import Link from "next/link";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { dt } from "@/lib/os/format";
import { Kpi, OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";
import { PoloForm, VerifyForm } from "@/components/os/Forms";
import { ExpandRow } from "@/components/os/admin-forms";

export const metadata = { title: "Vínculo BORA" };

const DECLARED: Record<string, string> = {
  NAO_INFORMADO: "Não informou", SIM_ATUAL: "Diz ser aluno atual", EX_ALUNO: "Diz ser ex-aluno", NAO: "Diz não ser aluno",
};
const VERIFIED: Record<string, string> = {
  PENDENTE: "Pendente", ATIVO_CONFIRMADO: "Ativo confirmado", EX_ALUNO_CONFIRMADO: "Ex-aluno confirmado",
  NAO_ALUNO_CONFIRMADO: "Não aluno confirmado", DIVERGENCIA: "Divergência",
};
const VERIFIED_TONE: Record<string, string> = {
  PENDENTE: "border-warn/50 text-warn", ATIVO_CONFIRMADO: "border-volt/50 text-volt", DIVERGENCIA: "border-danger/60 text-danger",
};
const ACCESS: Record<string, string> = {
  CANDIDATE_ONLY: "Só candidatura", PENDING_ENROLLMENT: "Aguardando matrícula", ACTIVE_MEMBER: "Matrícula ativa", SUSPENDED: "Acesso suspenso",
};
const JOURNEY: Record<string, string> = {
  NONE: "Sem jornada", ROAD_TO_BOSTON: "Road to Boston", BORA_NEXT: "BORA NEXT", PAUSED: "Jornada pausada", COMPLETED: "Jornada concluída",
};
const SOURCE: Record<string, string> = { manual: "conferência manual", running_sync: "Running", import: "importação", system: "sistema" };

const FILTERS = [["pendentes", "Pendentes"], ["divergencias", "Divergências"], ["todos", "Todos"]] as const;
type Filter = (typeof FILTERS)[number][0];

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function AlunosPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const ctx = await requireStaff("super_admin", "membership_verifier", "technical_director");
  const sp = await searchParams;
  const filtro: Filter = FILTERS.find(([k]) => k === sp.filtro)?.[0] ?? "pendentes";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const canVerify = hasRole(ctx, "membership_verifier", "super_admin");

  const d = await asUser(ctx.user, async (tx) => {
    const rows = await tx`
      select x.* from (
        select m.user_id, m.full_name, m.email, m.city, m.uf, m.passport_number, m.membership_declared, m.membership_verified,
               m.access_status, m.journey_status, m.polo, m.declared_coach, m.declared_support_point, m.declared_no_polo,
               m.declared_at, m.verified_at,
               (m.membership_verified = 'DIVERGENCIA'
                 or (m.membership_declared = 'SIM_ATUAL' and m.membership_verified in ('NAO_ALUNO_CONFIRMADO', 'EX_ALUNO_CONFIRMADO'))
                 or (m.membership_declared = 'EX_ALUNO' and m.membership_verified = 'NAO_ALUNO_CONFIRMADO')) as divergent,
               (select a.id from rtb.applications a where a.user_id = m.user_id and a.status <> 'DRAFT'
                 order by a.created_at desc limit 1) as application_id
        from rtb.os_members m
      ) x
      where (${filtro}::text = 'todos'
             or (${filtro}::text = 'pendentes' and x.membership_verified = 'PENDENTE')
             or (${filtro}::text = 'divergencias' and x.divergent))
        and (${q}::text = '' or x.full_name ilike ${like(q)} or x.email::text ilike ${like(q)} or x.passport_number ilike ${like(q)})
      order by (x.access_status = 'PENDING_ENROLLMENT') desc, (x.membership_declared = 'SIM_ATUAL') desc, x.declared_at nulls last, x.full_name
      limit 300`;
    const [k] = await tx`
      select count(*) filter (where membership_verified = 'PENDENTE')::int as pending,
             count(*) filter (where membership_verified = 'PENDENTE' and membership_declared = 'SIM_ATUAL')::int as pending_claims,
             count(*) filter (where membership_verified = 'DIVERGENCIA'
               or (membership_declared = 'SIM_ATUAL' and membership_verified in ('NAO_ALUNO_CONFIRMADO', 'EX_ALUNO_CONFIRMADO'))
               or (membership_declared = 'EX_ALUNO' and membership_verified = 'NAO_ALUNO_CONFIRMADO'))::int as divergent,
             count(*) filter (where membership_verified = 'ATIVO_CONFIRMADO')::int as active,
             count(*)::int as total
      from rtb.os_members`;
    const history = await tx`
      select h.user_id, h.status, h.previous_status, h.source, h.note, h.external_member_id, h.created_at, sd.display_name
      from (select v.*, row_number() over (partition by v.user_id order by v.created_at desc) as n from rtb.membership_verifications v) h
      left join rtb.staff_directory sd on sd.user_id = h.verified_by
      where h.n <= 3
      order by h.created_at desc`;
    const [flag] = await tx`select enabled from rtb.feature_flags where key = 'running_integration'`;
    return { rows, k, history, running: !!flag?.enabled };
  });

  const historyBy = new Map<string, (typeof d.history)[number][]>();
  for (const h of d.history) historyBy.set(h.user_id, [...(historyBy.get(h.user_id) ?? []), h]);
  const counts: Record<Filter, number> = { pendentes: d.k?.pending ?? 0, divergencias: d.k?.divergent ?? 0, todos: d.k?.total ?? 0 };
  const qs = (f: Filter) => `/os/alunos?filtro=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const head = ["Atleta", "Autodeclaração", "Conferência", "Acesso · jornada", "Polo", "Ação"];

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Equipe de vínculo" title="Vínculo BORA">
        Confira se quem diz ser aluno da BORA é aluno de verdade. <strong className="text-mist-50">A autodeclaração nunca libera função paga:</strong> só
        “Ativo confirmado”, registrado aqui com a origem da conferência, libera jornada, metas e benefícios.
      </OsTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Pendentes" value={counts.pendentes} hint="sem conferência ainda" />
        <Kpi label="Dizem ser alunos" value={d.k?.pending_claims ?? 0} hint="pendentes, prioridade" tone={d.k?.pending_claims ? "signal" : undefined} />
        <Kpi label="Divergências" value={counts.divergencias} hint="declarado ≠ conferido" tone={counts.divergencias ? "alert" : undefined} />
        <Kpi label="Ativos confirmados" value={d.k?.active ?? 0} hint="matrícula verificada" />
      </div>

      <div className="grid gap-3 rounded-[4px] border border-warn/40 bg-warn/[0.07] px-3 py-2.5 md:grid-cols-[auto_1fr] md:items-center">
        <button type="button" disabled aria-describedby="running-ajuda"
          className="inline-flex min-h-10 cursor-not-allowed items-center justify-self-start gap-2 rounded-[3px] border border-white/15 px-3.5 text-sm font-semibold text-mist-300 opacity-60">
          <RefreshCw className="size-4" aria-hidden /> Sincronizar com a Running
        </button>
        <p id="running-ajuda" className="min-w-0 text-sm leading-relaxed text-mist-100 [overflow-wrap:anywhere]">
          {d.running
            ? "O flag running_integration está ligado, mas não existe conector com a Running: nenhuma sincronização acontece. Continue conferindo à mão."
            : "A integração com a Running ainda não existe (flag running_integration desligado). Nada é buscado fora daqui: confira na planilha da unidade ou com o treinador e anote a origem."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtro da fila" className="flex flex-wrap gap-1">
          {FILTERS.map(([k, labelText]) => (
            <Link key={k} href={qs(k)} aria-current={filtro === k ? "page" : undefined}
              className={clsx("label-mono rounded-[3px] border px-2.5 py-2 text-[0.62rem]", filtro === k ? "border-volt text-volt" : "border-white/10 text-mist-400 hover:text-mist-100")}>
              {labelText} <span className="tabular">({counts[k]})</span>
            </Link>
          ))}
        </nav>
        <form role="search" className="flex flex-wrap gap-2" action="/os/alunos">
          <input type="hidden" name="filtro" value={filtro} />
          <input name="q" defaultValue={q} placeholder="Nome, e-mail ou passaporte" aria-label="Buscar atleta"
            className="min-h-10 w-64 max-w-full rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100" />
          <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Buscar</button>
          {q && <Link href={`/os/alunos?filtro=${filtro}`} className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
        </form>
      </div>

      <Table head={head} empty={d.rows.length ? undefined : filtro === "pendentes" ? "Nenhum vínculo pendente. Tudo conferido." : "Ninguém com esses filtros."}>
        {d.rows.map((r) => {
          const hist = historyBy.get(r.user_id) ?? [];
          return (
            <ExpandRow key={r.user_id} colSpan={head.length} label="Conferir" name={r.full_name}
              cells={<>
                <Td>
                  {r.application_id ? <RowLink href={`/os/candidatos/${r.application_id}?aba=vinculo`}>{r.full_name}</RowLink>
                    : <span className="font-medium text-mist-50">{r.full_name}</span>}
                  <p className="tabular whitespace-nowrap font-mono text-[0.7rem] text-mist-500">{r.passport_number}</p>
                  <p className="text-xs text-mist-500">{r.city ?? "—"}{r.uf ? `/${r.uf}` : ""}</p>
                </Td>
                <Td className="text-xs">
                  <p className="text-mist-100">{DECLARED[r.membership_declared] ?? r.membership_declared}</p>
                  {(r.declared_coach || r.declared_support_point || r.declared_no_polo) && (
                    <p className="mt-0.5 max-w-[16rem] text-mist-400">
                      {[r.declared_coach && `treinador: ${r.declared_coach}`, r.declared_support_point && `ponto: ${r.declared_support_point}`, r.declared_no_polo && "sem polo"]
                        .filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="tabular mt-0.5 font-mono text-[0.7rem] text-mist-500">{dt(r.declared_at)}</p>
                </Td>
                <Td className="text-xs">
                  <Pill className={VERIFIED_TONE[r.membership_verified]}>{VERIFIED[r.membership_verified] ?? r.membership_verified}</Pill>
                  {r.divergent && r.membership_verified !== "DIVERGENCIA" && <p className="mt-1 text-danger">Diferente do declarado</p>}
                  <p className="tabular mt-1 font-mono text-[0.7rem] text-mist-500">{r.verified_at ? `conferido ${dt(r.verified_at)}` : "nunca conferido"}</p>
                </Td>
                <Td className="text-xs">
                  <p className="text-mist-100">{ACCESS[r.access_status] ?? r.access_status}</p>
                  <p className="text-mist-500">{JOURNEY[r.journey_status] ?? r.journey_status}</p>
                </Td>
                <Td className="text-xs">{r.polo ?? "—"}</Td>
              </>}
              detail={
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <p className="label-mono text-[0.6rem] text-mist-500">Últimas conferências</p>
                    {hist.length ? hist.map((h, i) => (
                      <p key={i} className="border-b border-white/5 pb-2 text-sm text-mist-200">
                        {VERIFIED[h.previous_status] ?? "—"} → <strong className="text-mist-50">{VERIFIED[h.status] ?? h.status}</strong>
                        {" · "}{SOURCE[h.source] ?? h.source}{h.note ? ` · ${h.note}` : ""}{h.external_member_id ? ` · ID Running ${h.external_member_id}` : ""}
                        <span className="tabular ml-2 font-mono text-xs text-mist-500">{h.display_name ?? "Equipe"} · {dt(h.created_at)}</span>
                      </p>
                    )) : <p className="text-sm text-mist-400">Ainda não conferido.</p>}
                    <p className="text-xs leading-relaxed text-mist-500">
                      A autodeclaração é só o ponto de partida. Mudar a conferência recalcula acesso e jornadas, sem apagar histórico.
                    </p>
                  </div>
                  <div className="grid content-start gap-4">
                    {canVerify ? (
                      <div className="grid gap-2">
                        <p className="label-mono text-[0.6rem] text-mist-500">Registrar conferência</p>
                        <VerifyForm userId={r.user_id} current={r.membership_verified} />
                      </div>
                    ) : (
                      <p className="text-sm text-mist-300">Só a equipe de vínculo (ou o admin) registra a conferência. A coordenação técnica acompanha por aqui.</p>
                    )}
                    <div className="grid gap-2">
                      <p className="label-mono text-[0.6rem] text-mist-500">Polo</p>
                      <PoloForm userId={r.user_id} current={r.polo} />
                    </div>
                  </div>
                </div>
              }
            />
          );
        })}
      </Table>
      {d.rows.length === 300 && <p className="text-xs text-mist-500">Mostrando os primeiros 300. Use a busca para achar alguém específico.</p>}
    </div>
  );
}
