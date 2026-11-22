import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { Card, OsTitle } from "@/components/os/ui";
import { ValidateRedemption } from "@/components/benefits/OsBenefitForms";

export const metadata = { title: "Validar resgate" };

export default async function ValidarPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const ctx = await requireStaff("partner_operator", "super_admin");
  const sp = await searchParams;
  const token = /^[0-9a-fA-F]{40}$/.test(sp.t ?? "") ? sp.t!.toLowerCase() : null;
  const benefits = await asUser(ctx.user, (tx) => tx`
    select id, title from rtb.benefits where status = 'ACTIVE' and mode in ('QR_VALIDATION', 'ONE_TIME_CODE') order by title`);
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <OsTitle kicker="Parceiro" title="Validar resgate">
        Leia o QR do atleta com a câmera do celular (ele abre esta página) ou digite o código. Cada resgate vale uma única vez.
      </OsTitle>
      <Card><ValidateRedemption token={token} benefits={benefits.map((b) => ({ id: b.id, title: b.title }))} /></Card>
    </div>
  );
}
