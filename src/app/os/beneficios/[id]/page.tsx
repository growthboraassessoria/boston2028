import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { Card, OsTitle, Pill } from "@/components/os/ui";
import { BenefitActions, BenefitForm, CodesLoader, type BenefitValues } from "@/components/benefits/OsBenefitForms";
import { CATEGORY_LABEL, MODE_LABEL, SCOPE_LABEL } from "@/components/benefits/labels";

export const metadata = { title: "Benefício" };

const local = (d: Date | null) => {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  return p.replace(" ", "T");
};

export default async function BeneficioOsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("super_admin", "growth");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await asUser(ctx.user, async (tx) => {
    const [b] = await tx`select b.*, s.coupon_code, s.external_url from rtb.benefits b left join rtb.benefit_secrets s on s.benefit_id = b.id where b.id = ${id}`;
    const partners = await tx`select id, name, status, brand_authorized, logo_path from rtb.partners order by name`;
    return { b, partners };
  });
  if (!data.b) notFound();
  const b = data.b;
  const initial: BenefitValues = {
    id: b.id, partnerId: b.partner_id, slug: b.slug, title: b.title, summary: b.summary, description: b.description ?? "", rules: b.rules ?? "",
    category: b.category, audienceNote: b.audience_note ?? "", journeyScope: b.journey_scope, requiresActiveMember: b.requires_active_member,
    cities: (b.cities ?? []).join(", "), ufs: (b.ufs ?? []).join(", "), polos: (b.polos ?? []).join(", "), startsAt: local(b.starts_at), endsAt: local(b.ends_at),
    totalQuantity: b.total_quantity === null ? "" : String(b.total_quantity), perMemberLimit: String(b.per_member_limit), restockOnExpiry: b.restock_on_expiry,
    redemptionInstructions: b.redemption_instructions ?? "", mode: b.mode, generateCodes: b.generate_codes, codeTtlHours: String(b.code_ttl_hours),
    terms: b.terms ?? "", cancellationPolicy: b.cancellation_policy ?? "", visibility: b.visibility, status: b.status, isHealthRelated: b.is_health_related,
    couponCode: b.coupon_code ?? "", externalUrl: b.external_url ?? "",
  };
  const partner = data.partners.find((p) => p.id === b.partner_id);
  const img = publicUrl(b.image_path);
  return (
    <div className="grid gap-5">
      <OsTitle kicker="Benefícios" title={b.title} actions={<BenefitActions id={b.id} status={b.status} />}>
        <span className="flex flex-wrap gap-1"><Pill>{b.status}</Pill>{b.is_demo && <Pill className="border-signal/60 text-signal">demonstração</Pill>}
          {partner && partner.status !== "ACTIVE" && <Pill className="border-warn/50 text-warn">parceiro {partner.status}</Pill>}</span>
      </OsTitle>
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card title="Editar"><BenefitForm initial={initial} partners={data.partners.map((p) => ({ id: p.id, name: p.name }))} /></Card>
        <div className="grid content-start gap-5">
          <Card title="Prévia do card (como o atleta vê)">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-night-850">
              <div className="relative aspect-[16/7] bg-linear-to-br from-blue-700 to-night-900">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-4">
                <p className="label-mono text-[0.6rem] text-mist-400">{CATEGORY_LABEL[b.category]} · {partner?.name}</p>
                <p className="mt-1.5 font-semibold text-mist-50">{b.title}</p>
                <p className="mt-1 text-sm text-mist-300">{b.summary}</p>
                <p className="mt-3 text-xs text-mist-400">{MODE_LABEL[b.mode]} · {SCOPE_LABEL[b.journey_scope]}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-mist-500">O cupom e o link nunca aparecem antes de um resgate válido.</p>
          </Card>
          {b.mode === "ONE_TIME_CODE" && <Card title="Lote de códigos do parceiro"><CodesLoader benefitId={b.id} /></Card>}
        </div>
      </div>
    </div>
  );
}
