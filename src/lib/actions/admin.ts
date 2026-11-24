"use server";

// Ações de administração do OS: regras, flags, provas alvo, feriados, modelos de e-mail, fila, papéis e LGPD.
// Cada ação confere o papel aqui (requireStaff), valida com zod e o banco confere de novo
// (RLS nas tabelas editáveis, funções rtb.* nas transições sensíveis e auditoria automática por gatilho).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type postgres from "postgres";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { asService, asUser, dbErrorCode } from "@/lib/db";
import { processOutbox } from "@/lib/email/outbox";
import type { OsResult } from "@/lib/actions/os";

type PgError = { code?: string; message?: string };

const ERR: Record<string, string> = {
  forbidden: "Seu papel não permite esta ação.",
  not_authenticated: "Sua sessão expirou. Entre de novo.",
  last_super_admin: "Não é possível remover o último super_admin.",
  role_not_active: "Este papel já estava revogado.",
  request_not_found: "Pedido não encontrado.",
};

function fail(e: unknown, messages: { duplicate?: string; missing?: string } = {}): OsResult {
  const pg = (e ?? {}) as PgError;
  if (pg.code === "23505") return { ok: false, error: messages.duplicate ?? "Já existe um registro igual." };
  if (pg.code === "23503") return { ok: false, error: messages.missing ?? "Registro relacionado não encontrado." };
  if (pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22008") {
    return { ok: false, error: "Algum campo está fora do formato aceito. Confira e tente de novo." };
  }
  const known = ERR[dbErrorCode(e).split(":")[0]!];
  if (known) return { ok: false, error: known };
  if (pg.code === "42501") return { ok: false, error: ERR.forbidden! };
  console.error("[os/admin] erro:", pg.message);
  return { ok: false, error: "Não foi possível concluir. Tente de novo." };
}

const no = (error: string): OsResult => ({ ok: false, error });

const Uuid = z.uuid();
const OptDate = z.iso.date().or(z.literal(""));
const ConfigKey = z.string().regex(/^[a-z0-9_.]{3,80}$/);

// ── Regras (program_settings) ────────────────────────────────────────────────

// A coordenação técnica só edita estas famílias de regra (o RLS confere o mesmo prefixo).
const TECH_PREFIXES = ["internal_rule", "ranking", "next", "sla"];

// Campos que as funções do banco leem com cast (::int, ::numeric, ::boolean): um texto ali quebraria a triagem.
type FieldRule = { kind: "int" | "num" | "bool" | "text"; min?: number; max?: number };
const KNOWN_FIELDS: Record<string, Record<string, FieldRule>> = {
  internal_rule: {
    marathon_margin_seconds: { kind: "int", min: 0, max: 3600 },
    half_margin_seconds: { kind: "int", min: 0, max: 1800 },
    min_weekly_sessions: { kind: "int", min: 1, max: 14 },
  },
  "internal_rule.recency": { recent_mark_months: { kind: "int", min: 1, max: 60 } },
  sla: {
    almost_business_days: { kind: "int", min: 1, max: 30 },
    skip_optional_holidays: { kind: "bool" },
    timezone: { kind: "text" },
  },
  next: { reassessment_days: { kind: "int", min: 7, max: 365 } },
  ranking: {
    riegel_exponent: { kind: "num", min: 1, max: 1.2 },
    on_route_pct: { kind: "num", min: 0, max: 30 },
    safe_margin_pct: { kind: "num", min: 0, max: 30 },
    rounding_decimals: { kind: "int", min: 0, max: 4 },
  },
  privacy: { health_retention_months: { kind: "int", min: 1, max: 120 }, policy_version: { kind: "text" } },
  commercial: { member_extra_fee: { kind: "num", min: 0, max: 100000 }, next_is_separate_plan: { kind: "bool" }, road_requires_elite_plan: { kind: "bool" } },
};

