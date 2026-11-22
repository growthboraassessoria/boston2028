import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { Card, OsTitle } from "@/components/os/ui";
import { BenefitForm, EMPTY_BENEFIT } from "@/components/benefits/OsBenefitForms";

export const metadata = { title: "Novo benefício" };

export default async function NovoBeneficioPage() {
  const ctx = await requireStaff("super_admin", "growth");
  const partners = await asUser(ctx.user, (tx) => tx`select id, name from rtb.partners where status <> 'ARCHIVED' order by name`);
  return (
    <div className="grid gap-5">
      <OsTitle kicker="Benefícios" title="Novo benefício">Comece como rascunho. Ative depois de conferir a prévia e a autorização do parceiro.</OsTitle>
      <Card><BenefitForm initial={EMPTY_BENEFIT} partners={partners.map((p) => ({ id: p.id, name: p.name }))} /></Card>
    </div>
  );
}
