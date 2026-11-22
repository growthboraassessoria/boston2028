import Link from "next/link";
import { clsx } from "clsx";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { emailConfigured } from "@/lib/email/outbox";
import { dt } from "@/lib/os/format";
import { Card, Kpi, OsTitle, PendingIntegration, Pill, Table, Td } from "@/components/os/ui";
import { ExpandRow, ProcessOutboxButton, TemplateForm } from "@/components/os/admin-forms";

export const metadata = { title: "Comunicações" };

const KIND: Record<string, string> = { transactional: "Transacional", automation: "Automação", marketing: "Marketing" };
const OUT_STATUS: Record<string, string> = {
  queued: "Na fila", sending: "Enviando", accepted: "Aceito pelo provedor", delivered: "Entregue", bounced: "Devolvido",
  failed: "Falhou", suppressed: "Suprimido", cancelled: "Cancelado",
};
const OUT_TONE: Record<string, string> = {
  queued: "border-warn/50 text-warn", delivered: "border-volt/50 text-volt", failed: "border-danger/60 text-danger", bounced: "border-danger/60 text-danger",
};
const PAGE = 50;
const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** a***@d***.com */
function mask(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${dot > 0 ? domain.slice(dot) : ""}`;
}
/** Mascara qualquer e-mail que apareça num texto (ex.: mensagem de erro do provedor). */
const maskEmails = (s: string) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, mask);

export default async function ComunicacoesPage({ searchParams }: { searchParams: Promise<{ status?: string; modelo?: string; pagina?: string }> }) {
  const ctx = await requireStaff("super_admin", "growth");
  const sp = await searchParams;
  const status = sp.status && sp.status in OUT_STATUS ? sp.status : "";
  const modelo = /^[a-z0-9_]{3,60}$/.test(sp.modelo ?? "") ? sp.modelo! : "";
  const page = Math.min(1000, Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1));
  const isAdmin = hasRole(ctx, "super_admin");
  const configured = emailConfigured();

  const d = await asUser(ctx.user, async (tx) => {
    const templates = await tx`
      select t.key, t.kind, t.subject, t.preheader, t.body, t.cta_label, t.cta_path, t.active, t.updated_at, sd.display_name as updated_by_name
      from rtb.message_templates t left join rtb.staff_directory sd on sd.user_id = t.updated_by
      order by t.key`;
    const used = await tx`
      select o.template_key, array_agg(distinct k.key) as keys
      from rtb.email_outbox o,
           jsonb_object_keys(case when jsonb_typeof(o.variables) = 'object' then o.variables else '{}'::jsonb end) as k(key)
      group by o.template_key`;
    const counts = await tx`select status, count(*)::int as n from rtb.email_outbox group by status`;
    const [{ total } = { total: 0 }] = await tx`
      select count(*)::int as total from rtb.email_outbox o
      where (${status}::text = '' or o.status = ${status}::text) and (${modelo}::text = '' or o.template_key = ${modelo}::text)`;
    // O e-mail é mascarado já no banco: o endereço completo não chega nem ao servidor da página.
    const outbox = await tx`
      select o.id, o.template_key, o.status, o.attempts, o.last_error, o.created_at, o.next_attempt_at, o.accepted_at, o.delivered_at,
             left(split_part(o.to_email::text, '@', 1), 1) || '***@' || left(split_part(o.to_email::text, '@', 2), 1) || '***'
               || coalesce(substring(split_part(o.to_email::text, '@', 2) from '[.][^.]+$'), '') as to_masked
      from rtb.email_outbox o
      where (${status}::text = '' or o.status = ${status}::text) and (${modelo}::text = '' or o.template_key = ${modelo}::text)
      order by o.created_at desc
      limit ${PAGE} offset ${(page - 1) * PAGE}`;
    return { templates, used, counts, total: Number(total), outbox };
  });

  const n = (s: string) => d.counts.find((c) => c.status === s)?.n ?? 0;
  const usedBy = new Map(d.used.map((u) => [u.template_key as string, (u.keys as string[]) ?? []]));
  const pages = Math.max(1, Math.ceil(d.total / PAGE));
  const link = (p: { status?: string; modelo?: string; pagina?: number }) => {
    const u = new URLSearchParams();
    const s = p.status ?? status;
    const m = p.modelo ?? modelo;
    if (s) u.set("status", s);
    if (m) u.set("modelo", m);
    if (p.pagina && p.pagina > 1) u.set("pagina", String(p.pagina));
    const str = u.toString();
    return `/os/comunicacoes${str ? `?${str}` : ""}#fila`;
  };
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100";
  const head = ["Modelo", "Tipo", "Status", "Atualizado", "Ação"];

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Growth · comunicação" title="Comunicações">
        Modelos de e-mail e histórico da fila. “Aceito” quer dizer que o provedor recebeu a mensagem; “entregue” só aparece com a confirmação do provedor.
      </OsTitle>

      {!configured && (
        <PendingIntegration>
          E-mail: integração pendente (RESEND_API_KEY e RESEND_FROM_EMAIL). As mensagens ficam “Na fila” e nada é marcado como enviado.
        </PendingIntegration>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Na fila" value={n("queued") + n("sending")} hint="aguardando envio" />
        <Kpi label="Aceitos" value={n("accepted")} hint="provedor recebeu" />
        <Kpi label="Entregues" value={n("delivered")} hint="com confirmação" tone={n("delivered") ? "signal" : undefined} />
        <Kpi label="Falhas" value={n("failed") + n("bounced")} hint="falhou ou devolvido" tone={n("failed") + n("bounced") ? "alert" : undefined} />
        <Kpi label="Não enviados" value={n("suppressed") + n("cancelled")} hint="suprimidos ou cancelados" />
      </div>

      <Card title="Processar a fila">
        <div className="grid gap-3">
          <p className="max-w-3xl text-sm leading-relaxed text-mist-300">
            A rotina automática envia a fila sozinha. Use o botão para tentar agora (lote de 20). Falhas voltam para a fila com espera crescente;
            depois de 5 tentativas a mensagem fica como “Falhou”.
            {!configured && <span className="text-warn"> Sem a integração configurada, nada é enviado.</span>}
          </p>
          {isAdmin ? <ProcessOutboxButton /> : <p className="text-sm text-mist-500">Só o admin processa a fila manualmente.</p>}
        </div>
      </Card>

      <section aria-labelledby="modelos" className="grid gap-2">
        <h2 id="modelos" className="label-mono text-[0.62rem] text-mist-400">Modelos de e-mail · <span className="tabular">{d.templates.length}</span></h2>
        <Table head={head} empty={d.templates.length ? undefined : "Nenhum modelo cadastrado."}>
          {d.templates.map((t) => {
            const vars = new Set<string>(usedBy.get(t.key) ?? []);
            for (const m of `${t.subject} ${t.preheader ?? ""} ${t.body}`.matchAll(VAR_RE)) vars.add(m[1]!);
            return (
              <ExpandRow key={t.key} colSpan={head.length} label="Editar" name={t.key}
                cells={<>
                  <Td>
                    <p className="tabular font-mono text-xs text-mist-400">{t.key}</p>
                    <p className="font-medium text-mist-50">{t.subject}</p>
                    {t.preheader && <p className="max-w-[28rem] text-xs text-mist-500">{t.preheader}</p>}
                  </Td>
                  <Td className="text-xs">{KIND[t.kind] ?? t.kind}</Td>
                  <Td>{t.active ? <Pill className="border-volt/50 text-volt">Ativo</Pill> : <Pill className="text-mist-500">Inativo</Pill>}</Td>
                  <Td className="text-xs">
                    <p className="tabular font-mono text-mist-300">{dt(t.updated_at)}</p>
                    {t.updated_by_name && <p className="text-mist-500">{t.updated_by_name}</p>}
                  </Td>
                </>}
                detail={
                  <TemplateForm variables={[...vars].sort()} initial={{
                    key: t.key, subject: t.subject, preheader: t.preheader ?? "", body: String(t.body).replace(/\\n/g, "\n"),
                    ctaLabel: t.cta_label ?? "", ctaPath: t.cta_path ?? "", active: !!t.active,
                  }} />
                }
              />
            );
          })}
        </Table>
      </section>

      <section id="fila" aria-labelledby="historico" className="grid scroll-mt-20 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="historico" className="label-mono text-[0.62rem] text-mist-400">Histórico da fila · <span className="tabular">{d.total}</span></h2>
          <form className="flex flex-wrap gap-2" action="/os/comunicacoes">
            <select name="status" defaultValue={status} aria-label="Status do envio" className={sel}>
              <option value="">Todos os status</option>
              {Object.entries(OUT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="modelo" defaultValue={modelo} aria-label="Modelo" className={sel}>
              <option value="">Todos os modelos</option>
              {d.templates.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
            </select>
            <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Filtrar</button>
            {(status || modelo) && <Link href="/os/comunicacoes#fila" className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
          </form>
        </div>
        <Table head={["Criado", "Para", "Modelo", "Status", "Tentativas", "Último erro", "Aceito · entregue"]}
          empty={d.outbox.length ? undefined : "Nenhum e-mail com esses filtros."}>
          {d.outbox.map((o) => (
            <tr key={o.id} className="hover:bg-white/[0.02]">
              <Td mono className="text-xs text-mist-300">{dt(o.created_at)}</Td>
              <Td mono className="text-xs">{o.to_masked}</Td>
              <Td mono className="text-xs text-mist-300">{o.template_key}</Td>
              <Td><Pill className={OUT_TONE[o.status]}>{OUT_STATUS[o.status] ?? o.status}</Pill>
                {o.status === "queued" && o.attempts > 0 && <p className="tabular mt-1 font-mono text-[0.65rem] text-mist-500">nova tentativa {dt(o.next_attempt_at)}</p>}</Td>
              <Td mono className="text-xs">{o.attempts}</Td>
              <Td className={clsx("max-w-[18rem] break-words text-xs", o.last_error ? "text-mist-300" : "text-mist-500")}>{o.last_error ? maskEmails(String(o.last_error)) : "—"}</Td>
              <Td mono className="text-xs text-mist-400">{o.accepted_at ? dt(o.accepted_at) : "—"} · {o.delivered_at ? dt(o.delivered_at) : "—"}</Td>
            </tr>
          ))}
        </Table>
        {pages > 1 && (
          <nav aria-label="Páginas do histórico" className="flex items-center justify-between gap-3 text-sm">
            {page > 1 ? <Link href={link({ pagina: page - 1 })} className="min-h-10 rounded-[3px] border border-white/15 px-3 py-2 text-mist-100 hover:border-volt">← Anterior</Link> : <span />}
            <span className="tabular font-mono text-xs text-mist-500">Página {page} de {pages}</span>
            {page < pages ? <Link href={link({ pagina: page + 1 })} className="min-h-10 rounded-[3px] border border-white/15 px-3 py-2 text-mist-100 hover:border-volt">Próxima →</Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
