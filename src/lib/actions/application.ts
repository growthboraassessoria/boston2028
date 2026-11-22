"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { asUser, dbErrorCode } from "@/lib/db";
import { uploadPrivate } from "@/lib/storage";
import { POLICY_VERSION } from "@/lib/validation/profile";
import { processOutboxSoon } from "@/lib/email/outbox";

const IdemKey = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);

const ApplicationInput = z.object({
  idempotencyKey: IdemKey,
  targetChoice: z.enum(["RACE", "NONE"], { error: "Escolha a prova alvo (ou 'nenhuma por enquanto')." }),
  targetRaceId: z.uuid().optional().or(z.literal("")),
  hasMark: z.enum(["yes", "no"], { error: "Informe se você tem marca recente." }),
  markDistance: z.enum(["MARATHON", "HALF"]).optional(),
  markSeconds: z.number().int().min(3300).max(32400).optional(),
  markDate: z.iso.date().optional().or(z.literal("")),
  markRaceName: z.string().trim().max(120).optional(),
  sessions4plus: z.enum(["yes", "no"], { error: "Responda sobre a frequência de treinos." }),
  injury: z.enum(["yes", "no"], { error: "Responda sobre lesão em tratamento." }),
  healthConsent: z.literal(true, { error: "Precisamos do seu consentimento para usar essa resposta de saúde na triagem." }),
  availabilityNote: z.string().trim().max(500).optional(),
}).superRefine((v, ctx) => {
  if (v.targetChoice === "RACE" && !v.targetRaceId) ctx.addIssue({ code: "custom", path: ["targetRaceId"], message: "Escolha uma das provas alvo." });
  if (v.hasMark === "yes") {
    if (!v.markDistance) ctx.addIssue({ code: "custom", path: ["markDistance"], message: "Maratona ou meia?" });
    if (!v.markSeconds) ctx.addIssue({ code: "custom", path: ["markSeconds"], message: "Informe o tempo." });
    if (!v.markDate) ctx.addIssue({ code: "custom", path: ["markDate"], message: "Informe a data da prova." });
  }
});

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const ERRORS: Record<string, string> = {
  application_already_submitted: "Você já tem uma candidatura neste ciclo. Acompanhe por aqui.",
  rate_limited: "Muitas tentativas seguidas. Aguarde alguns minutos.",
  profile_required: "Complete seu cadastro antes da candidatura.",
  cycle_not_open: "As candidaturas deste ciclo não estão abertas.",
  invalid_target_race: "Prova alvo inválida. Escolha de novo.",
  incomplete_answers: "Responda todas as perguntas.",
  incomplete_mark: "Complete os dados da sua marca.",
  health_consent_required: "Precisamos do seu consentimento para a pergunta de saúde.",
};

export async function submitApplication(raw: unknown, proof: FormData | null): Promise<ActionResult> {
  const user = await requireUser("/passport/candidatura");
  const parsed = ApplicationInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Confira as respostas destacadas.", fieldErrors };
  }
  const v = parsed.data;
  let appId: string;
  try {
    appId = await asUser(user, async (tx) => {
      await tx`select rtb.record_consents(${tx.json([{ purpose: "health_data", granted: true }])}, ${POLICY_VERSION})`;
      const [r] = await tx`select rtb.submit_application(${tx.json({
        target_choice: v.targetChoice, target_race_id: v.targetChoice === "RACE" ? v.targetRaceId : null,
        has_mark: v.hasMark === "yes", mark_distance: v.hasMark === "yes" ? v.markDistance : null,
        mark_seconds: v.hasMark === "yes" ? v.markSeconds : null, mark_date: v.hasMark === "yes" ? v.markDate : null,
        mark_race_name: v.hasMark === "yes" ? v.markRaceName ?? null : null,
        sessions_4plus: v.sessions4plus === "yes", injury_in_treatment: v.injury === "yes",
        availability_note: v.availabilityNote ?? null,
      })}, ${v.idempotencyKey}) as r`;
      return (r!.r as { application_id: string }).application_id;
    });
  } catch (e) {
    const code = dbErrorCode(e);
    return { ok: false, error: ERRORS[code] ?? "Não conseguimos enviar agora. Tente de novo." };
  }

  // Comprovante opcional (não bloqueia a candidatura se falhar).
  const file = proof?.get("proof");
  let proofWarning: string | undefined;
  if (file instanceof File && file.size > 0) {
    const up = await uploadPrivate(user, "docs", file, ["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (up.ok) {
      await asUser(user, (tx) => tx`select rtb.add_my_document(${appId}, 'MARK_PROOF', ${up.path}, ${up.mime}, ${up.size}, ${file.name})`).catch(() => {
        proofWarning = "Candidatura enviada, mas o comprovante não foi salvo. Envie de novo pela candidatura.";
      });
    } else {
      proofWarning = `Candidatura enviada. O comprovante não foi aceito: ${up.error}`;
    }
  }
  after(() => processOutboxSoon());
  revalidatePath("/passport", "layout");
  return { ok: true, message: proofWarning };
}

