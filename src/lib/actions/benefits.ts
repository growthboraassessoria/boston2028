"use server";

// Benefícios: resgate pelo atleta (transação atômica no banco) e gestão pela equipe (cadastro, estoque, validação).
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireStaff, requireUser } from "@/lib/auth/session";
import { asUser, dbErrorCode } from "@/lib/db";
import { processOutboxSoon } from "@/lib/email/outbox";
import { uploadPublic } from "@/lib/storage";

export type BenefitResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const NOT_ELIGIBLE: Record<string, string> = {
  not_active: "Este benefício não está ativo agora.",
  not_started: "Este benefício ainda não começou.",
  ended: "Este benefício já terminou.",
  sold_out: "Esgotado. Nenhum código foi emitido.",
  requires_active_member: "Exige matrícula ativa confirmada pela equipe BORA.",
  journey_mismatch: "Exclusivo de outra jornada do projeto.",
  location_mismatch: "Disponível só para outra região.",
  limit_reached: "Você já usou este benefício o máximo de vezes permitido.",
  pending_redemption: "Você já tem um resgate deste benefício em andamento.",
  profile_required: "Complete seu cadastro primeiro.",
};

function benefitError(e: unknown): string {
  const code = dbErrorCode(e);
  if (code.startsWith("not_eligible:")) return NOT_ELIGIBLE[code.split(":")[1]!] ?? "Você não pode resgatar este benefício agora.";
  if (code === "terms_required") return "Aceite os termos para resgatar.";
  if (code === "rate_limited") return "Muitas tentativas. Aguarde alguns minutos.";
  if (code === "benefit_misconfigured") return "Benefício com configuração incompleta. A equipe foi avisada.";
  if (code === "forbidden" || code === "forbidden_partner") return "Sem permissão para esta ação.";
  return "Não foi possível concluir agora. Tente de novo.";
}

const Key = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);

// ── Atleta ───────────────────────────────────────────────────────────────────

export async function claimBenefit(benefitId: string, acceptTerms: boolean, idempotencyKey: string): Promise<BenefitResult> {
  const user = await requireUser("/passport/beneficios");
  if (!z.uuid().safeParse(benefitId).success || !Key.safeParse(idempotencyKey).success) return { ok: false, error: "Pedido inválido." };
  try {
    const [r] = await asUser(user, (tx) => tx`select rtb.claim_benefit(${benefitId}, ${idempotencyKey}, ${acceptTerms}) as r`);
    after(() => processOutboxSoon());
    revalidatePath("/passport", "layout");
    return { ok: true, data: r!.r };
  } catch (e) {
    return { ok: false, error: benefitError(e) };
  }
}

export async function trackBenefitView(benefitId: string) {
  const user = await requireUser("/passport/beneficios");
  if (!z.uuid().safeParse(benefitId).success) return;
  await asUser(user, (tx) => tx`select rtb.track_benefit_view(${benefitId})`).catch(() => undefined);
}

// ── Parceiro: validação única ────────────────────────────────────────────────

