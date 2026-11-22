import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { APPLICATION_STATUS_OS } from "@/lib/domain/athlete-status";
import { REASON_LABEL, type PrelimReason } from "@/lib/domain/triage";
import { formatDuration } from "@/lib/domain/time";
import { dt, slaInfo } from "@/lib/os/format";
import { OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";

export const metadata = { title: "Triagem e SLA" };

export default async function TriagemPage() {
  const ctx = await requireStaff("technical_director", "super_admin");
  const rows = await asUser(ctx.user, (tx) => tx`
    select * from rtb.os_candidates
    where status in ('PRELIM_ALMOST', 'UNDER_REVIEW', 'PRELIM_ELIGIBLE', 'PRELIM_NOT_NOW', 'NEEDS_INFO', 'REASSESSMENT_PENDING')
    order by case when status in ('PRELIM_ALMOST', 'UNDER_REVIEW') and first_contact_at is null then 0 else 1 end,
             sla_due_at nulls last, submitted_at`);
  const tone = { alert: "text-danger", warn: "text-warn", ok: "text-ok", neutral: "text-mist-300" } as const;
  return (
    <div>
      <OsTitle kicker="Coordenação técnica" title="Triagem e SLA">
        “Quase lá” tem contato em até 3 dias úteis (meta operacional). A triagem só ordena a fila: toda aprovação e todo encaminhamento ao NEXT é decisão humana registrada.
      </OsTitle>
      <Table head={["Atleta", "Status", "Motivos da triagem", "Marca → índice", "Prova alvo", "SLA", "Enviada"]} empty={rows.length ? undefined : "Fila vazia."}>
        {rows.map((r) => {
          const sla = slaInfo(r.sla_due_at, r.first_contact_at);
          return (
            <tr key={r.application_id} className="hover:bg-white/[0.02]">
              <Td><RowLink href={`/os/candidatos/${r.application_id}`}>{r.full_name}</RowLink><p className="text-xs text-mist-500">{r.city ?? "—"}{r.uf ? `/${r.uf}` : ""} · {r.membership_declared === "SIM_ATUAL" ? "diz ser aluno" : "não aluno"}{r.membership_verified === "ATIVO_CONFIRMADO" ? " (verificado)" : ""}</p></Td>
              <Td><Pill status={r.status}>{APPLICATION_STATUS_OS[r.status as keyof typeof APPLICATION_STATUS_OS]}</Pill>{r.late_entry && <Pill className="ml-1 border-warn/50 text-warn">tardia</Pill>}</Td>
              <Td className="max-w-[16rem] text-xs text-mist-300">{(r.prelim_reasons as PrelimReason[]).map((x) => REASON_LABEL[x] ?? x).join(" · ") || "Na régua"}</Td>
              <Td mono>{r.mark_seconds ? `${r.mark_distance === "HALF" ? "½ " : ""}${formatDuration(r.mark_seconds)}` : "—"}<span className="text-mist-500"> → {r.standard_seconds ? formatDuration(r.standard_seconds) : "—"}</span>
                {r.gap_seconds !== null && <p className={r.gap_seconds <= 0 ? "text-volt" : "text-mist-400"}>{formatDuration(r.gap_seconds, { sign: true })}</p>}</Td>
              <Td className="text-xs">{r.target_race_name ?? "Nenhuma"}</Td>
              <Td className={`text-xs ${sla ? tone[sla.tone] : "text-mist-500"}`}>{sla?.label ?? "—"}</Td>
              <Td mono className="text-xs text-mist-400">{dt(r.submitted_at)}</Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
