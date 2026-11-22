import Link from "next/link";
import { requireStaff, hasRole } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { emailConfigured } from "@/lib/email/outbox";
import { Card, Kpi, OsTitle, PendingIntegration } from "@/components/os/ui";

export const metadata = { title: "Visão geral" };

export default async function OsHome({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.dias ?? 30) || 30));
  const canMetrics = hasRole(ctx, "super_admin", "growth", "technical_director", "commercial");
  const data = await asUser(ctx.user, async (tx) => {
    const overview = canMetrics ? (await tx`select rtb.os_overview(now() - make_interval(days => ${days}), now()) as o`)[0]!.o : null;
    const notes = await tx`select title, body, action_url, created_at from rtb.notifications where user_id = ${ctx.user.id} and read_at is null order by created_at desc limit 8`;
    const flags = await tx`select key, enabled from rtb.feature_flags`;
    return { overview, notes, flags };
  });
  const o = data.overview as Record<string, unknown> | null;
  const n = (k: string) => Number((o?.[k] as number | undefined) ?? 0);
  const obj = (k: string) => (o?.[k] ?? {}) as Record<string, number>;
  const running = data.flags.find((f) => f.key === "running_integration")?.enabled;

  return (
    <div className="grid gap-6">
      <OsTitle kicker="BORA OS · Road to Boston 2028" title="Visão geral"
        actions={[7, 30, 90].map((d) => (
          <Link key={d} href={`/os?dias=${d}`} className={`label-mono rounded-[3px] border px-2.5 py-1.5 text-[0.62rem] ${d === days ? "border-volt text-volt" : "border-white/10 text-mist-400"}`}>{d} dias</Link>
        ))}>
        Números observados no banco (sem estimativa). Receita só aparece com dado financeiro real conectado.
      </OsTitle>
      <div className="grid gap-2">
        {!emailConfigured() && <PendingIntegration>E-mail: integração pendente (RESEND_API_KEY). Mensagens ficam na fila e nada é marcado como enviado.</PendingIntegration>}
        {!running && <PendingIntegration>Running: sem integração (adaptador desligado). Vínculo é verificado manualmente em “Vínculo BORA”.</PendingIntegration>}
      </div>
      {o ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Kpi label="Visitantes (consentidos)" value={n("visitors_consented")} hint="analytics opt-in" />
            <Kpi label="Simulações" value={n("simulations")} />
            <Kpi label="Cadastros" value={n("signups")} />
            <Kpi label="Candidaturas" value={n("applications")} />
            <Kpi label="SLA pendente" value={n("sla_pending")} hint="Quase lá sem contato" tone={n("sla_pending") ? "signal" : undefined} />
            <Kpi label="SLA vencido" value={n("sla_overdue")} tone={n("sla_overdue") ? "alert" : undefined} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Kpi label="Elegível preliminar" value={obj("by_prelim").ELIGIBLE ?? 0} />
            <Kpi label="Quase lá" value={obj("by_prelim").ALMOST ?? 0} />
            <Kpi label="Agora não" value={obj("by_prelim").NOT_NOW ?? 0} />
            <Kpi label="Aprovados técnicos" value={n("tech_approved")} />
            <Kpi label="NEXT recomendados" value={n("next_forwarded")} />
            <Kpi label="Matrículas verificadas" value={n("new_enrollments_verified")} hint="no período" />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Jornadas ativas">
              <p className="tabular font-mono text-sm">Road to Boston: {obj("journeys_active").ROAD_TO_BOSTON ?? 0}</p>
              <p className="tabular mt-1 font-mono text-sm">BORA NEXT: {obj("journeys_active").BORA_NEXT ?? 0}</p>
              <p className="tabular mt-1 font-mono text-sm text-mist-400">Alunos ativos confirmados: {n("members_engaged")}</p>
            </Card>
            <Card title="Comercial">
              {Object.entries(obj("commercial")).map(([k, v]) => <p key={k} className="tabular font-mono text-sm">{k}: {v}</p>)}
              {!Object.keys(obj("commercial")).length && <p className="text-sm text-mist-400">Nenhuma oportunidade ainda.</p>}
              <p className="mt-2 text-xs text-mist-500">{String(o.revenue_note ?? "")}</p>
            </Card>
            <Card title="Benefícios">
              <p className="tabular font-mono text-sm">Visualizações: {n("benefit_views")}</p>
              {Object.entries(obj("redemptions")).map(([k, v]) => <p key={k} className="tabular mt-1 font-mono text-sm">{k}: {v}</p>)}
            </Card>
          </div>
        </>
      ) : <Card><p className="text-sm text-mist-300">Seu papel vê as filas de trabalho no menu ao lado.</p></Card>}
      <Card title="Alertas para você">
        {data.notes.length ? (
          <ul className="divide-y divide-white/5">
            {data.notes.map((x, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                {x.action_url ? <Link href={x.action_url} className="text-mist-100 hover:text-volt">{x.title}{x.body ? ` · ${x.body}` : ""}</Link> : <span>{x.title}</span>}
                <span className="tabular shrink-0 font-mono text-xs text-mist-500">{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(x.created_at))}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mist-400">Nenhum alerta pendente.</p>}
      </Card>
    </div>
  );
}
