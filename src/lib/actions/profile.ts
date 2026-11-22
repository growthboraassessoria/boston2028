"use server";

import { redirect } from "next/navigation";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import { asUser, dbErrorCode } from "@/lib/db";
import { cepDigits } from "@/lib/domain/cep";
import { lookupCepServer } from "@/lib/server/cep";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { POLICY_VERSION, ProfileSchema, toE164 } from "@/lib/validation/profile";

export type ProfileResult = { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveProfile(raw: unknown): Promise<ProfileResult> {
  const user = await requireUser("/cadastro");
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Confira os campos destacados.", fieldErrors };
  }
  const d = parsed.data;
  try {
    await asUser(user, async (tx) => {
      await tx`select rtb.save_my_profile(${tx.json({
        full_name: d.fullName, preferred_name: d.preferredName || null, birth_date: d.birthDate, phone_e164: toE164(d.phone),
        cep: cepDigits(d.cep), city: d.city, uf: d.uf, country: "BR",
        reference_category: d.category, category_note: d.category === "OTHER" ? d.categoryNote || null : null,
        origin_coach: d.originCoach || null,
      })})`;
      await tx`select rtb.save_membership_claim(${d.membership}, ${d.coachName || null}, ${d.supportPoint || null}, ${!!d.noPolo})`;
      await tx`select rtb.record_consents(${tx.json([
        { purpose: "terms", granted: true }, { purpose: "privacy", granted: true },
        { purpose: "marketing_email", granted: d.marketingEmail }, { purpose: "marketing_whatsapp", granted: d.marketingWhatsapp },
      ])}, ${POLICY_VERSION})`;
    });
  } catch (e) {
    const code = dbErrorCode(e);
    if (/profiles_email_unique|profiles_phone_unique|duplicate key/.test(String((e as Error).message))) {
      return { ok: false, error: "Esse WhatsApp já está em outro cadastro. Use outro número ou fale com a BORA.", fieldErrors: { phone: "WhatsApp já cadastrado." } };
    }
    if (/cep_required/.test(String((e as Error).message))) {
      return { ok: false, error: "Confira os campos destacados.", fieldErrors: { cep: "Informe o CEP com 8 números." } };
    }
    console.error("[profile] save:", code);
    return { ok: false, error: "Não conseguimos salvar agora. Tente de novo." };
  }
  redirect("/passport?bemvindo=1");
}

export type CepResult =
  | { status: "found"; city: string; uf: string; street: string | null; neighborhood: string | null }
  | { status: "not_found" | "unavailable" | "invalid" | "limited" };

/**
 * Busca o endereço pelo CEP, no servidor (ViaCEP → BrasilAPI → OpenCEP; ver src/lib/domain/cep.ts).
 * Preenche cidade e UF, que o atleta pode corrigir. Exige sessão e tem limite por conta.
 */
export async function lookupCep(cep: string): Promise<CepResult> {
  const user = await getSessionUser();
  if (!user) return { status: "unavailable" };
  const digits = cepDigits(cep);
  if (!/^\d{8}$/.test(digits)) return { status: "invalid" };
  if (!(await withinRateLimit(`cep:${user.id}`, 40, 600))) return { status: "limited" };
  const out = await lookupCepServer(digits);
  if (out.status !== "found") return { status: out.status };
  const { city, uf, street, neighborhood } = out.address;
  return { status: "found", city, uf, street, neighborhood };
}
