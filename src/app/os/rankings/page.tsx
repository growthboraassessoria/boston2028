import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { formatDuration } from "@/lib/domain/time";
import { Card, OsTitle, PendingIntegration, Pill, Table, Td } from "@/components/os/ui";

export const metadata = { title: "Rankings" };

const LEVEL: Record<string, string> = { BOSTON_SEGURO: "Boston seguro", INDICE: "No índice", NA_ROTA: "Na rota", EM_PREPARACAO: "Em preparação" };
// Road e NEXT lado a lado, mesmo peso visual: cada ranking compara só atletas da mesma jornada.
const SECTIONS = [
  ["ROAD_TO_BOSTON", "Road to Boston 2028"],
  ["BORA_NEXT", "BORA NEXT"],
] as const;

function pct(v: unknown) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const s = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}%`;
}

export default async function RankingsPage() {
  const ctx = await requireStaff("super_admin", "technical_director");
  const seesResults = hasRole(ctx, "super_admin", "technical_director", "coach");

  const d = await asUser(ctx.user, async (tx) => {
    const rows = await tx`
      select r.result_id, r.test_id, r.full_name, r.city, r.uf, r.polo, r.journey_status, r.seconds, r.status,
             r.normalized_pct, r.level, r.formula_version, r.ranking_opt_in, r.position
      from rtb.os_ranking r
      where r.test_id in (select t.id from rtb.tests t where t.cycle_id = rtb.current_cycle_id())
      order by r.position, r.full_name`;
    const tests = await tx`select id, name from rtb.tests where cycle_id = rtb.current_cycle_id() order by planned_month, name`;
    const [flag] = await tx`select enabled from rtb.feature_flags where key = 'ranking_public'`;
    const [rule] = await tx`select status from rtb.program_settings where key = 'ranking'`;
    return { rows, tests, publicOn: !!flag?.enabled, ruleStatus: (rule?.status as string | undefined) ?? "pending" };
  });

  const byTest = d.tests.map((t) => {
    const all = d.rows.filter((r) => r.test_id === t.id);
    const validated = all.filter((r) => r.status === "VALIDATED");
    return {
      id: t.id as string, name: t.name as string, pending: all.filter((r) => r.status === "SUBMITTED").length,
      sections: SECTIONS.map(([k, name]) => ({ key: k, name, rows: validated.filter((r) => r.journey_status === k) })),
      other: validated.filter((r) => r.journey_status !== "ROAD_TO_BOSTON" && r.journey_status !== "BORA_NEXT").length,
      total: validated.length,
    };
  });
  const withData = byTest.filter((t) => t.total > 0 || t.pending > 0);

  return (
    <div className="grid gap-5">
      <OsTitle kicker="Testes do ciclo" title="Rankings internos">
        Posição pelo % normalizado (resultado validado comparado com o índice da categoria e da idade). Road to Boston e BORA NEXT têm rankings
        separados: cada um compara atletas da mesma jornada.
      </OsTitle>

      <div className="grid gap-2">
        {!d.publicOn ? (
          <PendingIntegration>
            Ranking público desligado (flag ranking_public). Ele só pode ser ligado depois que a fórmula for aprovada pelo Lucas
            (hoje: {d.ruleStatus === "approved" ? "aprovada" : "pendente"}) e mostra apenas atletas com opt-in. Esta tela é interna.
          </PendingIntegration>
        ) : (
          <PendingIntegration>Ranking público ligado: o mural mostra só resultados validados do Road to Boston de atletas com opt-in, com primeiro nome e inicial.</PendingIntegration>
        )}
        {!seesResults && (
          <p className="rounded-[4px] border border-white/10 px-3 py-2 text-sm text-mist-300">
            Seu papel não vê resultados individuais: o banco libera esses dados só para a coordenação técnica, os treinadores e o admin.
          </p>
        )}
      </div>

      {withData.length === 0 && (
        <Card><p className="text-sm text-mist-300">Nenhum resultado validado no ciclo ainda. Os rankings aparecem aqui depois da validação dos testes.</p></Card>
      )}

      {withData.map((t) => (
        <Card key={t.id} title={t.name} actions={<span className="tabular font-mono text-[0.7rem] text-mist-500">{t.total} validados{t.pending ? ` · ${t.pending} aguardando` : ""}</span>}>
          <div className="grid gap-5">
            {t.sections.map((s) => (
              <section key={s.key} aria-label={`${t.name} · ${s.name}`} className="grid gap-2">
                <h3 className="label-mono text-[0.6rem] text-mist-400">{s.name} · <span className="tabular">{s.rows.length}</span></h3>
                <Table head={["Posição", "Atleta", "Polo · UF", "Tempo", "% normalizado", "Nível", "Opt-in público"]}
                  empty={s.rows.length ? undefined : "Nenhum resultado validado nesta jornada."}>
                  {s.rows.map((r) => (
                    <tr key={r.result_id} className="hover:bg-white/[0.02]">
                      <Td mono className="text-mist-50">{r.normalized_pct === null ? "—" : `${r.position}º`}</Td>
                      <Td><span className="font-medium text-mist-50">{r.full_name}</span><p className="text-xs text-mist-500">{r.city ?? "—"}</p></Td>
                      <Td className="text-xs">{r.polo ?? "—"} · {r.uf ?? "—"}</Td>
                      <Td mono>{formatDuration(r.seconds)}</Td>
                      <Td mono>{pct(r.normalized_pct)}</Td>
                      <Td className="text-xs">{r.level ? <Pill>{LEVEL[r.level] ?? r.level}</Pill> : "—"}</Td>
                      <Td className="text-xs">{r.ranking_opt_in ? <Pill className="border-volt/50 text-volt">Sim</Pill> : <span className="text-mist-500">Não</span>}</Td>
                    </tr>
                  ))}
                </Table>
              </section>
            ))}
            {t.other > 0 && <p className="text-xs text-mist-500">{t.other} resultado(s) validado(s) de atletas com jornada pausada ou concluída ficam fora dos dois rankings.</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
