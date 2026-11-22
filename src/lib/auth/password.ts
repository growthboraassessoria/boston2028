// Login com CPF + senha. Dois motores, como a sessão:
//  · supabase (produção): a senha mora no Supabase Auth. A conta é criada pelo servidor (chave de serviço),
//    porque o cadastro público do Auth fica fechado (o projeto é dividido com o BORA OS).
//  · local (desenvolvimento e testes): bcrypt em auth.users.encrypted_password do stub. Recusado na Vercel.
// O CPF fica em rtb.login_identities (um por conta). Só o servidor procura conta pelo CPF.
// Só servidor: nunca exportar daqui para um arquivo "use server".
import "server-only";
import { cookies } from "next/headers";
import { randomInt } from "node:crypto";
import { asService, db } from "@/lib/db";
import { authDriver, LOCAL_SESSION_COOKIE, signLocalSession, type SessionUser } from "./session";

export type CreateResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "cpf_taken" | "email_taken" | "email_other_cpf" | "weak_password" | "failed"; detail?: string };

const RESET_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

async function admin() {
  const { createSupabaseAdmin } = await import("@/lib/supabase/server");
  return createSupabaseAdmin();
}

async function userIdByCpf(cpf: string): Promise<string | null> {
  const [r] = await asService((tx) => tx`select user_id from rtb.login_identities where cpf = ${cpf}`);
  return (r?.user_id as string | undefined) ?? null;
}

async function emailOf(userId: string): Promise<string | null> {
  if (authDriver() === "local") {
    const [u] = await db()`select email from auth.users where id = ${userId}`;
    return (u?.email as string | undefined) ?? null;
  }
  const { data, error } = await (await admin()).auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

async function linkCpf(userId: string, cpf: string): Promise<"ok" | "cpf_taken" | "email_other_cpf"> {
  return asService(async (tx) => {
    const [mine] = await tx`select cpf from rtb.login_identities where user_id = ${userId}`;
    if (mine) return mine.cpf === cpf ? "ok" : "email_other_cpf";
    const ins = await tx`insert into rtb.login_identities (user_id, cpf) values (${userId}, ${cpf}) on conflict do nothing returning user_id`;
    return ins.length ? "ok" : "cpf_taken";
  });
}

async function startLocalSession(user: SessionUser) {
  (await cookies()).set(LOCAL_SESSION_COOKIE, signLocalSession(user), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}

/** Entra com e-mail + senha no Supabase Auth e grava os cookies da sessão. */
async function supabaseSignIn(email: string, password: string): Promise<SessionUser | null> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? email };
}

function isWeak(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "weak_password" || /password/i.test(e.message ?? "") && /(weak|short|least|character)/i.test(e.message ?? ""));
}

/** Cria a conta (ou liga o CPF a uma conta BORA que já existe, se a senha conferir) e abre a sessão. */
export async function createAccount(cpf: string, email: string, password: string): Promise<CreateResult> {
  if (await userIdByCpf(cpf)) return { ok: false, reason: "cpf_taken" };

  if (authDriver() === "local") {
    const [existing] = await db()`select id, email, encrypted_password is not null as has_pw,
        encrypted_password = extensions.crypt(${password}, encrypted_password) as pw_ok
      from auth.users where lower(email) = ${email}`;
    let user: SessionUser;
    if (existing) {
      if (!existing.pw_ok) return { ok: false, reason: "email_taken" };
      user = { id: existing.id as string, email: existing.email as string };
    } else {
      const [u] = await db()`insert into auth.users (email, email_confirmed_at, encrypted_password)
        values (${email}, now(), extensions.crypt(${password}, extensions.gen_salt('bf', 10))) returning id, email`;
      user = { id: u!.id as string, email: u!.email as string };
    }
    const link = await linkCpf(user.id, cpf);
    if (link !== "ok") {
      if (!existing) await db()`delete from auth.users where id = ${user.id}`;
      return { ok: false, reason: link };
    }
    await startLocalSession(user);
    return { ok: true, user };
  }

  const sb = await admin();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { rtb_passport: true } });
  if (error || !data.user) {
    if (isWeak(error)) return { ok: false, reason: "weak_password", detail: error?.message };
    const taken = error?.code === "email_exists" || /already (been )?registered|already exists/i.test(error?.message ?? "");
    if (!taken) {
      console.error("[auth] createUser:", error?.status, error?.code);
      return { ok: false, reason: "failed" };
    }
    // A pessoa já tem conta BORA com este e-mail (por exemplo, a equipe): só liga o CPF se a senha for a mesma.
    const user = await supabaseSignIn(email, password);
    if (!user) return { ok: false, reason: "email_taken" };
    const link = await linkCpf(user.id, cpf);
    if (link !== "ok") {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      await (await createSupabaseServerClient()).auth.signOut();
      return { ok: false, reason: link };
    }
    return { ok: true, user };
  }

  const link = await linkCpf(data.user.id, cpf);
  if (link !== "ok") {
    await sb.auth.admin.deleteUser(data.user.id);
    return { ok: false, reason: link };
  }
  const user = await supabaseSignIn(email, password);
  if (!user) return { ok: false, reason: "failed" };
  return { ok: true, user };
}

