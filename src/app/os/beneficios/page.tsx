import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { OsTitle, Pill, RowLink, Table, Td } from "@/components/os/ui";
import { MODE_LABEL, SCOPE_LABEL } from "@/components/benefits/labels";

export const metadata = { title: "Benefícios" };

export default async function OsBeneficiosPage() {
  const ctx = await requireStaff("super_admin", "growth");
  const rows = await asUser(ctx.user, (tx) => tx`
    select b.*, p.name as partner_name,
      (select count(*)::int from rtb.benefit_redemptions r where r.benefit_id = b.id and r.status in ('ISSUED','RESERVED')) as open_count,
      (select count(*)::int from rtb.benefit_redemptions r where r.benefit_id = b.id and r.status = 'REDEEMED') as redeemed_count,
      (select count(*)::int from rtb.benefit_codes c where c.benefit_id = b.id and c.status = 'AVAILABLE') as codes_left
    from rtb.benefits b join rtb.partners p on p.id = b.partner_id order by b.created_at desc`);
  return (
    <div>
      <OsTitle kicker="Benefícios" title="Catálogo"
        actions={<Link href="/os/beneficios/novo" className="inline-flex min-h-10 items-center rounded-[3px] bg-volt px-3.5 text-sm font-semibold text-night-950">Novo benefício</Link>}>
        Estoque, elegibilidade e resgates de verdade: o resgate acontece numa transação no banco, com trava e código único.
      </OsTitle>
      <Table head={["Benefício", "Parceiro", "Modo", "Jornada", "Estoque", "Em aberto", "Usados", "Views", "Status"]} empty={rows.length ? undefined : "Nenhum benefício cadastrado."}>
        {rows.map((b) => (
          <tr key={b.id}>
            <Td><RowLink href={`/os/beneficios/${b.id}`}>{b.title}</RowLink>{b.is_demo && <Pill className="ml-1 border-signal/60 text-signal">demo</Pill>}</Td>
            <Td className="text-xs">{b.partner_name}</Td>
            <Td className="text-xs">{MODE_LABEL[b.mode]}</Td>
            <Td className="text-xs">{SCOPE_LABEL[b.journey_scope]}{b.requires_active_member ? " · membro" : ""}</Td>
            <Td mono>{b.total_quantity === null ? "∞" : `${b.remaining_quantity}/${b.total_quantity}`}{b.mode === "ONE_TIME_CODE" ? <span className="block text-xs text-mist-500">lote: {b.codes_left}</span> : null}</Td>
            <Td mono>{b.open_count}</Td>
            <Td mono>{b.redeemed_count}</Td>
            <Td mono>{b.views_count}</Td>
            <Td><Pill>{b.status}</Pill></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
