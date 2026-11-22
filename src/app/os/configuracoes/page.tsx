import Link from "next/link";
import { clsx } from "clsx";
import { hasRole, requireStaff, type StaffContext } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { formatDuration } from "@/lib/domain/time";
import { day, dt } from "@/lib/os/format";
import { Card, OsTitle, Pill, Table, Td } from "@/components/os/ui";
import {
  AnonymizeButton, DataRequestForm, ExpandRow, FlagToggle, GrantRoleForm, HolidayAddForm, HolidayRemoveButton, RaceForm, RevokeRoleButton, SettingForm,
} from "@/components/os/admin-forms";

export const metadata = { title: "Configurações" };

const TABS = [
  ["regras", "Regras"], ["flags", "Flags"], ["provas", "Provas alvo"], ["feriados", "Feriados"], ["indices", "Índices"], ["papeis", "Papéis"], ["lgpd", "LGPD"],
] as const;
type Tab = (typeof TABS)[number][0];
const ADMIN_TABS: Tab[] = ["papeis", "lgpd"];
// Mesmas famílias que o RLS libera para a coordenação técnica.
const TECH_PREFIXES = ["internal_rule", "ranking", "next", "sla"];

const SETTING_STATUS: Record<string, [string, string]> = {
  approved: ["Aprovada", "border-volt/50 text-volt"], proposed: ["Proposta", "border-white/20 text-mist-200"], pending: ["Pendente", "border-warn/50 text-warn"],
};
const RACE_STATUS: Record<string, string> = { provisional: "Provisória", confirmed: "Confirmada", archived: "Arquivada" };
const HOLIDAY_KIND: Record<string, string> = { national: "Nacional", optional: "Ponto facultativo", local: "Local" };
const VERSION_STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativa", archived: "Arquivada" };
const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin", growth: "Growth", technical_director: "Coordenação técnica", coach: "Treinador", commercial: "Comercial",
  membership_verifier: "Vínculo", partner_operator: "Operador de parceiro",
};
const REQUEST_KIND: Record<string, string> = {
  ACCESS: "Acesso aos dados", RECTIFICATION: "Correção", DELETION: "Exclusão", PORTABILITY: "Portabilidade", OBJECTION: "Oposição",
};
const REQUEST_STATUS: Record<string, [string, string]> = {
  OPEN: ["Aberto", "border-warn/50 text-warn"], IN_PROGRESS: ["Em andamento", "border-blue-300/40 text-blue-300"],
  DONE: ["Concluído", "border-volt/50 text-volt"], REJECTED: ["Recusado", "border-white/15 text-mist-400"],
};

const weekday = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
// Fim do id (os ids de demonstração começam todos com 00000000).
const shortId = (id: string) => String(id).slice(-8);

function Who({ name, id }: { name: string | null; id: string }) {
  return name ? <span className="font-medium text-mist-50">{name}</span>
    : <span className="text-mist-300">Sem nome no diretório <span className="tabular font-mono text-xs text-mist-500">· {shortId(id)}</span></span>;
}

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await requireStaff("super_admin", "technical_director");
  const sp = await searchParams;
  const isAdmin = hasRole(ctx, "super_admin");
  const tabs = TABS.filter(([k]) => isAdmin || !ADMIN_TABS.includes(k));
  const tab: Tab = tabs.find(([k]) => k === sp.aba)?.[0] ?? "regras";

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Administração" title="Configurações">
        Regras do programa, flags, provas alvo, feriados e índices{isAdmin ? ", papéis da equipe e pedidos de LGPD" : ""}. Toda mudança fica na auditoria.
        {!isAdmin && " A coordenação técnica edita as regras internal_rule, ranking, next e sla e as provas alvo; o resto é do admin."}
      </OsTitle>
      <nav aria-label="Abas de configuração" className="flex gap-1 overflow-x-auto border-b border-white/[0.06] pb-px">
        {tabs.map(([k, labelText]) => (
          <Link key={k} href={`?aba=${k}`} scroll={false} aria-current={tab === k ? "page" : undefined}
            className={clsx("label-mono whitespace-nowrap border-b-2 px-3 py-2.5 text-[0.6rem]", tab === k ? "border-volt text-volt" : "border-transparent text-mist-400 hover:text-mist-100")}>
            {labelText}
          </Link>
        ))}
      </nav>
      {tab === "regras" && <RegrasTab ctx={ctx} />}
      {tab === "flags" && <FlagsTab ctx={ctx} />}
      {tab === "provas" && <ProvasTab ctx={ctx} />}
      {tab === "feriados" && <FeriadosTab ctx={ctx} />}
      {tab === "indices" && <IndicesTab ctx={ctx} />}
      {tab === "papeis" && isAdmin && <PapeisTab ctx={ctx} />}
      {tab === "lgpd" && isAdmin && <LgpdTab ctx={ctx} />}
    </div>
  );
}

