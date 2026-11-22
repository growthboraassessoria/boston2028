import Link from "next/link";
import { clsx } from "clsx";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { day, TZ } from "@/lib/os/format";
import { Card, Kpi, OsTitle, Table, Td } from "@/components/os/ui";
import { FunnelChart, type ChartDatum } from "@/components/os/admin-forms";

export const metadata = { title: "Analytics" };

const DIMS = [
  ["campaign", "Campanha"], ["source", "Origem (utm_source)"], ["uf", "UF"], ["target_race", "Prova alvo"],
  ["membership", "Vínculo declarado"], ["polo", "Polo"],
] as const;
type Dim = (typeof DIMS)[number][0];
// [chave, rótulo, rótulo curto para o indicador]
const METRICS = [
  ["signups", "Cadastros", "Cadastros"], ["applications", "Candidaturas", "Candidaturas"], ["eligible", "Elegível preliminar", "Elegíveis"],
  ["almost", "Quase lá", "Quase lá"], ["approved", "Aprovados no Road", "Aprovados Road"], ["next_forwarded", "Indicados ao NEXT", "Indicados NEXT"],
  ["simulations", "Simulações", "Simulações"],
] as const;
type Metric = (typeof METRICS)[number][0];
const PRESETS = [7, 30, 90, 365];
const MEMBERSHIP: Record<string, string> = { NAO_INFORMADO: "Não informou", SIM_ATUAL: "Diz ser aluno", EX_ALUNO: "Diz ser ex-aluno", NAO: "Diz não ser aluno" };
const CHART_MAX = 12;
const DAY_MS = 86_400_000;

const isoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const validDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00-03:00`));
const nf = new Intl.NumberFormat("pt-BR");

type Row = { label: string } & Record<Metric, number>;

export default async function AnalyticsPage({ searchParams }: {
  searchParams: Promise<{ dias?: string; de?: string; ate?: string; dim?: string; metrica?: string }>;
}) {
  const ctx = await requireStaff("super_admin", "growth", "technical_director");
  const sp = await searchParams;
  const dim: Dim = DIMS.find(([k]) => k === sp.dim)?.[0] ?? "campaign";
  const metric: Metric = METRICS.find(([k]) => k === sp.metrica)?.[0] ?? "signups";
  const custom = validDay(sp.de) && validDay(sp.ate) && sp.de! <= sp.ate!;
  const days = PRESETS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const now = new Date();
  let from = custom ? new Date(`${sp.de}T00:00:00-03:00`) : new Date(now.getTime() - days * DAY_MS);
  const to = custom ? new Date(new Date(`${sp.ate}T00:00:00-03:00`).getTime() + DAY_MS - 1) : now;
  if (to.getTime() - from.getTime() > 3 * 366 * DAY_MS) from = new Date(to.getTime() - 3 * 366 * DAY_MS);

  const raw = await asUser(ctx.user, (tx) => tx`
    select * from rtb.os_funnel(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, ${dim}::text)`);
  const rows: Row[] = raw.map((r) => ({
    label: dim === "membership" ? MEMBERSHIP[r.label as string] ?? String(r.label) : String(r.label ?? "—"),
    ...(Object.fromEntries(METRICS.map(([k]) => [k, Number(r[k] ?? 0)])) as Record<Metric, number>),
  }));
  const total = Object.fromEntries(METRICS.map(([k]) => [k, rows.reduce((s, r) => s + r[k], 0)])) as Record<Metric, number>;
  const metricLabel = METRICS.find(([k]) => k === metric)![1];
  const dimLabel = DIMS.find(([k]) => k === dim)![1];

  const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.label.localeCompare(b.label, "pt-BR"));
  const chart: ChartDatum[] = sorted.slice(0, CHART_MAX).map((r) => ({ label: r.label, value: r[metric] }));
  if (sorted.length > CHART_MAX) chart.push({ label: `Outros (${sorted.length - CHART_MAX})`, value: sorted.slice(CHART_MAX).reduce((s, r) => s + r[metric], 0) });

  const base = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ dim, metrica: metric, ...extra });
    return `/os/analytics?${u.toString()}`;
  };
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100 [color-scheme:dark]";
  const period = custom ? `${day(sp.de!)} a ${day(sp.ate!)}` : `últimos ${days} dias`;

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Observado · sem estimativa" title="Analytics">
        Funil das pessoas que se cadastraram no período, por {dimLabel.toLowerCase()}. Tudo aqui é contagem observada no banco:
        sem projeção, sem estimativa e sem receita.
      </OsTitle>

      <div className="flex flex-wrap items-end gap-2">
        <nav aria-label="Período" className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Link key={p} href={base({ dias: String(p) })} aria-current={!custom && p === days ? "page" : undefined}
              className={clsx("label-mono inline-flex min-h-10 items-center rounded-[3px] border px-2.5 text-[0.62rem]",
                !custom && p === days ? "border-volt text-volt" : "border-white/10 text-mist-400 hover:text-mist-100")}>{p} dias</Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2" action="/os/analytics">
          {!custom && <input type="hidden" name="dias" value={days} />}
          <label className="grid gap-1 text-xs text-mist-400">De<input type="date" name="de" defaultValue={custom ? sp.de : ""} className={sel} /></label>
          <label className="grid gap-1 text-xs text-mist-400">Até<input type="date" name="ate" defaultValue={custom ? sp.ate : ""} max={isoDay(now)} className={sel} /></label>
          <label className="grid gap-1 text-xs text-mist-400">Agrupar por
            <select name="dim" defaultValue={dim} className={sel}>{DIMS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs text-mist-400">Gráfico
            <select name="metrica" defaultValue={metric} className={sel}>{METRICS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Aplicar</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {METRICS.map(([k, , kpi]) => <Kpi key={k} label={kpi} value={nf.format(total[k])} hint="observado" tone={k === metric ? "signal" : undefined} />)}
      </div>

      <Card title={`${metricLabel} por ${dimLabel.toLowerCase()} · observado · ${period}`}>
        <FunnelChart data={chart} metric={metricLabel} />
        <p className="mt-3 text-xs leading-relaxed text-mist-500">
          {dim === "campaign" || dim === "source" ? "Campanha e origem vêm do primeiro toque registrado (UTM); sem UTM aparece “(direto)”. " : ""}
          Aprovados no Road e indicados ao NEXT são decisões técnicas diferentes, cada uma com o seu caminho. Simulações contam só as ligadas a uma conta.
        </p>
      </Card>

      <section aria-labelledby="tabela-funil" className="grid gap-2">
        <h2 id="tabela-funil" className="label-mono text-[0.62rem] text-mist-400">Tabela · observado · {period}</h2>
        <Table head={[dimLabel, ...METRICS.map(([, v]) => v)]} empty={rows.length ? undefined : "Ninguém se cadastrou no período."}>
          {sorted.map((r) => (
            <tr key={r.label} className="hover:bg-white/[0.02]">
              <Td className="font-medium text-mist-50">{r.label}</Td>
              {METRICS.map(([k]) => <Td key={k} mono className={k === metric ? "font-semibold text-mist-50" : "text-mist-300"}>{nf.format(r[k])}</Td>)}
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="bg-white/[0.03]">
              <Td className="label-mono text-[0.6rem] text-mist-400">Total</Td>
              {METRICS.map(([k]) => <Td key={k} mono className="text-mist-50">{nf.format(total[k])}</Td>)}
            </tr>
          )}
        </Table>
      </section>
    </div>
  );
}