function checkKnownFields(key: string, value: Record<string, unknown>): string | null {
  const rules = KNOWN_FIELDS[key];
  if (!rules) return null;
  for (const [field, rule] of Object.entries(rules)) {
    if (!(field in value)) continue;
    const v = value[field];
    if (rule.kind === "bool" && typeof v !== "boolean") return `“${field}” precisa ser true ou false.`;
    if (rule.kind === "text" && typeof v !== "string") return `“${field}” precisa ser um texto entre aspas.`;
    if (rule.kind === "int" || rule.kind === "num") {
      if (typeof v !== "number" || !Number.isFinite(v) || (rule.kind === "int" && !Number.isInteger(v))) {
        return `“${field}” precisa ser um número${rule.kind === "int" ? " inteiro" : ""}, sem aspas.`;
      }
      if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
        return `“${field}” precisa ficar entre ${rule.min} e ${rule.max}.`;
      }
    }
  }
  return null;
}

const Setting = z.object({
  key: ConfigKey,
  value: z.string().trim().min(2).max(20000),
  status: z.enum(["approved", "proposed", "pending"]),
});

export async function saveSetting(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin", "technical_director");
  const p = Setting.safeParse(raw);
  if (!p.success) return no("Confira o valor e o status da regra.");
  const { key, status } = p.data;
  if (!hasRole(ctx, "super_admin") && !TECH_PREFIXES.includes(key.split(".")[0]!)) {
    return no("A coordenação técnica edita só as regras internal_rule, ranking, next e sla.");
  }
  let value: unknown;
  try {
    value = JSON.parse(p.data.value);
  } catch {
    return no("O valor não é um JSON válido. Confira vírgulas, aspas e chaves.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return no("O valor precisa ser um objeto JSON, entre chaves { }.");
  const bad = checkKnownFields(key, value as Record<string, unknown>);
  if (bad) return no(bad);
  try {
    const rows = await asUser(ctx.user, (tx) => tx`
      update rtb.program_settings
      set value = ${tx.json(value as postgres.JSONValue)}, status = ${status}, updated_by = ${ctx.user.id}, updated_at = now()
      where key = ${key}
      returning key`);
    if (!rows.length) return no("Regra não encontrada ou fora do que seu papel pode editar.");
    revalidatePath("/os/configuracoes");
    revalidatePath("/os/testes");
    revalidatePath("/os/rankings");
    return { ok: true, message: "Regra salva, com auditoria." };
  } catch (e) {
    return fail(e);
  }
}

// ── Flags ────────────────────────────────────────────────────────────────────

export async function setFlag(key: string, enabled: boolean): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  if (!ConfigKey.safeParse(key).success || typeof enabled !== "boolean") return no("Flag inválido.");
  // Não existe API da Running confirmada: ligar o flag não cria integração nenhuma.
  if (key === "running_integration" && enabled) {
    return no("Não existe API da Running confirmada. Este flag fica desligado até a integração existir de verdade.");
  }
  try {
    if (key === "ranking_public" && enabled) {
      const [s] = await asUser(ctx.user, (tx) => tx`select status from rtb.program_settings where key = 'ranking'`);
      if (s?.status !== "approved") {
        return no("O ranking público só liga depois que a fórmula for aprovada pelo Lucas (Regras › ranking com status “approved”).");
      }
    }
    const rows = await asUser(ctx.user, (tx) => tx`
      update rtb.feature_flags set enabled = ${enabled}, updated_by = ${ctx.user.id}, updated_at = now()
      where key = ${key} returning key`);
    if (!rows.length) return no("Flag não encontrado.");
    revalidatePath("/os", "layout");
    return { ok: true, message: enabled ? "Flag ligado." : "Flag desligado." };
  } catch (e) {
    return fail(e);
  }
}

// ── Provas alvo ──────────────────────────────────────────────────────────────

const Race = z.object({
  id: Uuid,
  name: z.string().trim().min(3).max(120),
  raceDate: OptDate,
  raceDateConfirmed: z.boolean(),
  enrollmentDeadline: OptDate,
  deadlineConfirmed: z.boolean(),
  sixteenWeeksChecked: z.boolean(),
  status: z.enum(["provisional", "confirmed", "archived"]),
  officialUrl: z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/).or(z.literal("")),
  notes: z.string().trim().max(1000),
});