// ── Regras ───────────────────────────────────────────────────────────────────

async function RegrasTab({ ctx }: { ctx: StaffContext }) {
  const isAdmin = hasRole(ctx, "super_admin");
  const rows = await asUser(ctx.user, (tx) => tx`
    select s.key, s.value, s.status, s.description, s.updated_at, sd.display_name as updated_by_name
    from rtb.program_settings s left join rtb.staff_directory sd on sd.user_id = s.updated_by
    order by s.key`);
  const head = ["Regra", "Valor", "Status", "Atualizada", "Ação"];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-mist-300">
        “Aprovada” vale como regra do programa; “proposta” e “pendente” ainda dependem de decisão. O banco recusa valores fora do formato que as funções usam.
      </p>
      <Table head={head} empty={rows.length ? undefined : "Nenhuma regra cadastrada."}>
        {rows.map((s) => {
          const canEdit = isAdmin || TECH_PREFIXES.includes(String(s.key).split(".")[0]!);
          const [statusText, tone] = SETTING_STATUS[s.status] ?? [s.status, ""];
          const cells = (
            <>
              <Td>
                <p className="tabular font-mono text-sm text-mist-50">{s.key}</p>
                <p className="mt-0.5 max-w-[26rem] text-xs leading-relaxed text-mist-400">{s.description}</p>
              </Td>
              <Td>
                {s.value && typeof s.value === "object" && !Array.isArray(s.value) ? (
                  <dl className="tabular grid max-w-[24rem] gap-0.5 font-mono text-[0.72rem] leading-relaxed">
                    {Object.entries(s.value as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex flex-wrap gap-x-1.5"><dt className="text-mist-500">{k}:</dt><dd className="break-all text-mist-100">{JSON.stringify(v)}</dd></div>
                    ))}
                  </dl>
                ) : <code className="break-all font-mono text-[0.72rem] text-mist-100">{JSON.stringify(s.value)}</code>}
              </Td>
              <Td><Pill className={tone}>{statusText}</Pill></Td>
              <Td className="text-xs">
                <p className="tabular font-mono text-mist-300">{dt(s.updated_at)}</p>
                {s.updated_by_name && <p className="text-mist-500">{s.updated_by_name}</p>}
              </Td>
            </>
          );
          return canEdit ? (
            <ExpandRow key={s.key} colSpan={head.length} label="Editar" name={s.key} cells={cells}
              detail={<SettingForm settingKey={s.key} value={JSON.stringify(s.value, null, 2)} status={s.status} />} />
          ) : (
            <tr key={s.key} className="hover:bg-white/[0.02]">{cells}<Td className="text-right text-xs text-mist-500">Só admin</Td></tr>
          );
        })}
      </Table>
    </div>
  );
}

// ── Flags ────────────────────────────────────────────────────────────────────

