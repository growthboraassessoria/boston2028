import Link from "next/link";
import { clsx } from "clsx";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { formatDuration } from "@/lib/domain/time";
import { signedUrl } from "@/lib/storage";
import { day, dt } from "@/lib/os/format";
import { Card, OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";
import { TestReviewForm } from "@/components/os/admin-forms";

export const metadata = { title: "Testes" };

const TEST_STATUS: Record<string, string> = { planned: "Planejado", open: "Aberto para envio", closed: "Encerrado", cancelled: "Cancelado" };
const RESULT_STATUS: Record<string, string> = { SUBMITTED: "Aguardando validação", VALIDATED: "Validado", REJECTED: "Não validado" };
const RESULT_TONE: Record<string, string> = { SUBMITTED: "border-warn/50 text-warn", VALIDATED: "border-volt/50 text-volt", REJECTED: "border-white/15 text-mist-400" };
const LEVEL: Record<string, string> = { BOSTON_SEGURO: "Boston seguro", INDICE: "No índice", NA_ROTA: "Na rota", EM_PREPARACAO: "Em preparação" };
const SOURCE: Record<string, string> = { self_reported: "enviado pelo atleta", coach_recorded: "registrado pelo treinador", chip_timing: "cronometragem por chip" };
const FILTERS = [["todos", "Todos"], ["SUBMITTED", "Aguardando validação"], ["VALIDATED", "Validados"], ["REJECTED", "Não validados"]] as const;
type Filter = (typeof FILTERS)[number][0];

const num = (v: unknown, digits = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function pct(v: unknown) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n))}%`;
}
function km(m: number | null) {
  if (!m) return "—";
  if (m === 42195) return "42,195 km";
  if (m === 21097) return "21,1 km";
  return `${(m / 1000).toLocaleString("pt-BR")} km`;
}
function month(iso: string) {
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function TestesPage({ searchParams }: { searchParams: Promise<{ teste?: string; status?: string }> }) {
  const ctx = await requireStaff("super_admin", "technical_director", "coach");
  const sp = await searchParams;
  const teste = /^[a-z0-9-]{2,40}$/.test(sp.teste ?? "") ? sp.teste! : "";
  const status: Filter = FILTERS.find(([k]) => k === sp.status)?.[0] ?? "todos";
  const canValidate = hasRole(ctx, "technical_director", "coach");

  const d = await asUser(ctx.user, async (tx) => {
    const tests = await tx`
      select t.id, t.slug, t.name, t.distance_m, t.planned_month::text as planned_month, t.test_date::text as test_date, t.date_confirmed,
             t.format_note, t.badge_slug, t.status,
             (select count(*)::int from rtb.test_results r where r.test_id = t.id) as results,
             (select count(*)::int from rtb.test_results r where r.test_id = t.id and r.status = 'SUBMITTED') as pending
      from rtb.tests t
      where t.cycle_id = rtb.current_cycle_id()
      order by t.planned_month, t.name`;
    const results = await tx`
      select r.id, r.user_id, r.seconds, r.source, r.status, r.validated_at, r.review_note, r.equivalent_marathon_seconds,
             r.reference_seconds, r.normalized_pct, r.level, r.formula_version, r.created_at, doc.storage_path as evidence_path,
             p.full_name, p.passport_number, t.name as test_name, t.distance_m, sd.display_name as validated_by_name,
             (select a.id from rtb.applications a where a.user_id = r.user_id and a.status <> 'DRAFT' order by a.created_at desc limit 1) as application_id
      from rtb.test_results r
      join rtb.tests t on t.id = r.test_id
      join rtb.profiles p on p.user_id = r.user_id
      left join rtb.application_documents doc on doc.id = r.evidence_document_id and doc.deleted_at is null
      left join rtb.staff_directory sd on sd.user_id = r.validated_by
      where t.cycle_id = rtb.current_cycle_id()
        and (${teste}::text = '' or t.slug = ${teste}::text)
        and (${status}::text = 'todos' or r.status = ${status}::text)
      order by (r.status = 'SUBMITTED') desc, t.planned_month, r.created_at
      limit 500`;
    const [ranking] = await tx`select value, status, updated_at from rtb.program_settings where key = 'ranking'`;
    const [cycle] = await tx`select name from rtb.program_cycles where id = rtb.current_cycle_id()`;
    return { tests, results, ranking, cycle };
  });

  const evidence = new Map<string, string | null>(
    await Promise.all(d.results.filter((r) => r.evidence_path).map(async (r) => [r.id as string, await signedUrl(r.evidence_path as string)] as const)),
  );
  const rule = (d.ranking?.value ?? {}) as Record<string, unknown>;
  const k = Number(rule.riegel_exponent ?? 1.06);
  const safe = Number(rule.safe_margin_pct ?? 3);
  const route = Number(rule.on_route_pct ?? 3);
  const approved = d.ranking?.status === "approved";
  const selectedTest = d.tests.find((t) => t.slug === teste);
  const link = (p: { teste?: string; status?: Filter }) => {
    const u = new URLSearchParams();
    const t = p.teste ?? teste;
    const s = p.status ?? status;
    if (t) u.set("teste", t);
    if (s !== "todos") u.set("status", s);
    const str = u.toString();
    return `/os/testes${str ? `?${str}` : ""}`;
  };

  return (
    <div className="grid gap-5">
      <OsTitle kicker={d.cycle?.name ?? "Ciclo atual"} title="Testes do ciclo">
        O atleta envia o tempo; a coordenação técnica ou o treinador atribuído valida. Nível e % normalizado só aparecem depois da validação.
      </OsTitle>

      <Card title="Fórmula do nível" actions={<Pill className={approved ? "border-volt/50 text-volt" : "border-warn/50 text-warn"}>{approved ? "Aprovada" : "Pendente de aprovação do Lucas"}</Pill>}>
        <div className="grid gap-3 text-sm leading-relaxed text-mist-200 lg:grid-cols-2">
          <p>
            Equivalente na maratona pela fórmula de Riegel: <span className="tabular font-mono text-mist-50">tempo × (42,195 ÷ distância)<sup>k</sup></span>,
            com <span className="tabular font-mono text-mist-50">k = {num(k)}</span>. O % normalizado compara esse equivalente com o índice da categoria e da idade
            no dia da prova (negativo = mais rápido que o índice).
          </p>
          <ul className="tabular grid gap-1 font-mono text-[0.8rem] text-mist-300">
            <li>Boston seguro · −{num(safe)}% ou menos</li>
            <li>No índice · acima de −{num(safe)}% até 0%</li>
            <li>Na rota · acima de 0% até +{num(route)}%</li>
            <li>Em preparação · acima de +{num(route)}%</li>
          </ul>
        </div>
        {!approved && (
          <p className="mt-3 text-xs text-mist-400">
            O expoente de Riegel e as fronteiras dos níveis estão <strong className="text-warn">pendentes de aprovação do Lucas</strong> (regra “ranking” com status “{d.ranking?.status ?? "pending"}”).
            Os números servem só para acompanhamento interno; nada vai para o ranking público.
          </p>
        )}
      </Card>

      <Table head={["Teste", "Distância", "Mês previsto", "Data", "Status", "Resultados", "Carimbo"]} empty={d.tests.length ? undefined : "Nenhum teste cadastrado no ciclo atual."}>
        {d.tests.map((t) => (
          <tr key={t.id} className={clsx("hover:bg-white/[0.02]", t.slug === teste && "bg-white/[0.03]")}>
            <Td>
              <Link href={link({ teste: t.slug === teste ? "" : t.slug })} aria-current={t.slug === teste ? "true" : undefined}
                className={clsx("font-medium underline-offset-4 hover:underline", t.slug === teste ? "text-volt" : "text-mist-50 hover:text-volt")}>{t.name}</Link>
              {t.format_note && <p className="max-w-[18rem] text-xs text-mist-500">{t.format_note}</p>}
            </Td>
            <Td mono className="text-xs">{km(t.distance_m)}</Td>
            <Td className="text-xs">{month(t.planned_month)}</Td>
            <Td mono className="text-xs">{t.test_date ? `${day(t.test_date)}${t.date_confirmed ? "" : " (a confirmar)"}` : <span className="text-mist-500">a confirmar</span>}</Td>
            <Td><Pill className={t.status === "open" ? "border-volt/50 text-volt" : undefined}>{TEST_STATUS[t.status] ?? t.status}</Pill></Td>
            <Td mono className="text-xs">{t.results}{t.pending ? <span className="text-warn"> · {t.pending} a validar</span> : null}</Td>
            <Td className="text-xs text-mist-400">{t.badge_slug ?? "—"}</Td>
          </tr>
        ))}
      </Table>

      <section aria-labelledby="resultados" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="resultados" className="label-mono text-[0.62rem] text-mist-400">
            Resultados{selectedTest ? ` · ${selectedTest.name}` : " · todos os testes"}
            {selectedTest && <Link href={link({ teste: "" })} className="ml-2 normal-case tracking-normal text-mist-500 hover:text-mist-100">(ver todos)</Link>}
          </h2>
          <nav aria-label="Status dos resultados" className="flex flex-wrap gap-1">
            {FILTERS.map(([kf, v]) => (
              <Link key={kf} href={link({ status: kf })} aria-current={status === kf ? "page" : undefined}
                className={clsx("label-mono rounded-[3px] border px-2.5 py-2 text-[0.6rem]", status === kf ? "border-volt text-volt" : "border-white/10 text-mist-400 hover:text-mist-100")}>{v}</Link>
            ))}
          </nav>
        </div>
        {!canValidate && <p className="text-xs text-mist-500">Validar é da coordenação técnica e do treinador atribuído. Seu papel acompanha.</p>}
        <Table head={["Atleta", "Teste", "Tempo", "Envio", "Status", "Nível", "% normalizado", "Equivalente → índice", canValidate ? "Validação" : "Revisão"]}
          empty={d.results.length ? undefined : "Nenhum resultado enviado com esses filtros. Os testes abrem para envio no mês previsto."}>
          {d.results.map((r) => {
            const url = evidence.get(r.id);
            const reviewed = r.status !== "SUBMITTED";
            return (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <Td>
                  {r.application_id ? <RowLink href={`/os/candidatos/${r.application_id}?aba=testes`}>{r.full_name}</RowLink> : <span className="font-medium text-mist-50">{r.full_name}</span>}
                  <p className="tabular whitespace-nowrap font-mono text-[0.7rem] text-mist-500">{r.passport_number}</p>
                </Td>
                <Td className="text-xs">{r.test_name}</Td>
                <Td mono>{formatDuration(r.seconds)}</Td>
                <Td className="text-xs">
                  <p className="text-mist-300">{SOURCE[r.source] ?? r.source}</p>
                  <p className="tabular font-mono text-[0.7rem] text-mist-500">{dt(r.created_at)}</p>
                  {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-volt hover:underline">Ver comprovante</a> : <span className="text-mist-500">sem comprovante</span>}
                </Td>
                <Td><Pill className={RESULT_TONE[r.status]}>{RESULT_STATUS[r.status] ?? r.status}</Pill></Td>
                <Td className="text-xs">{r.level ? <Pill className={["BOSTON_SEGURO", "INDICE"].includes(r.level) ? "border-volt/50 text-volt" : undefined}>{LEVEL[r.level] ?? r.level}</Pill> : <span className="text-mist-500">—</span>}</Td>
                <Td mono className="text-xs">{pct(r.normalized_pct) ?? <span className="text-mist-500">—</span>}</Td>
                <Td mono className="text-xs text-mist-300">
                  {r.equivalent_marathon_seconds ? `${formatDuration(r.equivalent_marathon_seconds)} → ${r.reference_seconds ? formatDuration(r.reference_seconds) : "—"}` : "—"}
                  {r.formula_version && <p className="text-[0.65rem] text-mist-500">{r.formula_version}</p>}
                </Td>
                <Td className="text-xs">
                  {reviewed ? (
                    <div className="grid gap-0.5">
                      <p className="text-mist-200">{r.validated_by_name ?? "Equipe"}</p>
                      <p className="tabular font-mono text-[0.7rem] text-mist-500">{dt(r.validated_at)}</p>
                      {r.review_note && <p className="max-w-[16rem] text-mist-400">“{r.review_note}”</p>}
                    </div>
                  ) : canValidate ? <TestReviewForm resultId={r.id} athlete={r.full_name} /> : <span className="text-mist-500">Aguardando</span>}
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
