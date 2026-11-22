import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { day, dt } from "@/lib/os/format";
import { OsTitle, Table, Td } from "@/components/os/ui";

export const metadata = { title: "Auditoria" };

const PAGE = 50;
const DAY_MS = 86_400_000;

// Nada de dado pessoal na tela: chaves sensíveis somem e e-mail/telefone/CPF dentro de textos são mascarados.
const HIDDEN_KEY = /^(email|to_email|contact_email|phone|phone_e164|contact_phone|whatsapp|full_name|preferred_name|birth_date|cep|cpf|address|ip|ip_hash|passport_token|qr_token|token|code|codes|code_hash|secret|password)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+\d{8,15}\b/g;
const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${dot > 0 ? domain.slice(dot) : ""}`;
}

function scrub(v: unknown, depth = 0): unknown {
  if (depth > 8) return "…";
  if (typeof v === "string") return v.replace(EMAIL, maskEmail).replace(PHONE, "+•••").replace(CPF, "•••.•••.•••-••");
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, HIDDEN_KEY.test(k) ? "[oculto]" : scrub(x, depth + 1)]));
  }
  return v;
}

const validDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00-03:00`));
// Fim do id (os ids de demonstração começam todos com 00000000).
const short = (id: string | null) => (id ? String(id).slice(-8) : "—");