export async function saveRace(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin", "technical_director");
  const p = Race.safeParse(raw);
  if (!p.success) return no("Confira o nome (3 a 120 caracteres), as datas e o link oficial (começa com https://).");
  const v = p.data;
  if (v.raceDateConfirmed && !v.raceDate) return no("Para confirmar a data, preencha a data da prova.");
  if (v.deadlineConfirmed && !v.enrollmentDeadline) return no("Para confirmar o prazo, preencha o prazo de inscrição.");
  if ((v.raceDateConfirmed || v.deadlineConfirmed || v.status === "confirmed") && !v.officialUrl) {
    return no("Data ou prazo só entram como confirmados com o link da fonte oficial da prova.");
  }
  if (v.status === "confirmed" && !v.raceDateConfirmed) return no("Prova confirmada precisa da data confirmada.");
  if (v.raceDate && v.enrollmentDeadline && v.enrollmentDeadline > v.raceDate) return no("O prazo de inscrição não pode ser depois da prova.");
  try {
    const rows = await asUser(ctx.user, (tx) => tx`
      update rtb.target_races set
        name = ${v.name}, race_date = ${v.raceDate || null}, race_date_confirmed = ${v.raceDateConfirmed},
        enrollment_deadline = ${v.enrollmentDeadline || null}, deadline_confirmed = ${v.deadlineConfirmed},
        sixteen_weeks_checked = ${v.sixteenWeeksChecked}, status = ${v.status}, official_url = ${v.officialUrl || null},
        notes = ${v.notes || null}
      where id = ${v.id}
      returning id`);
    if (!rows.length) return no("Prova não encontrada ou fora do seu papel.");
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Prova salva. O site público atualiza em até 5 minutos." };
  } catch (e) {
    return fail(e);
  }
}

// ── Feriados ─────────────────────────────────────────────────────────────────

const Holiday = z.object({
  day: z.iso.date(),
  label: z.string().trim().min(3).max(80),
  kind: z.enum(["national", "optional", "local"]),
});

export async function addHoliday(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  const p = Holiday.safeParse(raw);
  if (!p.success) return no("Preencha a data e o nome do feriado (3 a 80 caracteres).");
  try {
    await asUser(ctx.user, (tx) => tx`insert into rtb.business_holidays (day, label, kind) values (${p.data.day}, ${p.data.label}, ${p.data.kind})`);
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Feriado incluído. Vale para os próximos prazos de SLA." };
  } catch (e) {
    return fail(e, { duplicate: "Já existe um feriado nessa data." });
  }
}

export async function removeHoliday(day: string): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  if (!z.iso.date().safeParse(day).success) return no("Data inválida.");
  try {
    const rows = await asUser(ctx.user, (tx) => tx`delete from rtb.business_holidays where day = ${day} returning day`);
    if (!rows.length) return no("Feriado não encontrado.");
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Feriado removido." };
  } catch (e) {
    return fail(e);
  }
}

// ── Modelos de e-mail ────────────────────────────────────────────────────────

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

function varsOf(...texts: (string | null | undefined)[]) {
  const found = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(VAR_RE)) found.add(m[1]!);
  return found;
}

const Template = z.object({
  key: z.string().regex(/^[a-z0-9_]{3,60}$/),
  subject: z.string().trim().min(3).max(160),
  preheader: z.string().trim().max(200),
  body: z.string().trim().min(10).max(8000),
  ctaLabel: z.string().trim().max(40),
  // Caminho interno: começa com uma barra só (//site.com viraria link externo).
  ctaPath: z.string().trim().max(300).regex(/^\/(?![/\\])[^\s]*$/).or(z.literal("")),
  active: z.boolean(),
});

