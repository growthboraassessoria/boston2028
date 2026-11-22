import Link from "next/link";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { dt } from "@/lib/os/format";
import { OsTitle, Pill, Table, Td } from "@/components/os/ui";
import { RedemptionRowActions } from "@/components/benefits/OsBenefitForms";
import { REDEMPTION_LABEL } from "@/components/benefits/labels";

export const metadata = { title: "Resgates" };

export default async function OsResgatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireStaff("super_admin", "growth", "partner_operator");
  const sp = await searchParams;
  const status = Object.keys(REDEMPTION_LABEL).includes(sp.status ?? "") ? sp.status! : null;
  const manage = hasRole(ctx, "super_admin", "growth");
  const rows = await asUser(ctx.user, (tx) => tx`
    select r.id, r.status, r.created_at, r.issued_at, r.expires_at, r.redeemed_at, b.title, p.name as partner_name
    from rtb.benefit_redemptions r join rtb.benefits b on b.id = r.benefit_id join rtb.partners p on p.id = r.partner_id
    where (${status}::text is null or r.status = ${status}) order by r.created_at desc limit 300`);
  return (
    <div>
      <OsTitle kicker="Benefícios" title="Resgates"
        actions={<Link href="/os/resgates/validar" className="inline-flex min-h-10 items-center rounded-[3px] bg-volt px-3.5 text-sm font-semibold text-night-950">Validar resgate</Link>}>
        {manage ? "Aprovação manual, cancelamento com motivo e devolução de estoque ficam na auditoria." : "Você vê só os resgates dos benefícios do seu parceiro, sem dados pessoais."}
      </OsTitle>
      <nav className="mb-3 flex flex-wrap gap-1" aria-label="Filtrar por status">
        <Link href="/os/resgates" className={`label-mono rounded-[3px] border px-2.5 py-1.5 text-[0.6rem] ${!status ? "border-volt text-volt" : "border-white/10 text-mist-400"}`}>Todos</Link>
        {Object.entries(REDEMPTION_LABEL).map(([k, v]) => (
          <Link key={k} href={`/os/resgates?status=${k}`} className={`label-mono rounded-[3px] border px-2.5 py-1.5 text-[0.6rem] ${status === k ? "border-volt text-volt" : "border-white/10 text-mist-400"}`}>{v}</Link>
        ))}
      </nav>
      <Table head={["Benefício", "Parceiro", "Status", "Pedido", "Vence", "Usado", ...(manage ? ["Ações"] : [])]} empty={rows.length ? undefined : "Nenhum resgate."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td>{r.title}</Td>
            <Td className="text-xs">{r.partner_name}</Td>
            <Td><Pill>{REDEMPTION_LABEL[r.status]}</Pill></Td>
            <Td mono className="text-xs">{dt(r.created_at)}</Td>
            <Td mono className="text-xs">{dt(r.expires_at)}</Td>
            <Td mono className="text-xs">{dt(r.redeemed_at)}</Td>
            {manage && <Td><RedemptionRowActions id={r.id} status={r.status} /></Td>}
          </tr>
        ))}
      </Table>
    </div>
  );
}