export async function validateRedemption(input: { token?: string; code?: string; benefitId?: string; idempotencyKey: string }): Promise<BenefitResult> {
  const ctx = await requireStaff("partner_operator", "super_admin");
  const p = z.object({
    token: z.string().regex(/^[0-9a-fA-F]{40}$/).optional().or(z.literal("")),
    code: z.string().trim().max(60).optional(),
    benefitId: z.uuid().optional().or(z.literal("")),
    idempotencyKey: Key,
  }).safeParse(input);
  if (!p.success) return { ok: false, error: "Leia o QR ou informe o código e o benefício." };
  const v = p.data;
  if (!v.token && !(v.code && v.benefitId)) return { ok: false, error: "Leia o QR ou informe o código e o benefício." };
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.validate_redemption(${v.token || null}, ${v.code || null}, ${v.benefitId || null}, ${v.idempotencyKey}) as r`);
    after(() => processOutboxSoon());
    revalidatePath("/os/resgates");
    return { ok: true, data: r!.r };
  } catch (e) {
    const code = dbErrorCode(e);
    if (code === "redemption_not_found") return { ok: false, error: "Código não encontrado. Confira e tente de novo." };
    return { ok: false, error: benefitError(e) };
  }
}

// ── Equipe: parceiros ────────────────────────────────────────────────────────

const Partner = z.object({
  id: z.uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "Use letras minúsculas, números e hífen."),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["equipment", "nutrition_recovery", "health_assessment", "experiences_services"]),
  websiteUrl: z.url({ protocol: /^https$/ }).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.email().optional().or(z.literal("")),
  contactPhone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "PENDING", "ACTIVE", "PAUSED", "ARCHIVED"]),
  brandAuthorized: z.boolean(),
});

export async function savePartner(raw: unknown, logo: FormData | null): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  const p = Partner.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const v = p.data;
  let logoPath: string | null | undefined;
  const file = logo?.get("logo");
  if (file instanceof File && file.size > 0) {
    const up = await uploadPublic("partners", file);
    if (!up.ok) return { ok: false, error: up.error };
    logoPath = up.path;
  }
  try {
    const id = await asUser(ctx.user, async (tx) => {
      const row = {
        name: v.name, slug: v.slug, description: v.description || null, category: v.category, website_url: v.websiteUrl || null,
        contact_name: v.contactName || null, contact_email: v.contactEmail || null, contact_phone: v.contactPhone || null,
        status: v.status, brand_authorized: v.brandAuthorized, ...(logoPath ? { logo_path: logoPath } : {}),
      };
      if (v.id) {
        await tx`update rtb.partners set ${tx(row)} where id = ${v.id}`;
        return v.id;
      }
      const [r] = await tx`insert into rtb.partners ${tx({ ...row, created_by: ctx.user.id })} returning id`;
      return r!.id as string;
    });
    revalidatePath("/os/parceiros");
    return { ok: true, message: "Parceiro salvo.", data: { id } };
  } catch (e) {
    if (String((e as Error).message).includes("partners_slug_key")) return { ok: false, error: "Já existe parceiro com esse identificador." };
    return { ok: false, error: benefitError(e) };
  }
}

export async function addBrandPermission(partnerId: string, scope: string, grantedOn: string, expiresOn: string, note: string, doc: FormData | null): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  if (!z.uuid().safeParse(partnerId).success || scope.trim().length < 3 || !z.iso.date().safeParse(grantedOn).success) {
    return { ok: false, error: "Informe o escopo da autorização e a data." };
  }
  let documentPath: string | null = null;
  const file = doc?.get("doc");
  if (file instanceof File && file.size > 0) {
    const { uploadPartnerDocument } = await import("@/lib/storage");
    const up = await uploadPartnerDocument(partnerId, file);
    if (!up.ok) return { ok: false, error: up.error };
    documentPath = up.path;
  }
  try {
    await asUser(ctx.user, (tx) => tx`insert into rtb.partner_brand_permissions (partner_id, document_path, scope, granted_on, expires_on, verified_by, verified_at, note)
      values (${partnerId}, ${documentPath}, ${scope.trim()}, ${grantedOn}, ${expiresOn || null}, ${ctx.user.id}, now(), ${note.trim() || null})`);
    revalidatePath("/os/parceiros");
    return { ok: true, message: "Autorização de marca registrada." };
  } catch (e) {
    return { ok: false, error: benefitError(e) };
  }
}

// ── Equipe: benefícios ───────────────────────────────────────────────────────

const csv = z.string().optional().transform((s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean));

const Benefit = z.object({
  id: z.uuid().optional().or(z.literal("")),
  partnerId: z.uuid({ error: "Escolha o parceiro." }),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/, "Identificador: letras minúsculas, números e hífen."),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4000).optional(),
  rules: z.string().trim().max(4000).optional(),
  category: z.enum(["equipment", "nutrition_recovery", "health_assessment", "experiences_services"]),
  audienceNote: z.string().trim().max(300).optional(),
  journeyScope: z.enum(["ANY", "ROAD", "NEXT", "BOTH"]),
  requiresActiveMember: z.boolean(),
  cities: csv, ufs: csv, polos: csv,
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  totalQuantity: z.number().int().min(0).max(1_000_000).nullable(),
  perMemberLimit: z.number().int().min(1).max(50),
  restockOnExpiry: z.boolean(),
  redemptionInstructions: z.string().trim().max(2000).optional(),
  mode: z.enum(["COUPON", "ONE_TIME_CODE", "QR_VALIDATION", "MANUAL_APPROVAL", "EXTERNAL_URL"]),
  generateCodes: z.boolean(),
  codeTtlHours: z.number().int().min(1).max(8760),
  terms: z.string().trim().max(4000).optional(),
  cancellationPolicy: z.string().trim().max(2000).optional(),
  visibility: z.enum(["HIDDEN", "VISIBLE_LOCKED", "VISIBLE"]),
  status: z.enum(["DRAFT", "PENDING", "ACTIVE", "PAUSED", "ARCHIVED"]),
  isHealthRelated: z.boolean(),
  couponCode: z.string().trim().max(60).optional(),
  externalUrl: z.url({ protocol: /^https$/ }).optional().or(z.literal("")),
}).superRefine((v, ctx) => {
  if (v.mode === "COUPON" && !v.couponCode) ctx.addIssue({ code: "custom", path: ["couponCode"], message: "Modo cupom exige o código do cupom." });
  if (v.mode === "EXTERNAL_URL" && !v.externalUrl) ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Modo link exige a URL https do parceiro." });
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim precisa ser depois do início." });
});

const toTs = (v?: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : null);

export async function saveBenefit(raw: unknown, image: FormData | null): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  const p = Benefit.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const v = p.data;
  let imagePath: string | undefined;
  const file = image?.get("image");
  if (file instanceof File && file.size > 0) {
    const up = await uploadPublic("benefits", file);
    if (!up.ok) return { ok: false, error: up.error };
    imagePath = up.path;
  }
  try {
    const id = await asUser(ctx.user, async (tx) => {
      const row = {
        partner_id: v.partnerId, slug: v.slug, title: v.title, summary: v.summary, description: v.description || null, rules: v.rules || null,
        category: v.category, audience_note: v.audienceNote || null, journey_scope: v.journeyScope, requires_active_member: v.requiresActiveMember,
        cities: v.cities, ufs: v.ufs.map((u) => u.toUpperCase()), polos: v.polos, starts_at: toTs(v.startsAt), ends_at: toTs(v.endsAt),
        per_member_limit: v.perMemberLimit, restock_on_expiry: v.restockOnExpiry, redemption_instructions: v.redemptionInstructions || null,
        mode: v.mode, generate_codes: v.generateCodes, code_ttl_hours: v.codeTtlHours, terms: v.terms || null,
        cancellation_policy: v.cancellationPolicy || null, visibility: v.visibility, status: v.status, is_health_related: v.isHealthRelated,
        ...(imagePath ? { image_path: imagePath } : {}),
      };
      let benefitId = v.id || "";
      if (benefitId) {
        // Estoque: ao mudar o total, o disponível acompanha a diferença (nunca abaixo de zero).
        const [cur] = await tx`select total_quantity, remaining_quantity from rtb.benefits where id = ${benefitId}`;
        if (!cur) throw new Error("benefit_not_found");
        const total = v.totalQuantity;
        const remaining = total === null ? null
          : cur.total_quantity === null ? total
          : Math.max(0, Math.min(total, (cur.remaining_quantity as number) + (total - (cur.total_quantity as number))));
        await tx`update rtb.benefits set ${tx({ ...row, total_quantity: total, remaining_quantity: remaining })} where id = ${benefitId}`;
      } else {
        const [r] = await tx`insert into rtb.benefits ${tx({ ...row, total_quantity: v.totalQuantity, remaining_quantity: v.totalQuantity, created_by: ctx.user.id })} returning id`;
        benefitId = r!.id as string;
      }
      await tx`insert into rtb.benefit_secrets (benefit_id, coupon_code, external_url) values (${benefitId}, ${v.couponCode || null}, ${v.externalUrl || null})
        on conflict (benefit_id) do update set coupon_code = excluded.coupon_code, external_url = excluded.external_url, updated_at = now()`;
      return benefitId;
    });
    revalidatePath("/os/beneficios");
    revalidatePath("/passport/beneficios");
    return { ok: true, message: "Benefício salvo.", data: { id } };
  } catch (e) {
    if (String((e as Error).message).includes("benefits_slug_key")) return { ok: false, error: "Já existe benefício com esse identificador." };
    return { ok: false, error: benefitError(e) };
  }
}

export async function setBenefitStatus(id: string, status: "DRAFT" | "PENDING" | "ACTIVE" | "PAUSED" | "ARCHIVED"): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Benefício inválido." };
  try {
    await asUser(ctx.user, (tx) => tx`update rtb.benefits set status = ${status} where id = ${id}`);
    revalidatePath("/os/beneficios");
    revalidatePath("/passport/beneficios");
    return { ok: true, message: "Status atualizado." };
  } catch (e) { return { ok: false, error: benefitError(e) }; }
}

export async function duplicateBenefit(id: string): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.duplicate_benefit(${id}) as id`);
    revalidatePath("/os/beneficios");
    return { ok: true, message: "Cópia criada como rascunho.", data: { id: r!.id } };
  } catch (e) { return { ok: false, error: benefitError(e) }; }
}