async function FlagsTab({ ctx }: { ctx: StaffContext }) {
  const isAdmin = hasRole(ctx, "super_admin");
  const d = await asUser(ctx.user, async (tx) => {
    const flags = await tx`
      select f.key, f.enabled, f.description, f.updated_at, sd.display_name as updated_by_name
      from rtb.feature_flags f left join rtb.staff_directory sd on sd.user_id = f.updated_by order by f.key`;
    const [rank] = await tx`select status from rtb.program_settings where key = 'ranking'`;
    return { flags, rankingApproved: rank?.status === "approved" };
  });
  return (
    <div className="grid gap-3">
      {!isAdmin && <p className="text-sm text-mist-300">Só o super_admin liga ou desliga flags. Aqui você acompanha o estado atual.</p>}
      <Table head={["Flag", "Para que serve", "Atualizado", "Estado"]} empty={d.flags.length ? undefined : "Nenhum flag cadastrado."}>
        {d.flags.map((f) => {
          let lockReason: string | undefined;
          if (!isAdmin) lockReason = "Só o super_admin muda flags.";
          else if (f.key === "running_integration" && !f.enabled) lockReason = "Bloqueado: não existe API da Running confirmada. Ligar o flag não cria integração.";
          else if (f.key === "ranking_public" && !f.enabled && !d.rankingApproved) lockReason = "Liga só depois que a fórmula do ranking for aprovada (Regras › ranking).";
          return (
            <tr key={f.key} className="hover:bg-white/[0.02]">
              <Td><span className="tabular font-mono text-sm text-mist-50">{f.key}</span></Td>
              <Td className="max-w-[28rem] text-xs leading-relaxed text-mist-300">{f.description}</Td>
              <Td className="text-xs">
                <p className="tabular font-mono text-mist-300">{dt(f.updated_at)}</p>
                {f.updated_by_name && <p className="text-mist-500">{f.updated_by_name}</p>}
              </Td>
              <Td className="text-right"><FlagToggle flagKey={f.key} enabled={!!f.enabled} locked={!!lockReason} lockReason={isAdmin ? lockReason : undefined} /></Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

// ── Provas alvo ──────────────────────────────────────────────────────────────

async function ProvasTab({ ctx }: { ctx: StaffContext }) {
  const rows = await asUser(ctx.user, (tx) => tx`
    select id, slug, name, city, country, race_date::text as race_date, race_date_confirmed, enrollment_deadline::text as enrollment_deadline,
           deadline_confirmed, sixteen_weeks_checked, official_url, status, notes, updated_at
    from rtb.target_races order by sort_order, name`);
  const head = ["Prova", "Data", "Prazo de inscrição", "16 semanas", "Status", "Fonte oficial", "Ação"];
  const conf = (v: string | null, ok: boolean) => v
    ? <span className="tabular font-mono">{day(v)} <span className={ok ? "text-volt" : "text-warn"}>{ok ? "· confirmada" : "· a confirmar"}</span></span>
    : <span className="text-mist-500">a confirmar</span>;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-mist-300">Datas e prazos só entram como confirmados com o link da fonte oficial da prova. O site público mostra estes dados com o status de cada um.</p>
      <Table head={head} empty={rows.length ? undefined : "Nenhuma prova alvo cadastrada."}>
        {rows.map((r) => (
          <ExpandRow key={r.id} colSpan={head.length} label="Editar" name={r.name}
            cells={<>
              <Td>
                <p className="font-medium text-mist-50">{r.name}</p>
                <p className="text-xs text-mist-500">{r.city} · {r.country}</p>
              </Td>
              <Td className="text-xs">{conf(r.race_date, r.race_date_confirmed)}</Td>
              <Td className="text-xs">{conf(r.enrollment_deadline, r.deadline_confirmed)}</Td>
              <Td className="text-xs">{r.sixteen_weeks_checked ? <span className="text-volt">Conferida</span> : <span className="text-warn">A conferir</span>}</Td>
              <Td><Pill className={r.status === "confirmed" ? "border-volt/50 text-volt" : undefined}>{RACE_STATUS[r.status] ?? r.status}</Pill></Td>
              <Td className="max-w-[14rem] text-xs">
                {r.official_url ? <a href={r.official_url} target="_blank" rel="noopener noreferrer" className="break-all text-volt hover:underline">{String(r.official_url).replace(/^https:\/\//, "")}</a>
                  : <span className="text-mist-500">sem link</span>}
              </Td>
            </>}
            detail={<RaceForm initial={{
              id: r.id, name: r.name, raceDate: r.race_date ?? "", raceDateConfirmed: !!r.race_date_confirmed, enrollmentDeadline: r.enrollment_deadline ?? "",
              deadlineConfirmed: !!r.deadline_confirmed, sixteenWeeksChecked: !!r.sixteen_weeks_checked, status: r.status, officialUrl: r.official_url ?? "", notes: r.notes ?? "",
            }} />}
          />
        ))}
      </Table>
    </div>
  );
}

// ── Feriados ─────────────────────────────────────────────────────────────────

async function FeriadosTab({ ctx }: { ctx: StaffContext }) {
  const isAdmin = hasRole(ctx, "super_admin");
  const rows = await asUser(ctx.user, (tx) => tx`select day::text as day, label, kind from rtb.business_holidays order by day`);
  const years = [...new Set(rows.map((r) => String(r.day).slice(0, 4)))].sort().reverse();
  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist-300">
        Dias não úteis para o SLA de 3 dias úteis do “Quase lá” (fuso de Brasília). Pontos facultativos contam como não úteis enquanto a regra “sla” disser isso.
        Mudanças valem para os próximos prazos; os já calculados não mudam.
      </p>
      {isAdmin ? <Card title="Incluir feriado"><HolidayAddForm /></Card> : <p className="text-xs text-mist-500">Só o super_admin inclui ou remove feriados.</p>}
      {years.map((y) => {
        const list = rows.filter((r) => String(r.day).startsWith(y));
        return (
          <section key={y} aria-labelledby={`ano-${y}`} className="grid gap-2">
            <h2 id={`ano-${y}`} className="label-mono text-[0.62rem] text-mist-400">{y} · <span className="tabular">{list.length}</span></h2>
            <Table head={isAdmin ? ["Data", "Nome", "Tipo", "Ação"] : ["Data", "Nome", "Tipo"]}>
              {list.map((h) => (
                <tr key={h.day} className="hover:bg-white/[0.02]">
                  <Td mono className="text-xs">{day(h.day)} <span className="text-mist-500">{weekday(h.day)}</span></Td>
                  <Td>{h.label}</Td>
                  <Td className="text-xs text-mist-300">{HOLIDAY_KIND[h.kind] ?? h.kind}</Td>
                  {isAdmin && <Td className="text-right"><HolidayRemoveButton day={h.day} name={`${h.label} (${day(h.day)})`} /></Td>}
                </tr>
              ))}
            </Table>
          </section>
        );
      })}
      {!rows.length && <Card><p className="text-sm text-mist-400">Nenhum feriado cadastrado.</p></Card>}
    </div>
  );
}

// ── Índices ──────────────────────────────────────────────────────────────────

async function IndicesTab({ ctx }: { ctx: StaffContext }) {
  const d = await asUser(ctx.user, async (tx) => {
    const versions = await tx`
      select v.id, v.label, v.applies_to_years, v.race_date::text as race_date, v.min_age, v.source_url, v.source_title, v.consulted_at, v.notes,
             v.status, v.published_at, sd.display_name as published_by_name,
             (select count(*)::int from rtb.qualification_standards q where q.version_id = v.id) as total,
             (select count(*)::int from rtb.qualification_standards q where q.version_id = v.id and q.category = 'M') as m,
             (select count(*)::int from rtb.qualification_standards q where q.version_id = v.id and q.category = 'F') as f,
             (select count(*)::int from rtb.qualification_standards q where q.version_id = v.id and q.category = 'X') as x
      from rtb.standard_versions v left join rtb.staff_directory sd on sd.user_id = v.published_by
      order by (v.status = 'active') desc, v.created_at desc`;
    const standards = await tx`
      select category, age_min, age_max, standard_seconds from rtb.qualification_standards
      where version_id = rtb.active_standard_version() order by age_min, category`;
    return { versions, standards };
  });
  const groups = [...new Map(d.standards.map((s) => [s.age_min as number, s.age_max as number | null])).entries()].sort((a, b) => a[0] - b[0]);
  const cell = (cat: string, min: number) => d.standards.find((s) => s.category === cat && s.age_min === min)?.standard_seconds as number | undefined;
  const active = d.versions.find((v) => v.status === "active");
  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist-300">
        Índices oficiais da B.A.A., versionados. Tabela publicada não muda: mudança de índice é uma nova versão em rascunho, conferida na fonte.
        Publicar versão nova não é feito nesta tela.
      </p>
      <Table head={["Versão", "Vale para", "Dia da prova", "Faixas (M · F · X)", "Fonte", "Consultada em", "Status"]} empty={d.versions.length ? undefined : "Nenhuma versão cadastrada."}>
        {d.versions.map((v) => (
          <tr key={v.id} className="hover:bg-white/[0.02]">
            <Td>
              <p className="font-medium text-mist-50">{v.label}</p>
              {v.notes && <p className="mt-0.5 max-w-[24rem] text-xs leading-relaxed text-mist-500">{v.notes}</p>}
            </Td>
            <Td mono className="text-xs">{(v.applies_to_years as number[]).join(", ")}</Td>
            <Td mono className="text-xs">{day(v.race_date)}<p className="text-mist-500">idade mínima {v.min_age}</p></Td>
            <Td mono className="text-xs">{v.m} · {v.f} · {v.x}<p className="text-mist-500">{v.total} no total</p></Td>
            <Td className="max-w-[16rem] text-xs">
              <a href={v.source_url} target="_blank" rel="noopener noreferrer" className="text-volt hover:underline">{v.source_title}</a>
            </Td>
            <Td mono className="text-xs">{dt(v.consulted_at)}</Td>
            <Td>
              <Pill className={v.status === "active" ? "border-volt/50 text-volt" : undefined}>{VERSION_STATUS[v.status] ?? v.status}</Pill>
              {v.published_at && <p className="tabular mt-1 font-mono text-[0.65rem] text-mist-500">{dt(v.published_at)}{v.published_by_name ? ` · ${v.published_by_name}` : ""}</p>}
            </Td>
          </tr>
        ))}
      </Table>
      {active && groups.length > 0 && (
        <section aria-labelledby="tabela-ativa" className="grid gap-2">
          <h2 id="tabela-ativa" className="label-mono text-[0.62rem] text-mist-400">Tabela ativa · {active.label} · tempo líquido na maratona</h2>
          <Table head={["Faixa de idade", "Masculino", "Feminino", "Não binário"]}>
            {groups.map(([min, max]) => (
              <tr key={min} className="hover:bg-white/[0.02]">
                <Td mono className="text-xs text-mist-300">{max === null ? `${min}+` : `${min}–${max}`}</Td>
                {["M", "F", "X"].map((c) => {
                  const s = cell(c, min);
                  return <Td key={c} mono>{s ? formatDuration(s) : "—"}</Td>;
                })}
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}

// ── Papéis (só super_admin) ──────────────────────────────────────────────────

async function PapeisTab({ ctx }: { ctx: StaffContext }) {
  const d = await asUser(ctx.user, async (tx) => {
    const roles = await tx`
      select r.id, r.user_id, r.role, r.scope_polo, r.granted_at, r.revoked_at, r.note,
             sd.display_name, sd.title, gb.display_name as granted_by_name, rb.display_name as revoked_by_name, pa.name as partner_name
      from rtb.user_roles r
      left join rtb.staff_directory sd on sd.user_id = r.user_id
      left join rtb.staff_directory gb on gb.user_id = r.granted_by
      left join rtb.staff_directory rb on rb.user_id = r.revoked_by
      left join rtb.partners pa on pa.id = r.partner_id
      order by (r.revoked_at is null) desc, coalesce(r.revoked_at, r.granted_at) desc`;
    const partners = await tx`select id, name from rtb.partners where status <> 'ARCHIVED' order by name`;
    return { roles, partners };
  });
  const active = d.roles.filter((r) => !r.revoked_at).sort((a, b) => String(a.display_name ?? "~").localeCompare(String(b.display_name ?? "~"), "pt-BR"));
  const revoked = d.roles.filter((r) => r.revoked_at).slice(0, 30);
  return (
    <div className="grid gap-4">
      <Card title="Conceder papel">
        <GrantRoleForm partners={d.partners.map((p) => ({ id: p.id as string, name: p.name as string }))} />
      </Card>
      <section aria-labelledby="papeis-ativos" className="grid gap-2">
        <h2 id="papeis-ativos" className="label-mono text-[0.62rem] text-mist-400">Papéis ativos · <span className="tabular">{active.length}</span></h2>
        <Table head={["Pessoa", "Papel", "Escopo", "Concedido", "Observação", "Ação"]} empty={active.length ? undefined : "Nenhum papel ativo."}>
          {active.map((r) => {
            const person = (r.display_name as string | null) ?? `conta ${shortId(r.user_id)}`;
            const role = ROLE_LABEL[r.role] ?? r.role;
            return (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <Td>
                  <Who name={r.display_name} id={r.user_id} />
                  {r.title && <p className="text-xs text-mist-500">{r.title}</p>}
                  {r.user_id === ctx.user.id && <p className="label-mono mt-0.5 text-[0.56rem] text-volt">você</p>}
                </Td>
                <Td><Pill>{role}</Pill></Td>
                <Td className="text-xs">{r.partner_name ?? (r.scope_polo ? `polo ${r.scope_polo}` : <span className="text-mist-500">todos os polos</span>)}</Td>
                <Td className="text-xs">
                  <p className="tabular whitespace-nowrap font-mono text-mist-300">{dt(r.granted_at)}</p>
                  <p className="text-mist-500">{r.granted_by_name ?? "sistema"}</p>
                </Td>
                <Td className="max-w-[18rem] text-xs text-mist-400">{r.note ?? "—"}</Td>
                <Td className="text-right"><RevokeRoleButton roleId={r.id} person={person} role={role} /></Td>
              </tr>
            );
          })}
        </Table>
      </section>
      {revoked.length > 0 && (
        <section aria-labelledby="papeis-revogados" className="grid gap-2">
          <h2 id="papeis-revogados" className="label-mono text-[0.62rem] text-mist-400">Revogados · histórico recente</h2>
          <Table head={["Pessoa", "Papel", "Concedido", "Revogado", "Observação"]}>
            {revoked.map((r) => (
              <tr key={r.id} className="text-mist-400">
                <Td><Who name={r.display_name} id={r.user_id} /></Td>
                <Td className="text-xs">{ROLE_LABEL[r.role] ?? r.role}{r.partner_name ? ` · ${r.partner_name}` : r.scope_polo ? ` · polo ${r.scope_polo}` : ""}</Td>
                <Td mono className="text-xs">{dt(r.granted_at)}</Td>
                <Td mono className="text-xs">{dt(r.revoked_at)}<p className="font-sans text-mist-500">{r.revoked_by_name ?? ""}</p></Td>
                <Td className="max-w-[18rem] text-xs">{r.note ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}

// ── LGPD (só super_admin) ────────────────────────────────────────────────────

async function LgpdTab({ ctx }: { ctx: StaffContext }) {
  const rows = await asUser(ctx.user, (tx) => tx`
    select r.id, r.user_id, r.kind, r.details, r.status, r.response, r.handled_at, r.created_at, hb.display_name as handled_by_name,
           p.full_name, p.passport_number, (p.deleted_at is not null) as anonymized
    from rtb.data_requests r
    left join rtb.profiles p on p.user_id = r.user_id
    left join rtb.staff_directory hb on hb.user_id = r.handled_by
    order by (r.status in ('OPEN', 'IN_PROGRESS')) desc, r.created_at desc
    limit 200`);
  const open = rows.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length;
  const head = ["Pedido", "Atleta", "Detalhes", "Status", "Resposta", "Ação"];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-mist-300">
        Pedidos feitos pelos atletas no Passport. Cada atualização avisa o atleta e fica na auditoria. A anonimização só parte de um pedido de exclusão
        e pede confirmação. <span className="tabular font-mono text-mist-100">{open}</span> em aberto.
      </p>
      <Table head={head} empty={rows.length ? undefined : "Nenhum pedido de privacidade até agora."}>
        {rows.map((r) => {
          const [statusText, tone] = REQUEST_STATUS[r.status] ?? [r.status, ""];
          const athlete = r.anonymized ? "Atleta removido" : (r.full_name as string | null) ?? `conta ${shortId(r.user_id)}`;
          const canAnonymize = r.kind === "DELETION" && !r.anonymized && r.status !== "DONE" && r.status !== "REJECTED";
          return (
            <ExpandRow key={r.id} colSpan={head.length} label="Tratar" name={`${REQUEST_KIND[r.kind] ?? r.kind} · ${athlete}`}
              cells={<>
                <Td>
                  <p className="font-medium text-mist-50">{REQUEST_KIND[r.kind] ?? r.kind}</p>
                  <p className="tabular font-mono text-[0.7rem] text-mist-500">{dt(r.created_at)}</p>
                </Td>
                <Td>
                  <p className={r.anonymized ? "text-mist-400" : "text-mist-100"}>{athlete}</p>
                  {r.passport_number && !r.anonymized && <p className="tabular whitespace-nowrap font-mono text-[0.7rem] text-mist-500">{r.passport_number}</p>}
                </Td>
                <Td className="max-w-[18rem] text-xs text-mist-300">{r.details ?? "—"}</Td>
                <Td><Pill className={tone}>{statusText}</Pill></Td>
                <Td className="max-w-[18rem] text-xs">
                  <p className="text-mist-300">{r.response ?? "—"}</p>
                  {r.handled_at && <p className="tabular mt-0.5 font-mono text-[0.65rem] text-mist-500">{r.handled_by_name ?? "Equipe"} · {dt(r.handled_at)}</p>}
                </Td>
              </>}
              detail={
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <DataRequestForm id={r.id} status={r.status} response={r.response ?? ""} />
                  {canAnonymize && (
                    <div className="grid max-w-xs gap-2">
                      <p className="text-xs leading-relaxed text-mist-400">Pedido de exclusão: depois de conferir a identidade, anonimize os dados pessoais.</p>
                      <AnonymizeButton userId={r.user_id} requestId={r.id} athlete={athlete} />
                    </div>
                  )}
                </div>
              }
            />
          );
        })}
      </Table>
    </div>
  );
}