export async function saveTemplate(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin", "growth");
  const p = Template.safeParse(raw);
  if (!p.success) return no("Confira assunto (3 a 160 caracteres), corpo (10 ou mais) e o caminho do botão (começa com /).");
  const v = p.data;
  if (!!v.ctaLabel !== !!v.ctaPath) return no("O botão precisa de texto e caminho (ou deixe os dois vazios).");
  try {
    const out = await asUser(ctx.user, async (tx): Promise<OsResult> => {
      const [cur] = await tx`select subject, preheader, body from rtb.message_templates where key = ${v.key}`;
      if (!cur) return no("Modelo não encontrado.");
      // Só variáveis que este modelo de fato recebe (as do texto atual e as já usadas na fila).
      const allowed = varsOf(cur.subject, cur.preheader, cur.body);
      const seen = await tx`select distinct jsonb_object_keys(variables) as k from rtb.email_outbox
        where template_key = ${v.key} and jsonb_typeof(variables) = 'object'`;
      for (const s of seen) allowed.add(String(s.k));
      const unknown = [...varsOf(v.subject, v.preheader, v.body)].filter((x) => !allowed.has(x));
      if (unknown.length) {
        const list = [...allowed].sort().map((x) => `{{${x}}}`).join(", ");
        return no(`Este modelo não recebe ${unknown.map((x) => `{{${x}}}`).join(", ")}. Variáveis disponíveis: ${list || "nenhuma"}.`);
      }
      const rows = await tx`
        update rtb.message_templates set subject = ${v.subject}, preheader = ${v.preheader || null}, body = ${v.body},
          cta_label = ${v.ctaLabel || null}, cta_path = ${v.ctaPath || null}, active = ${v.active},
          updated_by = ${ctx.user.id}, updated_at = now()
        where key = ${v.key} returning key`;
      return rows.length ? { ok: true, message: v.active ? "Modelo salvo. Vale para os próximos e-mails." : "Modelo salvo e inativo: nenhum e-mail novo usa este modelo." }
        : no("Seu papel não pode editar este modelo.");
    });
    if (out.ok) revalidatePath("/os/comunicacoes");
    return out;
  } catch (e) {
    return fail(e);
  }
}

// ── Fila de e-mails ──────────────────────────────────────────────────────────

export async function processOutboxNow(): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  if (!hasRole(ctx, "super_admin")) return no(ERR.forbidden!);
  try {
    // processOutbox usa service_role (reserva com SKIP LOCKED) e não envia nada sem a integração configurada.
    const r = await processOutbox(20);
    revalidatePath("/os/comunicacoes");
    if (r.skipped) {
      return { ok: true, message: "Integração de e-mail pendente: nada foi enviado. As mensagens continuam na fila (queued).", data: r };
    }
    return {
      ok: true,
      message: `Lote processado: ${r.processed} na vez, ${r.accepted} aceitos pelo provedor, ${r.failed} com falha (voltam para a fila com espera).`,
      data: r,
    };
  } catch (e) {
    return fail(e);
  }
}

// ── Papéis ───────────────────────────────────────────────────────────────────

const ROLES = ["super_admin", "growth", "technical_director", "coach", "commercial", "membership_verifier", "partner_operator"] as const;

const Grant = z.object({
  account: z.string().trim().min(3).max(254),
  role: z.enum(ROLES),
  scopePolo: z.string().trim().max(80),
  partnerId: Uuid.or(z.literal("")),
  displayName: z.string().trim().max(80),
  note: z.string().trim().min(3).max(500),
});

