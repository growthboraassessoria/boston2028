"use server";

// Ações do atleta no Passport (perfil, privacidade, LGPD, notificações e testes).
// Sempre: sessão verificada no servidor → validação com zod → banco como o próprio usuário (RLS + funções do schema rtb).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { asUser, dbErrorCode } from "@/lib/db";
import { uploadPrivate, removePrivate } from "@/lib/storage";
import { validateMark, type Distance } from "@/lib/domain/time";
import { cepDigits } from "@/lib/domain/cep";
import { CepSchema, POLICY_VERSION, toE164, UF_LIST } from "@/lib/validation/profile";

export type AthleteResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

// ───────────────────────── Contato ─────────────────────────

const ContactInput = z.object({
  preferredName: z.string().trim().max(40, "Use até 40 caracteres.").optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Informe seu WhatsApp.").refine((v) => toE164(v) !== null, "Use DDD + número, ex.: (61) 99999-0000."),
  cep: CepSchema,
  city: z.string().trim().min(2, "Informe a cidade.").max(80, "Use até 80 caracteres."),
  uf: z.enum(UF_LIST, { error: "Escolha a UF." }),
});

/** Atualiza só os campos de contato. save_my_profile grava o perfil inteiro, então os demais campos vêm do próprio banco. */
export async function updateContact(raw: unknown): Promise<AthleteResult> {
  const user = await requireUser("/passport/perfil");
  const parsed = ContactInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fieldErrors: fieldErrorsOf(parsed.error) };
  const d = parsed.data;
  try {
    await asUser(user, async (tx) => {
      const [p] = await tx`
        select full_name, birth_date::text as birth_date, country, reference_category, category_note, origin_coach
        from rtb.profiles where user_id = ${user.id} and deleted_at is null`;
      if (!p) throw new Error("profile_required");
      await tx`select rtb.save_my_profile(${tx.json({
        full_name: p.full_name, preferred_name: d.preferredName || null, birth_date: p.birth_date,
        phone_e164: toE164(d.phone), cep: cepDigits(d.cep), city: d.city, uf: d.uf,
        country: p.country ?? "BR", reference_category: p.reference_category, category_note: p.category_note ?? null,
        origin_coach: p.origin_coach ?? null,
      })})`;
    });
  } catch (e) {
    if (/profiles_phone_unique|duplicate key/.test(e instanceof Error ? e.message : "")) {
      return { ok: false, error: "Esse WhatsApp já está em outro cadastro.", fieldErrors: { phone: "WhatsApp já cadastrado em outra conta." } };
    }
    if (/cep_required/.test(e instanceof Error ? e.message : "")) {
      return { ok: false, error: "Confira os campos destacados.", fieldErrors: { cep: "Informe o CEP com 8 números." } };
    }
    console.error("[athlete] contato:", dbErrorCode(e));
    return { ok: false, error: "Não conseguimos salvar agora. Tente de novo." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Dados de contato salvos." };
}

// ───────────────────────── Vínculo (autodeclaração) ─────────────────────────

const ClaimInput = z.object({
  membership: z.enum(["SIM_ATUAL", "NAO", "EX_ALUNO"], { error: "Escolha uma resposta." }),
  coachName: z.string().trim().max(120, "Use até 120 caracteres.").optional().or(z.literal("")),
  supportPoint: z.string().trim().max(120, "Use até 120 caracteres.").optional().or(z.literal("")),
  noPolo: z.boolean().optional(),
});

/** Guarda a resposta "Você já é aluno BORA?". Nunca libera nada: a equipe confirma o vínculo. */
export async function updateMembershipClaim(raw: unknown): Promise<AthleteResult> {
  const user = await requireUser("/passport/perfil");
  const parsed = ClaimInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Confira a resposta.", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  const isMember = v.membership === "SIM_ATUAL";
  const coach = isMember ? v.coachName || null : null;
  const point = isMember ? v.supportPoint || null : null;
  const noPolo = isMember && !!v.noPolo;
  let changed = true;
  try {
    await asUser(user, async (tx) => {
      const [last] = await tx`
        select answer, coach_name, support_point, no_polo from rtb.membership_claims
        where user_id = ${user.id} order by created_at desc limit 1`;
      if (last && last.answer === v.membership && (last.coach_name ?? null) === coach && (last.support_point ?? null) === point && !!last.no_polo === noPolo) {
        changed = false;
        return;
      }
      await tx`select rtb.save_membership_claim(${v.membership}, ${coach}, ${point}, ${noPolo})`;
    });
  } catch (e) {
    console.error("[athlete] vínculo:", dbErrorCode(e));
    return { ok: false, error: "Não conseguimos registrar agora. Tente de novo." };
  }
  if (!changed) return { ok: true, message: "Nada mudou na sua resposta." };
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Resposta registrada. A equipe da BORA confere o vínculo; seu acesso só muda depois dessa conferência." };
}

// ───────────────────────── Foto (com consentimento explícito) ─────────────────────────

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const AvatarInput = z.object({
  consent: z.literal("1", { error: "Marque a autorização para enviar a foto." }),
  avatar: z.instanceof(File, { error: "Escolha uma foto." }).refine((f) => f.size > 0, "Escolha uma foto."),
});

export async function uploadAvatar(form: FormData): Promise<AthleteResult> {
  const user = await requireUser("/passport/perfil");
  const parsed = AvatarInput.safeParse({ consent: form.get("consent"), avatar: form.get("avatar") });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return { ok: false, error: fieldErrors.consent ? "Para usar a foto, marque a autorização." : "Escolha uma foto.", fieldErrors };
  }
  const file = parsed.data.avatar;
  // Tipo real conferido pelos primeiros bytes; tamanho máximo de avatar aplicado em uploadPrivate.
  const up = await uploadPrivate(user, "avatar", file, [...AVATAR_TYPES]);
  if (!up.ok) {
    const error = up.error.startsWith("Formato") ? "Formato não aceito. Use uma foto JPG, PNG ou WEBP." : up.error;
    return { ok: false, error, fieldErrors: { avatar: error } };
  }
  let previous: string | null = null;
  try {
    await asUser(user, async (tx) => {
      const [p] = await tx`select avatar_path from rtb.profiles where user_id = ${user.id}`;
      previous = (p?.avatar_path as string | null) ?? null;
      // O consentimento vem junto com este envio e fica no histórico antes de a foto passar a valer.
      await tx`select rtb.record_consents(${tx.json([{ purpose: "avatar_use", granted: true }])}, ${POLICY_VERSION})`;
      await tx`select rtb.set_my_avatar(${up.path})`;
    });
    if (previous && previous !== up.path) await removePrivate(user.id, previous);
  } catch (e) {
    await removePrivate(user.id, up.path);
    const code = dbErrorCode(e);
    console.error("[athlete] foto:", code);
    return { ok: false, error: code === "avatar_consent_required" ? "Para usar a foto, marque a autorização." : "Não conseguimos salvar a foto agora. Tente de novo." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Foto atualizada no seu passaporte." };
}

export async function removeAvatar(): Promise<AthleteResult> {
  const user = await requireUser("/passport/perfil");
  try {
    const previous = await asUser(user, async (tx) => {
      const [p] = await tx`select avatar_path from rtb.profiles where user_id = ${user.id}`;
      await tx`select rtb.set_my_avatar(${null})`;
      return (p?.avatar_path as string | null) ?? null;
    });
    await removePrivate(user.id, previous);
  } catch (e) {
    console.error("[athlete] remover foto:", dbErrorCode(e));
    return { ok: false, error: "Não conseguimos remover a foto agora. Tente de novo." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Foto removida do passaporte." };
}

// ───────────────────────── Privacidade (consentimentos) ─────────────────────────

const PrivacyInput = z.object({
  public_profile: z.boolean(),
  ranking_public: z.boolean(),
  marketing_email: z.boolean(),
  marketing_whatsapp: z.boolean(),
  avatar_use: z.boolean(),
});

/** Grava só o que mudou (histórico limpo). Retirar o uso da foto também tira a foto do passaporte. */
export async function savePrivacy(raw: unknown): Promise<AthleteResult> {
  const user = await requireUser("/passport/configuracoes");
  const parsed = PrivacyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Preferências inválidas. Recarregue a página e tente de novo." };
  const wanted = parsed.data;
  let changes = 0;
  let avatarRemoved = false;
  let removedPath: string | null = null;
  try {
    await asUser(user, async (tx) => {
      const rows = await tx`
        select distinct on (purpose) purpose, granted from rtb.consents
        where user_id = ${user.id}
          and purpose in ('public_profile', 'ranking_public', 'marketing_email', 'marketing_whatsapp', 'avatar_use')
        order by purpose, created_at desc`;
      const current = new Map<string, boolean>(rows.map((r): [string, boolean] => [String(r.purpose), !!r.granted]));
      const items = (Object.keys(wanted) as (keyof typeof wanted)[])
        .filter((k) => (current.get(k) ?? false) !== wanted[k])
        .map((k) => ({ purpose: k, granted: wanted[k] }));
      changes = items.length;
      if (!items.length) return;
      await tx`select rtb.record_consents(${tx.json(items)}, ${POLICY_VERSION})`;
      if (items.some((i) => i.purpose === "avatar_use" && !i.granted)) {
        const [p] = await tx`select avatar_path from rtb.profiles where user_id = ${user.id}`;
        if (p?.avatar_path) {
          await tx`select rtb.set_my_avatar(${null})`;
          avatarRemoved = true;
          removedPath = p.avatar_path as string;
        }
      }
    });
  } catch (e) {
    console.error("[athlete] privacidade:", dbErrorCode(e));
    return { ok: false, error: "Não conseguimos salvar agora. Tente de novo." };
  }
  if (removedPath) await removePrivate(user.id, removedPath);
  if (!changes) return { ok: true, message: "Nada mudou nas suas preferências." };
  revalidatePath("/passport", "layout");
  return { ok: true, message: avatarRemoved ? "Preferências salvas. Sua foto saiu do passaporte." : "Preferências salvas." };
}

// ───────────────────────── Pedidos LGPD ─────────────────────────

const DataRequestInput = z.object({
  kind: z.enum(["ACCESS", "RECTIFICATION", "DELETION", "PORTABILITY", "OBJECTION"], { error: "Escolha o tipo de pedido." }),
  details: z.string().trim().max(2000, "Use até 2.000 caracteres.").optional().or(z.literal("")),
  confirmDeletion: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.kind === "RECTIFICATION" && (v.details ?? "").length < 5) {
    ctx.addIssue({ code: "custom", path: ["details"], message: "Conte o que precisa ser corrigido." });
  }
  if (v.kind === "OBJECTION" && (v.details ?? "").length < 5) {
    ctx.addIssue({ code: "custom", path: ["details"], message: "Conte qual uso dos seus dados você quer interromper." });
  }
  if (v.kind === "DELETION" && !v.confirmDeletion) {
    ctx.addIssue({ code: "custom", path: ["confirmDeletion"], message: "Confirme que entendeu o que acontece na exclusão." });
  }
});

export async function requestMyData(raw: unknown): Promise<AthleteResult> {
  const user = await requireUser("/passport/configuracoes");
  const parsed = DataRequestInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Confira o pedido.", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  let duplicate = false;
  try {
    await asUser(user, async (tx) => {
      const open = await tx`
        select 1 from rtb.data_requests
        where user_id = ${user.id} and kind = ${v.kind} and status in ('OPEN', 'IN_PROGRESS') limit 1`;
      if (open.length) {
        duplicate = true;
        return;
      }
      await tx`select rtb.request_data(${v.kind}, ${v.details || null})`;
    });
  } catch (e) {
    const code = dbErrorCode(e);
    if (code === "rate_limited") return { ok: false, error: "Você já fez vários pedidos hoje. Tente de novo amanhã." };
    console.error("[athlete] lgpd:", code);
    return { ok: false, error: "Não conseguimos registrar o pedido agora. Tente de novo." };
  }
  if (duplicate) return { ok: false, error: "Você já tem um pedido desse tipo em andamento. Acompanhe na lista abaixo." };
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Pedido registrado. A resposta chega nas suas notificações e fica na lista abaixo." };
}

// ───────────────────────── Notificações ─────────────────────────

const ReadInput = z.object({ ids: z.array(z.uuid()).min(1).max(200).optional() });

/** Sem ids: marca todas. O banco só mexe nas notificações do próprio usuário. */
export async function markNotificationsRead(raw: unknown): Promise<AthleteResult> {
  const user = await requireUser("/passport/notificacoes");
  const parsed = ReadInput.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: "Notificação inválida." };
  const ids = parsed.data.ids ?? null;
  let n = 0;
  try {
    const [row] = await asUser(user, (tx) => tx`select rtb.mark_notifications_read(${ids}::uuid[]) as n`);
    n = Number(row?.n ?? 0);
  } catch (e) {
    console.error("[athlete] notificações:", dbErrorCode(e));
    return { ok: false, error: "Não conseguimos atualizar agora. Tente de novo." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: ids ? undefined : n ? "Todas as notificações foram marcadas como lidas." : "Nada novo por aqui." };
}

// ───────────────────────── Resultado de teste ─────────────────────────

function distanceKey(meters: number | null): Distance | null {
  if (meters === 3000) return "3K";
  if (meters === 5000) return "5K";
  if (meters === 10000) return "10K";
  if (meters !== null && meters >= 21000 && meters <= 21200) return "HALF";
  if (meters === 42195) return "MARATHON";
  return null;
}

const TestInput = z.object({ testId: z.uuid(), seconds: z.number().int().min(420).max(32400) });

const TEST_ERRORS: Record<string, string> = {
  active_journey_required: "O envio de resultados abre com a jornada ativa e a matrícula confirmada pela equipe.",
  test_not_open: "Este teste não está aberto para envio.",
  result_already_validated: "Seu resultado neste teste já foi validado pela equipe técnica.",
  invalid_document: "O comprovante não foi aceito. Envie de novo.",
  rate_limited: "Muitos envios seguidos. Aguarde alguns minutos.",
};

export async function submitTestResult(raw: unknown, proof: FormData | null): Promise<AthleteResult> {
  const user = await requireUser("/passport/testes");
  const parsed = TestInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Confira o tempo informado.", fieldErrors: { seconds: "Informe um tempo válido." } };
  const { testId, seconds } = parsed.data;

  // Conferência amigável antes de subir arquivo (o banco confere tudo de novo no envio).
  const pre = await asUser(user, async (tx) => {
    const [t] = await tx`select distance_m, status from rtb.tests where id = ${testId}`;
    const [s] = await tx`select access_status, journey_status from rtb.athlete_states where user_id = ${user.id}`;
    return { t, s };
  }).catch((e: unknown) => {
    console.error("[athlete] teste (conferência):", dbErrorCode(e));
    return null;
  });
  if (!pre) return { ok: false, error: "Não conseguimos enviar agora. Tente de novo." };
  if (!pre.t) return { ok: false, error: "Teste não encontrado." };
  if (pre.s?.access_status !== "ACTIVE_MEMBER" || !["ROAD_TO_BOSTON", "BORA_NEXT"].includes(String(pre.s?.journey_status))) {
    return { ok: false, error: TEST_ERRORS.active_journey_required! };
  }
  if (pre.t.status !== "open") return { ok: false, error: TEST_ERRORS.test_not_open! };
  const key = distanceKey(pre.t.distance_m ?? null);
  const bad = key ? validateMark(key, seconds) : null;
  if (bad) return { ok: false, error: bad, fieldErrors: { seconds: bad } };

  let documentId: string | null = null;
  const file = proof?.get("proof");
  if (file instanceof File && file.size > 0) {
    const up = await uploadPrivate(user, "docs", file, ["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!up.ok) return { ok: false, error: `Comprovante não aceito: ${up.error}`, fieldErrors: { proof: up.error } };
    try {
      const [row] = await asUser(user, (tx) => tx`
        select rtb.add_my_document(${null}, 'OTHER', ${up.path}, ${up.mime}, ${up.size}, ${file.name.slice(0, 200)}) as id`);
      documentId = (row?.id as string | undefined) ?? null;
    } catch (e) {
      const code = dbErrorCode(e);
      return { ok: false, error: TEST_ERRORS[code] ?? "O comprovante não foi salvo. Tente de novo." };
    }
  }

  try {
    await asUser(user, (tx) => tx`select rtb.submit_test_result(${testId}, ${seconds}, ${documentId})`);
  } catch (e) {
    const code = dbErrorCode(e);
    if (!TEST_ERRORS[code]) console.error("[athlete] teste:", code);
    return { ok: false, error: TEST_ERRORS[code] ?? "Não conseguimos enviar agora. Tente de novo." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Resultado enviado. A equipe técnica valida e o retorno aparece aqui e nas notificações." };
}
