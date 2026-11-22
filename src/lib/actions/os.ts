"use server";

// Ações da equipe. Cada uma confere o papel aqui (requireStaff) e o banco confere de novo (funções + RLS).
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireStaff, type StaffRole } from "@/lib/auth/session";
import { asUser, dbErrorCode } from "@/lib/db";
import { processOutboxSoon } from "@/lib/email/outbox";

export type OsResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const ERR: Record<string, string> = {
  forbidden: "Seu papel não permite esta ação.",
  forbidden_technical_decision: "Só a coordenação técnica (papel technical_director) registra decisões.",
  forbidden_scope: "Este atleta está fora do seu escopo de polo.",
  invalid_transition: "Esta transição não é permitida a partir do status atual.",
  no_change: "Nada muda com esta decisão.",
  reason_required: "Escreva o motivo (mínimo 5 caracteres).",
  next_step_required: "Defina o próximo passo.",
  message_required_for_info_request: "Escreva a pergunta para o atleta.",
  idempotency_key_required: "Recarregue a página e tente de novo.",
  note_required: "Escreva uma observação.",
  no_active_journey: "O atleta não tem jornada ativa.",
  won_requires_verified_enrollment: "“Ganho” só com matrícula verificada pela equipe de vínculo.",
  not_a_coach: "A pessoa escolhida não tem o papel de treinador.",
  date_in_past: "A data não pode estar no passado.",
  last_super_admin: "Não é possível remover o último super_admin.",
  rate_limited: "Muitas tentativas. Aguarde um pouco.",
};

function fail(e: unknown): OsResult {
  const code = dbErrorCode(e);
  const base = code.split(":")[0]!;
  if (!ERR[base]) console.error("[os] erro:", (e as Error).message);
  return { ok: false, error: ERR[base] ?? "Não foi possível concluir. Tente de novo." };
}

async function staff(...roles: StaffRole[]) {
  return requireStaff(...roles);
}

const Uuid = z.uuid();
const Key = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);

// ── Análise técnica ──────────────────────────────────────────────────────────

const Decision = z.object({
  applicationId: Uuid,
  decision: z.enum(["APPROVE_ROAD", "NOT_APPROVED", "FORWARD_NEXT", "REQUEST_INFO", "KEEP_MONITORING"]),
  reason: z.string().trim().min(5).max(4000),
  nextStep: z.string().trim().min(3).max(1000),
  nextStepOn: z.iso.date().optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional(),
  idempotencyKey: Key,
});

export async function recordDecision(raw: unknown): Promise<OsResult> {
  const ctx = await staff("technical_director");
  const p = Decision.safeParse(raw);
  if (!p.success) return { ok: false, error: "Preencha motivo (5+ caracteres) e próximo passo." };
  const v = p.data;
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.record_technical_decision(${v.applicationId}, ${v.decision}, ${v.reason},
      ${v.nextStep}, ${v.nextStepOn || null}, ${v.message || null}, ${v.idempotencyKey}) as r`);
    after(() => processOutboxSoon());
    revalidatePath(`/os/candidatos/${v.applicationId}`);
    revalidatePath("/os/triagem");
    return { ok: true, message: "Decisão registrada, com auditoria e aviso ao atleta.", data: r!.r };
  } catch (e) {
    return fail(e);
  }
}

export async function startReview(applicationId: string): Promise<OsResult> {
  const ctx = await staff("technical_director");
  if (!Uuid.safeParse(applicationId).success) return { ok: false, error: "Candidatura inválida." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.start_review(${applicationId})`);
    revalidatePath(`/os/candidatos/${applicationId}`);
    return { ok: true, message: "Análise iniciada." };
  } catch (e) { return fail(e); }
}

export async function addNote(applicationId: string, note: string): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach");
  if (!Uuid.safeParse(applicationId).success || note.trim().length < 2) return { ok: false, error: "Escreva a nota." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.add_review_note(${applicationId}, ${note.trim().slice(0, 4000)})`);
    revalidatePath(`/os/candidatos/${applicationId}`);
    return { ok: true, message: "Nota registrada." };
  } catch (e) { return fail(e); }
}

const Contact = z.object({
  applicationId: Uuid,
  channel: z.enum(["whatsapp", "phone", "email", "in_person", "other"]),
  outcome: z.enum(["reached", "no_answer", "left_message", "wrong_contact", "scheduled"]),
  note: z.string().trim().max(1000).optional(),
});

export async function recordContact(raw: unknown): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach", "commercial");
  const p = Contact.safeParse(raw);
  if (!p.success) return { ok: false, error: "Escolha canal e resultado." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.record_contact_attempt(${p.data.applicationId}, ${p.data.channel}, ${p.data.outcome}, ${p.data.note ?? null})`);
    revalidatePath(`/os/candidatos/${p.data.applicationId}`);
    revalidatePath("/os/triagem");
    return { ok: true, message: "Tentativa de contato registrada." };
  } catch (e) { return fail(e); }
}

// ── Vínculo e atribuições ────────────────────────────────────────────────────

const Verify = z.object({
  userId: Uuid,
  status: z.enum(["PENDENTE", "ATIVO_CONFIRMADO", "EX_ALUNO_CONFIRMADO", "NAO_ALUNO_CONFIRMADO", "DIVERGENCIA"]),
  note: z.string().trim().min(3).max(1000),
  externalMemberId: z.string().trim().max(80).optional(),
});

