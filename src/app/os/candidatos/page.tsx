import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { APPLICATION_STATUS_OS } from "@/lib/domain/athlete-status";
import { formatDuration } from "@/lib/domain/time";
import { dt } from "@/lib/os/format";
import { OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";

export const metadata = { title: "Candidatos" };

const STATUS = Object.keys(APPLICATION_STATUS_OS);

export default async function CandidatosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; jornada?: string; uf?: string }> }) {
  const ctx = await requireStaff("super_admin", "technical_director", "coach", "commercial", "membership_verifier");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = STATUS.includes(sp.status ?? "") ? sp.status! : null;
  const uf = /^[A-Z]{2}$/.test(sp.uf ?? "") ? sp.uf! : null;
  const jornada = ["ROAD_TO_BOSTON", "BORA_NEXT", "NONE", "PAUSED"].includes(sp.jornada ?? "") ? sp.jornada! : null;
  const rows = await asUser(ctx.user, (tx) => tx`
    select * from rtb.os_candidates
    where (${status}::text is null or status = ${status})
      and (${uf}::text is null or uf = ${uf})
      and (${jornada}::text is null or journey_status = ${jornada})
      and (${q} = '' or full_name ilike ${"%" + q + "%"} or email::text ilike ${"%" + q + "%"} or passport_number ilike ${"%" + q + "%"})
    order by submitted_at desc nulls last limit 300`);
  const sel = "min-h-10 rounded-[3px] border border-white/12 bg-[#060f20] px-2.5 text-sm text-mist-100";
  return (
    <div>
      <OsTitle kicker="Ficha 360" title="Candidatos">A lista respeita o seu papel: treinador vê atribuídos, comercial vê oportunidades, vínculo vê o necessário.</OsTitle>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Nome, e-mail ou passaporte" aria-label="Buscar" className={`${sel} w-64`} />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className={sel}>
          <option value="">Todos os status</option>
          {STATUS.filter((s) => s !== "DRAFT").map((s) => <option key={s} value={s}>{APPLICATION_STATUS_OS[s as keyof typeof APPLICATION_STATUS_OS]}</option>)}
        </select>
        <select name="jornada" defaultValue={jornada ?? ""} aria-label="Jornada" className={sel}>
          <option value="">Todas as jornadas</option><option value="ROAD_TO_BOSTON">Road to Boston</option><option value="BORA_NEXT">BORA NEXT</option><option value="PAUSED">Pausada</option><option value="NONE">Sem jornada</option>
        </select>
        <input name="uf" defaultValue={uf ?? ""} placeholder="UF" maxLength={2} aria-label="UF" className={`${sel} w-16 uppercase`} />
        <button className="min-h-10 rounded-[3px] border border-white/15 px-3 text-sm text-mist-100 hover:border-volt">Filtrar</button>
        {(q || status || uf || jornada) && <Link href="/os/candidatos" className="min-h-10 px-2 py-2 text-sm text-mist-400 hover:text-mist-100">Limpar</Link>}
      </form>
      <Table head={["Atleta", "Passaporte", "Status", "Jornada", "Vínculo", "Marca", "Prova", "Enviada"]} empty={rows.length ? undefined : "Nenhum candidato com esses filtros."}>
        {rows.map((r) => (
          <tr key={r.application_id} className="hover:bg-white/[0.02]">
            <Td><RowLink href={`/os/candidatos/${r.application_id}`}>{r.full_name}</RowLink><p className="text-xs text-mist-500">{r.city ?? "—"}{r.uf ? `/${r.uf}` : ""}</p></Td>
            <Td mono className="text-xs">{r.passport_number}</Td>
            <Td><Pill status={r.status}>{APPLICATION_STATUS_OS[r.status as keyof typeof APPLICATION_STATUS_OS]}</Pill></Td>
            <Td className="text-xs">{r.open_journey ? `${r.open_journey === "BORA_NEXT" ? "NEXT" : "Road"} · ${r.open_journey_status}` : "—"}</Td>
            <Td className="text-xs">{r.membership_verified}</Td>
            <Td mono className="text-xs">{r.mark_seconds ? formatDuration(r.mark_seconds) : "—"}</Td>
            <Td className="text-xs">{r.target_race_name ?? "—"}</Td>
            <Td mono className="text-xs text-mist-400">{dt(r.submitted_at)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
