import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { day } from "@/lib/os/format";
import { Card, OsTitle, Pill } from "@/components/os/ui";
import { BrandPermissionForm, PartnerForm } from "@/components/benefits/OsBenefitForms";
import { CATEGORY_LABEL } from "@/components/benefits/labels";

export const metadata = { title: "Parceiros" };

export default async function ParceirosPage() {
  const ctx = await requireStaff("super_admin", "growth");
  const { partners, perms } = await asUser(ctx.user, async (tx) => ({
    partners: await tx`select p.*, (select count(*)::int from rtb.benefits b where b.partner_id = p.id) as benefits from rtb.partners p order by p.created_at desc`,
    perms: await tx`select * from rtb.partner_brand_permissions order by granted_on desc`,
  }));
  return (
    <div className="grid gap-5">
      <OsTitle kicker="Benefícios" title="Parceiros">
        Parceiro só aparece para atletas quando está ATIVO. O logo só aparece com o uso da marca autorizado e registrado aqui. Nada de parceria apresentada como real sem cadastro e confirmação.
      </OsTitle>
      <Card title="Novo parceiro"><PartnerForm /></Card>
      {partners.map((p) => {
        const logo = publicUrl(p.logo_path);
        return (
          <Card key={p.id} title={p.name} actions={<div className="flex gap-1"><Pill>{p.status}</Pill>{p.is_demo && <Pill className="border-signal/60 text-signal">demo</Pill>}{p.brand_authorized && <Pill className="border-volt/40 text-volt">marca autorizada</Pill>}</div>}>
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-3 text-sm text-mist-300">
                  {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="size-10 rounded bg-white object-contain p-0.5" />
                )}
                  <span>{CATEGORY_LABEL[p.category]} · {p.benefits} benefício(s)</span>
                </div>
                <PartnerForm initial={{ id: p.id, name: p.name, slug: p.slug, description: p.description ?? "", category: p.category, websiteUrl: p.website_url ?? "",
                  contactName: p.contact_name ?? "", contactEmail: p.contact_email ?? "", contactPhone: p.contact_phone ?? "", status: p.status, brandAuthorized: p.brand_authorized }} />
              </div>
              <div>
                <p className="label-mono text-[0.6rem] text-mist-500">Autorizações de uso da marca</p>
                {perms.filter((x) => x.partner_id === p.id).map((x) => (
                  <p key={x.id} className="mt-2 text-sm text-mist-200">{x.scope} · desde {day(x.granted_on)}{x.expires_on ? ` até ${day(x.expires_on)}` : ""}{x.document_path ? " · comprovante anexado" : " · sem comprovante"}</p>
                ))}
                <div className="mt-3"><BrandPermissionForm partnerId={p.id} /></div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