/** CPF + senha. Abre a sessão e devolve o usuário, ou null (sem dizer qual dos dois errou). */
export async function signInWithCpf(cpf: string, password: string): Promise<SessionUser | null> {
  if (authDriver() === "local") {
    const [u] = await db()`select u.id, u.email from rtb.login_identities li join auth.users u on u.id = li.user_id
      where li.cpf = ${cpf} and u.deleted_at is null and u.encrypted_password is not null
        and u.encrypted_password = extensions.crypt(${password}, u.encrypted_password)`;
    if (!u) return null;
    const user = { id: u.id as string, email: u.email as string };
    await db()`update auth.users set last_sign_in_at = now() where id = ${user.id}`;
    await startLocalSession(user);
    return user;
  }
  const userId = await userIdByCpf(cpf);
  if (!userId) return null;
  const email = await emailOf(userId);
  if (!email) return null;
  return supabaseSignIn(email, password);
}

export type ResetRequest =
  | { ok: true; matched: boolean; devCode?: string }
  | { ok: false; reason: "email_unavailable" | "failed" };

/**
 * Esqueci a senha, passo 1: confere CPF + e-mail. Se baterem, gera um código de 6 números (vale 15 min)
 * e envia para o e-mail da conta. A resposta para a tela é a mesma nos dois casos (não revela quem tem conta).
 */
export async function requestPasswordReset(cpf: string, email: string): Promise<ResetRequest> {
  const local = authDriver() === "local";
  const { emailConfigured, sendViaResend } = await import("@/lib/email/outbox");
  if (!local && !emailConfigured()) return { ok: false, reason: "email_unavailable" };

  const userId = await userIdByCpf(cpf);
  const accountEmail = userId ? await emailOf(userId) : null;
  if (!userId || !accountEmail || accountEmail.toLowerCase() !== email) return { ok: true, matched: false };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await asService((tx) => tx`
    insert into rtb.password_resets (user_id, code_hash, attempts, expires_at)
    values (${userId}, extensions.crypt(${code}, extensions.gen_salt('bf', 8)), 0, now() + make_interval(mins => ${RESET_MINUTES}))
    on conflict (user_id) do update set code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now()`);

  if (local) return { ok: true, matched: true, devCode: code };

  const { renderEmail } = await import("@/lib/email/render");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const mail = renderEmail({
    key: "password_reset",
    subject: "Seu código para criar uma nova senha",
    preheader: "Código válido por 15 minutos.",
    body: "Recebemos um pedido para criar uma nova senha no seu Boston Passport.\n\nSeu código: {{code}}\n\nEle vale por 15 minutos. Se não foi você, ignore este e-mail: sua senha continua a mesma.",
    cta_label: "Criar nova senha",
    cta_path: "/login/esqueci",
  }, { code }, site);
  const sent = await sendViaResend(accountEmail, mail.subject, mail.html, mail.text, `rtb-reset-${userId}-${Date.now()}`);
  if (!sent.ok) {
    console.error("[auth] reset e-mail:", sent.error);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, matched: true };
}

export type ResetConfirm =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid_code" | "weak_password" | "failed"; detail?: string };

/** Esqueci a senha, passo 2: CPF + código + senha nova. Troca a senha e já abre a sessão. */
export async function confirmPasswordReset(cpf: string, code: string, password: string): Promise<ResetConfirm> {
  const userId = await userIdByCpf(cpf);
  if (!userId) return { ok: false, reason: "invalid_code" };

  const valid = await asService(async (tx) => {
    const [r] = await tx`select code_hash = extensions.crypt(${code}, code_hash) as ok, attempts, expires_at < now() as expired
      from rtb.password_resets where user_id = ${userId} for update`;
    if (!r) return false;
    if (r.expired || r.attempts >= RESET_MAX_ATTEMPTS) {
      await tx`delete from rtb.password_resets where user_id = ${userId}`;
      return false;
    }
    if (!r.ok) {
      await tx`update rtb.password_resets set attempts = attempts + 1 where user_id = ${userId}`;
      return false;
    }
    return true;
  });
  if (!valid) return { ok: false, reason: "invalid_code" };

  const email = await emailOf(userId);
  if (!email) return { ok: false, reason: "failed" };

  if (authDriver() === "local") {
    await db()`update auth.users set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf', 10)), updated_at = now()
      where id = ${userId}`;
  } else {
    const { error } = await (await admin()).auth.admin.updateUserById(userId, { password });
    if (error) {
      if (isWeak(error)) return { ok: false, reason: "weak_password", detail: error.message };
      console.error("[auth] updateUserById:", error.status, error.code);
      return { ok: false, reason: "failed" };
    }
  }
  // O código só some depois que a senha foi trocada (se a troca falhar, a pessoa tenta de novo com o mesmo código).
  await asService((tx) => tx`delete from rtb.password_resets where user_id = ${userId}`);

  const user = authDriver() === "local" ? { id: userId, email } : await supabaseSignIn(email, password);
  if (!user) return { ok: false, reason: "failed" };
  if (authDriver() === "local") await startLocalSession(user);
  return { ok: true, user };
}
