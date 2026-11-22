"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authDriver, LOCAL_SESSION_COOKIE } from "@/lib/auth/session";
import { cpfDigits, isValidCpf, passwordProblem } from "@/lib/cpf";
import { afterSignIn } from "@/lib/server/after-sign-in";
import { withinRateLimit as allowed } from "@/lib/server/rate-limit";

export type LoginState = { error?: string; cpf?: string };
export type AccountState = { error?: string; field?: "cpf" | "email" | "password" | "confirm"; cpf?: string; email?: string };
export type ResetState =
  | { step: "identify"; error?: string; cpf?: string; email?: string }
  | { step: "code"; cpf: string; devCode?: string; info?: string; error?: string };

const Email = z.email({ error: "Informe um e-mail válido." }).max(254);
const Code = z.string().regex(/^\d{6}$/, { error: "O código tem 6 números." });

function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "/passport";
}

async function ipBucket() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`rtb:${ip}`).digest("base64url").slice(0, 32);
}

const key = (v: string) => createHash("sha256").update(v).digest("base64url").slice(0, 32);
const str = (form: FormData, k: string) => String(form.get(k) ?? "");
const bot = (form: FormData) => str(form, "website") !== "";

/** Entrar: CPF + senha. */
export async function signInAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const cpf = cpfDigits(str(form, "cpf"));
  const password = str(form, "password");
  if (bot(form)) return { cpf, error: "Não foi possível entrar agora." };
  if (!isValidCpf(cpf)) return { cpf, error: "Confira o CPF: os números não formam um CPF válido." };
  if (!password) return { cpf, error: "Digite sua senha." };
  if (!(await allowed(`login:cpf:${key(cpf)}`, 8, 900)) || !(await allowed(`login:ip:${await ipBucket()}`, 40, 900))) {
    return { cpf, error: "Muitas tentativas. Aguarde 15 minutos ou crie uma nova senha em “Esqueci minha senha”." };
  }
  const { signInWithCpf } = await import("@/lib/auth/password");
  const user = await signInWithCpf(cpf, password);
  if (!user) return { cpf, error: "CPF ou senha incorretos." };
  redirect(await afterSignIn(user, safeNext(form.get("next"))));
}

/** Criar conta: CPF + e-mail + senha. Depois segue para o cadastro do Passport. */
export async function createAccountAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const cpf = cpfDigits(str(form, "cpf"));
  const emailRaw = str(form, "email").trim().toLowerCase();
  const password = str(form, "password");
  const confirm = str(form, "confirm");
  const back = { cpf, email: emailRaw };
  if (bot(form)) return { ...back, error: "Não foi possível criar a conta agora." };
  if (!isValidCpf(cpf)) return { ...back, field: "cpf", error: "Confira o CPF: os números não formam um CPF válido." };
  const email = Email.safeParse(emailRaw);
  if (!email.success) return { ...back, field: "email", error: "Informe um e-mail válido." };
  const weak = passwordProblem(password);
  if (weak) return { ...back, field: "password", error: weak };
  if (password !== confirm) return { ...back, field: "confirm", error: "As duas senhas não são iguais." };
  if (!(await allowed(`signup:ip:${await ipBucket()}`, 10, 900)) || !(await allowed(`signup:cpf:${key(cpf)}`, 5, 900))) {
    return { ...back, error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  const { createAccount } = await import("@/lib/auth/password");
  const r = await createAccount(cpf, email.data, password);
  if (!r.ok) {
    switch (r.reason) {
      case "cpf_taken":
        return { ...back, field: "cpf", error: "Este CPF já tem cadastro. Entre com sua senha ou use “Esqueci minha senha”." };
      case "email_taken":
        return { ...back, field: "email", error: "Este e-mail já tem uma conta BORA. Use a mesma senha dessa conta, ou outro e-mail." };
      case "email_other_cpf":
        return { ...back, field: "email", error: "Este e-mail já está ligado a outro CPF. Entre com aquele CPF." };
      case "weak_password":
        return { ...back, field: "password", error: "Senha fraca. Use uma senha mais longa, com letras, números e um símbolo." };
      default:
        return { ...back, error: "Não conseguimos criar a conta agora. Tente de novo em instantes." };
    }
  }
  // Sem perfil de atleta ainda: afterSignIn manda para o cadastro do Passport.
  redirect(await afterSignIn(r.user, safeNext(form.get("next"))));
}

/** Esqueci a senha, passo 1: CPF + e-mail da conta. */
export async function requestResetAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const cpf = cpfDigits(str(form, "cpf"));
  const emailRaw = str(form, "email").trim().toLowerCase();
  if (bot(form)) return { step: "identify", cpf, email: emailRaw, error: "Não foi possível agora." };
  if (!isValidCpf(cpf)) return { step: "identify", cpf, email: emailRaw, error: "Confira o CPF: os números não formam um CPF válido." };
  const email = Email.safeParse(emailRaw);
  if (!email.success) return { step: "identify", cpf, email: emailRaw, error: "Informe o e-mail da sua conta." };
  if (!(await allowed(`reset:cpf:${key(cpf)}`, 3, 900)) || !(await allowed(`reset:ip:${await ipBucket()}`, 20, 900))) {
    return { step: "identify", cpf, email: emailRaw, error: "Muitos pedidos. Aguarde 15 minutos e tente de novo." };
  }
  const { requestPasswordReset } = await import("@/lib/auth/password");
  const r = await requestPasswordReset(cpf, email.data);
  if (!r.ok) {
    return {
      step: "identify", cpf, email: emailRaw,
      error: r.reason === "email_unavailable"
        ? "O envio de e-mails ainda não está ativo. Fale com a equipe BORA para trocar a senha."
        : "Não conseguimos enviar o e-mail agora. Tente de novo em instantes.",
    };
  }
  return {
    step: "code", cpf,
    devCode: r.devCode,
    info: r.devCode
      ? "Ambiente de desenvolvimento: o código aparece aqui em vez de ir por e-mail."
      : "Se o CPF e o e-mail forem de uma conta, enviamos um código de 6 números para esse e-mail. Ele vale por 15 minutos.",
  };
}

/** Esqueci a senha, passo 2: código + senha nova. */
export async function confirmResetAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const cpf = cpfDigits(str(form, "cpf"));
  const code = Code.safeParse(str(form, "code").replace(/\D/g, ""));
  const password = str(form, "password");
  const confirm = str(form, "confirm");
  if (!isValidCpf(cpf)) return { step: "identify", error: "Comece de novo informando o CPF." };
  if (!code.success) return { step: "code", cpf, error: code.error.issues[0]?.message };
  const weak = passwordProblem(password);
  if (weak) return { step: "code", cpf, error: weak };
  if (password !== confirm) return { step: "code", cpf, error: "As duas senhas não são iguais." };
  if (!(await allowed(`reset-verify:ip:${await ipBucket()}`, 40, 900))) {
    return { step: "code", cpf, error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const { confirmPasswordReset } = await import("@/lib/auth/password");
  const r = await confirmPasswordReset(cpf, code.data, password);
  if (!r.ok) {
    return {
      step: "code", cpf,
      error: r.reason === "invalid_code" ? "Código inválido ou vencido. Peça um novo código."
        : r.reason === "weak_password" ? "Senha fraca. Use uma senha mais longa, com letras, números e um símbolo."
        : "Não conseguimos trocar a senha agora. Tente de novo em instantes.",
    };
  }
  redirect(await afterSignIn(r.user, "/passport"));
}

export async function signOut() {
  if (authDriver() === "local") {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  } else {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