export default async function AuditoriaPage({ searchParams }: {
  searchParams: Promise<{ entidade?: string; acao?: string; de?: string; ate?: string; pagina?: string }>;
}) {
  const ctx = await requireStaff("super_admin");
  const sp = await searchParams;
  const entity = /^[a-z0-9_.]{2,80}$/.test(sp.entidade ?? "") ? sp.entidade! : "";
  const action = /^[a-z0-9_.]{3,80}$/.test(sp.acao ?? "") ? sp.acao! : "";
  const de = validDay(sp.de) ? sp.de! : "";
  const ate = validDay(sp.ate) ? sp.ate! : "";
  const from = de ? new Date(`${de}T00:00:00-03:00`).toISOString() : null;
  const to = ate ? new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + DAY_MS).toISOString() : null;
  const page = Math.min(10000, Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1));

  const d = await asUser(ctx.user, async (tx) => {
    const options = await tx`select entity, action, count(*)::int as n from rtb.audit_logs group by entity, action order by entity, action`;
    const [{ total } = { total: 0 }] = await tx`
      select count(*)::int as total from rtb.audit_logs l
      where (${entity}::text = '' or l.entity = ${entity}::text)
        and (${action}::text = '' or l.action = ${action}::text)
        and (${from}::timestamptz is null or l.created_at >= ${from}::timestamptz)
        and (${to}::timestamptz is null or l.created_at < ${to}::timestamptz)`;
    const rows = await tx`
      select l.id, l.actor_id, l.action, l.entity, l.entity_id, l.data, l.created_at, sd.display_name as actor_name,
             exists (select 1 from rtb.user_roles ur where ur.user_id = l.actor_id) as actor_is_staff
      from rtb.audit_logs l
      left join rtb.staff_directory sd on sd.user_id = l.actor_id
      where (${entity}::text = '' or l.entity = ${entity}::text)
        and (${action}::text = '' or l.action = ${action}::text)
        and (${from}::timestamptz is null or l.created_at >= ${from}::timestamptz)
        and (${to}::timestamptz is null or l.created_at < ${to}::timestamptz)
      order by l.created_at desc, l.id desc
      limit ${PAGE} offset ${(page - 1) * PAGE}`;
    return { options, total: Number(total), rows };
  });

  const entities = [...new Set(d.options.map((o) => o.entity as string))];
  const actions = [...new Set(d.options.filter((o) => !entity || o.entity === entity).map((o) => o.action as string))].sort();
  const pages = Math.max(1, Math.ceil(d.total / PAGE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (entity) u.set("entidade", entity);
    if (action) u.set("acao", action);
    if (de) u.set("de", de);
    if (ate) u.set("ate", ate);
    if (p > 1) u.set("pagina", String(p));
    const s = u.toString();
    return `/os/auditoria${s ? `?${s}` : ""}`;
  };
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100 [color-scheme:dark]";
  const first = d.total ? (page - 1) * PAGE + 1 : 0;
  const last = Math.min(d.total, page * PAGE);

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Somente super_admin" title="Auditoria">
        Registro imutável de cada mudança feita no OS e no Passport. Ninguém edita nem apaga estas linhas.
        Dados pessoais não aparecem aqui: pessoas surgem só pelo nome da equipe ou por um código curto.
      </OsTitle>

      <form className="flex flex-wrap items-end gap-2" action="/os/auditoria">
        <label className="grid gap-1 text-xs text-mist-400">Entidade
          <select name="entidade" defaultValue={entity} className={sel}>
            <option value="">Todas</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-mist-400">Ação
          <select name="acao" defaultValue={action} className={sel}>
            <option value="">Todas</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-mist-400">De<input type="date" name="de" defaultValue={de} className={sel} /></label>
        <label className="grid gap-1 text-xs text-mist-400">Até<input type="date" name="ate" defaultValue={ate} className={sel} /></label>
        <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Filtrar</button>
        {(entity || action || de || ate) && <Link href="/os/auditoria" className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
      </form>

      <p className="tabular font-mono text-xs text-mist-500" aria-live="polite">
        {d.total ? `${first}–${last} de ${d.total}` : "0 registros"}{de || ate ? ` · ${de ? day(de) : "início"} a ${ate ? day(ate) : "hoje"}` : ""}
      </p>

      <Table head={["Quando", "Quem", "Ação", "Entidade", "ID", "Dados"]} empty={d.rows.length ? undefined : "Nenhum registro com esses filtros."}>
        {d.rows.map((r) => {
          const json = JSON.stringify(scrub(r.data ?? {}));
          const who = r.actor_name ?? (r.actor_id ? (r.actor_is_staff ? `equipe · ${short(r.actor_id)}` : `atleta · ${short(r.actor_id)}`) : "sistema");
          return (
            <tr key={r.id} className="hover:bg-white/[0.02]">
              <Td mono className="whitespace-nowrap text-xs text-mist-300">{dt(r.created_at)}</Td>
              <Td className="whitespace-nowrap text-xs">{r.actor_name ? <span className="text-mist-100">{who}</span> : <span className="tabular font-mono text-mist-400">{who}</span>}</Td>
              <Td mono className="text-xs text-mist-50">{r.action}</Td>
              <Td mono className="text-xs text-mist-300">{r.entity}</Td>
              <Td mono className="text-xs text-mist-500"><span title={r.entity_id ?? undefined}>{short(r.entity_id)}</span></Td>
              <Td className="min-w-[16rem]">
                {json.length <= 220 ? (
                  <code className="block max-w-[34rem] break-all font-mono text-[0.7rem] leading-relaxed text-mist-300">{json}</code>
                ) : (
                  <details className="max-w-[34rem]">
                    <summary className="cursor-pointer break-all font-mono text-[0.7rem] leading-relaxed text-mist-300">{json.slice(0, 200)}… <span className="font-sans text-volt">ver tudo</span></summary>
                    <code className="mt-1 block break-all font-mono text-[0.7rem] leading-relaxed text-mist-300">{json}</code>
                  </details>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>

      {pages > 1 && (
        <nav aria-label="Páginas da auditoria" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="min-h-10 rounded-[3px] border border-white/15 px-3 py-2 text-mist-100 hover:border-volt">← Anterior</Link> : <span />}
          <span className="tabular font-mono text-xs text-mist-500">Página {page} de {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="min-h-10 rounded-[3px] border border-white/15 px-3 py-2 text-mist-100 hover:border-volt">Próxima →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