export async function verifyMember(raw: unknown): Promise<OsResult> {
  const ctx = await staff("membership_verifier", "super_admin");
  const p = Verify.safeParse(raw);
  if (!p.success) return { ok: false, error: "Escolha o status e escreva a origem da conferência (ex.: planilha da unidade)." };
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.verify_member_link(${p.data.userId}, ${p.data.status}, 'manual', ${p.data.note}, ${p.data.externalMemberId || null}) as r`);
    after(() => processOutboxSoon());
    revalidatePath("/os/alunos");
    revalidatePath("/os/candidatos", "layout");
    return { ok: true, message: "Vínculo atualizado. Acessos e jornadas foram recalculados.", data: r!.r };
  } catch (e) { return fail(e); }
}

export async function setPolo(userId: string, polo: string): Promise<OsResult> {
  const ctx = await staff("super_admin", "technical_director", "membership_verifier");
  if (!Uuid.safeParse(userId).success) return { ok: false, error: "Atleta inválido." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.set_athlete_polo(${userId}, ${polo.trim().slice(0, 80)})`);
    revalidatePath("/os/candidatos", "layout");
    return { ok: true, message: "Polo atualizado." };
  } catch (e) { return fail(e); }
}

export async function assignCoach(athleteId: string, coachId: string | null): Promise<OsResult> {
  const ctx = await staff("super_admin", "technical_director");
  if (!Uuid.safeParse(athleteId).success || (coachId && !Uuid.safeParse(coachId).success)) return { ok: false, error: "Seleção inválida." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.assign_coach(${athleteId}, ${coachId})`);
    revalidatePath("/os/candidatos", "layout");
    return { ok: true, message: coachId ? "Treinador atribuído." : "Atribuição removida." };
  } catch (e) { return fail(e); }
}

export async function setAutomationsPaused(userId: string, paused: boolean): Promise<OsResult> {
  const ctx = await staff("super_admin", "technical_director", "commercial", "growth");
  if (!Uuid.safeParse(userId).success) return { ok: false, error: "Atleta inválido." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.set_automations_paused(${userId}, ${paused})`);
    revalidatePath("/os/candidatos", "layout");
    return { ok: true, message: paused ? "Automações pausadas para este atleta." : "Automações retomadas." };
  } catch (e) { return fail(e); }
}

const Goal = z.object({
  userId: Uuid,
  goalId: Uuid.optional().or(z.literal("")),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  targetDistance: z.enum(["MARATHON", "HALF", "10K", "5K", "3K"]).optional().or(z.literal("")),
  targetSeconds: z.number().int().min(420).max(32400).optional(),
  dueOn: z.iso.date().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "ACHIEVED", "MISSED", "CANCELLED"]).optional(),
});

export async function saveGoal(raw: unknown): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach");
  const p = Goal.safeParse(raw);
  if (!p.success) return { ok: false, error: "Confira o título e os campos da meta." };
  const v = p.data;
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.save_training_goal(${v.goalId || null}, ${v.userId}, ${tx.json({
      title: v.title, description: v.description ?? null, target_distance: v.targetDistance || null,
      target_seconds: v.targetSeconds ?? null, due_on: v.dueOn || null, status: v.status ?? null,
    })})`);
    revalidatePath("/os/jornadas");
    revalidatePath("/os/candidatos", "layout");
    return { ok: true, message: "Meta salva e atleta avisado." };
  } catch (e) { return fail(e); }
}

export async function scheduleReassessment(userId: string, applicationId: string | null, date: string, reason: string): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach");
  if (!Uuid.safeParse(userId).success || !z.iso.date().safeParse(date).success) return { ok: false, error: "Data inválida." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.schedule_reassessment(${userId}, ${applicationId}, ${date}, ${reason.slice(0, 500)})`);
    after(() => processOutboxSoon());
    revalidatePath("/os/jornadas");
    return { ok: true, message: "Reavaliação agendada." };
  } catch (e) { return fail(e); }
}

export async function validateTestResult(resultId: string, status: "VALIDATED" | "REJECTED", note: string): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach");
  if (!Uuid.safeParse(resultId).success) return { ok: false, error: "Resultado inválido." };
  try {
    const [r] = await asUser(ctx.user, (tx) => tx`select rtb.validate_test_result(${resultId}, ${status}, ${note.slice(0, 500)}) as r`);
    revalidatePath("/os/testes");
    return { ok: true, message: status === "VALIDATED" ? "Resultado validado." : "Resultado não validado.", data: r!.r };
  } catch (e) { return fail(e); }
}

export async function awardBadge(userId: string, slug: string, note: string): Promise<OsResult> {
  const ctx = await staff("technical_director", "coach", "super_admin");
  if (!Uuid.safeParse(userId).success) return { ok: false, error: "Atleta inválido." };
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.award_badge(${userId}, ${slug}, ${"manual:" + Date.now()}, ${note.slice(0, 300)})`);
    return { ok: true, message: "Carimbo concedido." };
  } catch (e) { return fail(e); }
}

// ── Comercial ────────────────────────────────────────────────────────────────

const Opp = z.object({
  id: Uuid,
  status: z.enum(["OPEN", "CONTACTED", "NEGOTIATING", "WON", "LOST", "ON_HOLD"]),
  ownerId: Uuid.optional().or(z.literal("")),
  nextAction: z.string().trim().max(300).optional(),
  nextActionOn: z.iso.date().optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional(),
  lostReason: z.string().trim().max(300).optional(),
});

export async function updateOpportunity(raw: unknown): Promise<OsResult> {
  const ctx = await staff("commercial", "super_admin");
  const p = Opp.safeParse(raw);
  if (!p.success) return { ok: false, error: "Confira os campos." };
  const v = p.data;
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.update_opportunity(${v.id}, ${v.status}, ${v.ownerId || null}, ${v.nextAction ?? null},
      ${v.nextActionOn || null}, ${v.note ?? null}, ${v.lostReason ?? null})`);
    revalidatePath("/os/comercial");
    return { ok: true, message: "Oportunidade atualizada." };
  } catch (e) { return fail(e); }
}
