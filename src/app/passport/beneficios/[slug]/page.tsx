import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { CATEGORY_LABEL, LOCK_LABEL, MODE_LABEL, SCOPE_LABEL } from "@/components/benefits/labels";
import { ClaimBenefit } from "@/components/benefits/ClaimBenefit";
import { Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Benefício" };

type Detail = {
  id: string; slug: string; title: string; summary: string; description: string | null; rules: string | null; category: string;
  audience_note: string | null; mode: string; journey_scope: string; requires_active_member: boolean; starts_at: string | null; ends_at: string | null;
  remaining_quantity: number | null; total_quantity: number | null; per_member_limit: number; image_path: string | null;
  redemption_instructions: string | null; terms: string | null; cancellation_policy: string | null; code_ttl_hours: number; is_demo: boolean;
  is_health_related: boolean; partner: { name: string; description: string | null; website_url: string | null; logo_path: string | null };
  eligibility: { eligible: boolean; reason: string | null };
};

const fmt = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

export default async function BeneficioPage({ params }: { params: Promise<{ slug: string }> }) {
  const [d, { slug }] = await Promise.all([getPassport(), params]);
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  const b = await asUser(d.user, async (tx) => {
    const [row] = await tx`select rtb.my_benefit_detail(${slug}) as b`;
    const detail = row?.b as Detail | null;
    if (detail) await tx`select rtb.track_benefit_view(${detail.id})`;
    return detail;
  });
  if (!b) notFound();
  const img = publicUrl(b.image_path);
  const logo = publicUrl(b.partner.logo_path);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/passport/beneficios" className="label-mono text-mist-400 hover:text-mist-100">← Benefícios</Link>
      <div className="relative mt-4 aspect-[16/7] overflow-hidden rounded-xl bg-linear-to-br from-blue-700 to-night-900">
        {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-full w-full object-cover" />
                )}
        {b.is_demo && <span className="label-mono absolute left-3 top-3 rounded-sm bg-signal px-1.5 py-0.5 text-[0.6rem] text-night-950">Demonstração · não é real</span>}
      </div>
      <div className="mt-5 flex items-start gap-3">
        {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={`Logo de ${b.partner.name}`} className="size-12 rounded-md bg-white object-contain p-1" />
                )}
        <div>
          <p className="label-mono text-[0.6rem] text-mist-400">{CATEGORY_LABEL[b.category]} · {b.partner.name}</p>
          <h1 className="display mt-1 text-[clamp(1.8rem,1.3rem+2vw,2.6rem)] text-mist-50">{b.title}</h1>
        </div>
      </div>
      <p className="mt-3 leading-relaxed text-mist-200">{b.summary}</p>
      {b.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-mist-300">{b.description}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-mist-400">Como funciona</dt><dd className="mt-0.5 text-mist-50">{MODE_LABEL[b.mode]}</dd></div>
        <div><dt className="text-mist-400">Para quem</dt><dd className="mt-0.5 text-mist-50">{SCOPE_LABEL[b.journey_scope]}{b.requires_active_member ? " · matrícula ativa" : ""}</dd></div>
        <div><dt className="text-mist-400">Limite</dt><dd className="mt-0.5 text-mist-50">{b.per_member_limit} por pessoa</dd></div>
        <div><dt className="text-mist-400">Validade do código</dt><dd className="mt-0.5 text-mist-50">{b.code_ttl_hours >= 48 ? `${Math.round(b.code_ttl_hours / 24)} dias` : `${b.code_ttl_hours} h`}</dd></div>
        {b.ends_at && <div><dt className="text-mist-400">Disponível até</dt><dd className="tabular mt-0.5 text-mist-50">{fmt(b.ends_at)}</dd></div>}
        <div><dt className="text-mist-400">Disponibilidade</dt><dd className="mt-0.5 text-mist-50">{b.remaining_quantity === 0 ? "Esgotado" : "Disponível"}</dd></div>
      </dl>

      {(b.rules || b.terms || b.cancellation_policy) && (
        <Panel className="mt-6">
          {b.rules && <><h2 className="label-mono text-mist-300">Regras</h2><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-mist-100">{b.rules}</p></>}
          {b.terms && <><h2 className="label-mono mt-4 text-mist-300">Termos</h2><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-mist-100">{b.terms}</p></>}
          {b.cancellation_policy && <><h2 className="label-mono mt-4 text-mist-300">Cancelamento</h2><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-mist-100">{b.cancellation_policy}</p></>}
        </Panel>
      )}

      <div className="mt-6">
        {b.eligibility.eligible ? (
          <ClaimBenefit benefitId={b.id} title={b.title} />
        ) : (
          <Panel tone="calm">
            <p className="font-semibold text-mist-50">{LOCK_LABEL[b.eligibility.reason ?? ""] ?? "Indisponível para você agora"}</p>
            <p className="mt-1 text-sm leading-relaxed text-mist-300">
              {b.eligibility.reason === "requires_active_member" ? "Este benefício é para alunos BORA com matrícula ativa confirmada pela equipe."
                : b.eligibility.reason === "pending_redemption" || b.eligibility.reason === "limit_reached" ? "Veja seu código em Resgates."
                : "Assim que a condição mudar, o botão de resgate aparece aqui."}
            </p>
            {(b.eligibility.reason === "pending_redemption" || b.eligibility.reason === "limit_reached") && <Link href="/passport/resgates" className="mt-3 inline-block text-sm text-volt underline underline-offset-4">Ver meus resgates</Link>}
          </Panel>
        )}
      </div>
      {b.is_health_related && <p className="mt-4 text-xs leading-relaxed text-mist-400">Benefício de saúde: o parceiro não recebe nenhuma informação clínica sua.</p>}
    </div>
  );
}