export async function loadCodes(benefitId: string, raw: string): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  const codes = raw.split(/[\n,;]+/).map((c) => c.trim()).filter((c) => c.length >= 4 && c.length <= 60).slice(0, 5000);
  if (!codes.length) return { ok: false, error: "Cole os códigos, um por linha." };
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.load_benefit_codes(${benefitId}, ${codes}) as n`);
    revalidatePath("/os/beneficios");
    return { ok: true, message: `${r!.n} código(s) novos carregados (repetidos são ignorados).` };
  } catch (e) { return { ok: false, error: benefitError(e) }; }
}

export async function approveManual(redemptionId: string, code: string): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.approve_manual_redemption(${redemptionId}, ${code.trim() || null})`);
    after(() => processOutboxSoon());
    revalidatePath("/os/resgates");
    return { ok: true, message: "Resgate aprovado; o atleta recebe o código." };
  } catch (e) { return { ok: false, error: benefitError(e) }; }
}

export async function cancelRedemption(redemptionId: string, reason: string, returnStock: boolean): Promise<BenefitResult> {
  const ctx = await requireStaff("super_admin", "growth");
  if (reason.trim().length < 3) return { ok: false, error: "Escreva o motivo do cancelamento." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.cancel_redemption(${redemptionId}, ${reason.trim()}, ${returnStock})`);
    revalidatePath("/os/resgates");
    return { ok: true, message: "Resgate cancelado e registrado na auditoria." };
  } catch (e) { return { ok: false, error: benefitError(e) }; }
}