export async function grantRole(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  if (!hasRole(ctx, "super_admin")) return no(ERR.forbidden!);
  const p = Grant.safeParse(raw);
  if (!p.success) return no("Informe o e-mail da conta, o papel e uma observação (3 ou mais caracteres).");
  const v = p.data;
  if (v.role === "partner_operator" && !v.partnerId) return no("Operador de parceiro precisa do parceiro.");
  if (v.displayName && v.displayName.length < 2) return no("O nome de exibição precisa de 2 ou mais caracteres.");

  let userId: string | null = null;
  let loginBaseUnavailable = false;
  if (Uuid.safeParse(v.account).success) {
    userId = v.account.toLowerCase();
  } else {
    const email = z.email().safeParse(v.account);
    if (!email.success) return no("Use o e-mail da conta (ou o ID da conta).");
    try {
      // Única leitura da base de login: só depois de confirmar super_admin, só para achar o id ao dar um papel.
      const [u] = await asService((tx) => tx`select rtb.user_id_by_email(${email.data}) as id`);
      userId = (u?.id as string | null | undefined) ?? null;
    } catch (e) {
      if ((e as PgError).code !== "42501") return fail(e);
      loginBaseUnavailable = true;
      console.warn("[os/admin] service_role sem SELECT em auth.users; busca feita só em rtb.profiles.");
    }
    if (!userId) {
      try {
        const [prof] = await asUser(ctx.user, (tx) => tx`
          select user_id from rtb.profiles where lower(email::text) = lower(${email.data}) and deleted_at is null limit 1`);
        userId = (prof?.user_id as string | undefined) ?? null;
      } catch (e) {
        return fail(e);
      }
    }
  }
  if (!userId) {
    return no(loginBaseUnavailable
      ? "Não achamos uma conta com Passport com esse e-mail (a base de login não está liberada para busca neste banco). Use o ID da conta."
      : "Não achamos uma conta com esse e-mail. Peça para a pessoa entrar uma vez no site e tente de novo.");
  }
  try {
    await asUser(ctx.user, async (tx) => {
      await tx`select rtb.grant_role(${userId}, ${v.role}, ${v.scopePolo || null}, ${v.role === "partner_operator" ? v.partnerId : null}, ${v.note})`;
      if (v.displayName) {
        await tx`insert into rtb.staff_directory (user_id, display_name, active) values (${userId}, ${v.displayName}, true)
          on conflict (user_id) do update set display_name = excluded.display_name, active = true`;
      }
    });
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Papel concedido, com auditoria." };
  } catch (e) {
    return fail(e, { duplicate: "Essa pessoa já tem esse papel ativo (com o mesmo escopo).", missing: "Conta ou parceiro não encontrado." });
  }
}

export async function revokeRole(roleId: string, note: string): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  if (!Uuid.safeParse(roleId).success) return no("Papel inválido.");
  const n = typeof note === "string" ? note.trim() : "";
  if (n.length < 3) return no("Escreva o motivo da revogação (3 ou mais caracteres).");
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.revoke_role(${roleId}, ${n.slice(0, 500)})`);
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Papel revogado. O histórico continua na auditoria." };
  } catch (e) {
    return fail(e);
  }
}

// ── LGPD ─────────────────────────────────────────────────────────────────────

const DataRequest = z.object({
  id: Uuid,
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "REJECTED"]),
  response: z.string().trim().max(2000),
});

export async function handleDataRequest(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  const p = DataRequest.safeParse(raw);
  if (!p.success) return no("Escolha o status e escreva a resposta (até 2000 caracteres).");
  const v = p.data;
  if ((v.status === "DONE" || v.status === "REJECTED") && v.response.length < 5) {
    return no("Para concluir ou recusar, escreva a resposta ao atleta (ela aparece no Passport).");
  }
  try {
    await asUser(ctx.user, (tx) => tx`select rtb.handle_data_request(${v.id}, ${v.status}, ${v.response || null})`);
    revalidatePath("/os/configuracoes");
    return { ok: true, message: "Pedido atualizado e atleta avisado." };
  } catch (e) {
    return fail(e);
  }
}

const Anonymize = z.object({ userId: Uuid, requestId: Uuid, confirm: z.literal("ANONIMIZAR") });

export async function anonymizeAthlete(raw: unknown): Promise<OsResult> {
  const ctx = await requireStaff("super_admin");
  const p = Anonymize.safeParse(raw);
  if (!p.success) return no("Digite ANONIMIZAR para confirmar.");
  const userId = p.data.userId.toLowerCase();
  try {
    const out = await asUser(ctx.user, async (tx): Promise<OsResult> => {
      const [r] = await tx`select user_id, kind, status from rtb.data_requests where id = ${p.data.requestId}`;
      if (!r || String(r.user_id).toLowerCase() !== userId) return no("Pedido não encontrado para este atleta.");
      if (r.kind !== "DELETION") return no("Anonimização só a partir de um pedido de exclusão.");
      if (r.status === "DONE" || r.status === "REJECTED") return no("Este pedido já foi encerrado.");
      await tx`select rtb.anonymize_athlete(${userId}, ${p.data.requestId})`;
      return { ok: true, message: "Dados pessoais anonimizados. O histórico técnico ficou sem identificação direta." };
    });
    if (out.ok) revalidatePath("/os", "layout");
    return out;
  } catch (e) {
    return fail(e);
  }
}