export async function respondInfoRequest(requestId: string, response: string, proof: FormData | null): Promise<ActionResult> {
  const user = await requireUser("/passport/candidatura");
  if (!z.uuid().safeParse(requestId).success) return { ok: false, error: "Pedido inválido." };
  const text = String(response ?? "").trim();
  if (text.length < 2 || text.length > 4000) return { ok: false, error: "Escreva sua resposta (até 4.000 caracteres)." };
  let docId: string | null = null;
  const file = proof?.get("proof");
  if (file instanceof File && file.size > 0) {
    const up = await uploadPrivate(user, "docs", file, ["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!up.ok) return { ok: false, error: up.error };
    const [row] = await asUser(user, (tx) => tx`
      select rtb.add_my_document((select application_id from rtb.info_requests where id = ${requestId}), 'INFO_RESPONSE',
        ${up.path}, ${up.mime}, ${up.size}, ${file.name}) as id`);
    docId = row!.id as string;
  }
  try {
    await asUser(user, (tx) => tx`select rtb.respond_info_request(${requestId}, ${text}, ${docId})`);
  } catch (e) {
    const code = dbErrorCode(e);
    return { ok: false, error: code === "request_not_open" ? "Esse pedido já foi respondido." : "Não conseguimos enviar agora." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Resposta enviada para a coordenação técnica." };
}

export async function withdrawApplication(applicationId: string, reason: string): Promise<ActionResult> {
  const user = await requireUser("/passport/candidatura");
  if (!z.uuid().safeParse(applicationId).success) return { ok: false, error: "Candidatura inválida." };
  try {
    await asUser(user, (tx) => tx`select rtb.withdraw_application(${applicationId}, ${String(reason ?? "").slice(0, 300)})`);
  } catch {
    return { ok: false, error: "Não foi possível retirar a candidatura agora." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Candidatura retirada. Seu histórico continua no Passport." };
}

export async function acceptJourney(enrollmentId: string): Promise<ActionResult> {
  const user = await requireUser("/passport/jornada");
  if (!z.uuid().safeParse(enrollmentId).success) return { ok: false, error: "Convite inválido." };
  try {
    await asUser(user, (tx) => tx`select rtb.accept_journey(${enrollmentId})`);
  } catch (e) {
    const code = dbErrorCode(e);
    return { ok: false, error: code === "active_membership_required" ? "O aceite exige matrícula ativa confirmada pela equipe." : "Não foi possível aceitar agora." };
  }
  after(() => processOutboxSoon());
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Bem-vindo! Sua jornada começou." };
}

export async function declineJourney(enrollmentId: string, reason: string): Promise<ActionResult> {
  const user = await requireUser("/passport/jornada");
  if (!z.uuid().safeParse(enrollmentId).success) return { ok: false, error: "Convite inválido." };
  try {
    await asUser(user, (tx) => tx`select rtb.decline_journey(${enrollmentId}, ${String(reason ?? "").slice(0, 300)})`);
  } catch {
    return { ok: false, error: "Não foi possível registrar agora." };
  }
  revalidatePath("/passport", "layout");
  return { ok: true, message: "Registramos sua decisão. A coordenação pode conversar com você." };
}
