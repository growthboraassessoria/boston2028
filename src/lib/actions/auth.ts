"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authDriver, LOCAL_SESSION_COOKIE, signLocalSession, type SessionUser } from "@/lib/auth/session";
import { afterSignIn } from "@/lib/server/after-sign-in";
import { withinRateLimit as allowed } from "@/lib/server/rate-limit";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; devCode?: string; error?: string; info?: string };

const Email = z.email({ error: "Informe um e-mail válido." }).max(254).transform((v) => v.trim().toLowerCase());
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

export async function requestLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  // Robôs preenchem o campo escondido.
  if (String(form.get("website") ?? "") !== "") return { step: "email", error: "Não foi possível enviar agora." };
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  const email = parsed.data;
  const emailKey = createHash("sha256").update(email).digest("base64url").slice(0, 32);
  if (!(await allowed(`otp:email:${emailKey}`, 5, 900)) || !(await allowed(`otp:ip:${await ipBucket()}`, 30, 900))) {
    return { step: "email", email, error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  if (authDriver() === "local") {
    const { localRequestCode } = await import("@/lib/auth/local-otp");
    const { code } = await localRequestCode(email);
    return { step: "code", email, devCode: code, info: "Ambiente de desenvolvimento: o código aparece aqui em vez de ir por e-mail." };
  }

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const next = safeNext(form.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${site}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("[auth] signInWithOtp:", error.status, error.code);
    return { step: "email", email, error: "Não conseguimos enviar o código agora. Tente de novo em instantes." };
  }
  return { step: "code", email, info: "Enviamos um código de 6 números para o seu e-mail. Ele também traz um link de acesso." };
}

export async function verifyLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = Email.safeParse(form.get("email"));
  const code = Code.safeParse(String(form.get("code") ?? "").replace(/\D/g, ""));
  if (!email.success) return { step: "email", error: "Informe o e-mail novamente." };
  if (!code.success) return { step: "code", email: email.data, error: code.error.issues[0]?.message };
  if (!(await allowed(`verify:ip:${await ipBucket()}`, 40, 900))) {
    return { step: "code", email: email.data, error: "Muitas tentativas. Aguarde alguns minutos." };
  }

  let user: SessionUser | null = null;
  if (authDriver() === "local") {
    const { localVerifyCode } = await import("@/lib/auth/local-otp");
    user = await localVerifyCode(email.data, code.data);
    if (user) {
      (await cookies()).set(LOCAL_SESSION_COOKIE, signLocalSession(user), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7,
      });
    }
  } else {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
    if (!error && data.user) user = { id: data.user.id, email: data.user.email ?? email.data };
  }
  if (!user) return { step: "code", email: email.data, error: "Código inválido ou vencido. Peça um novo código." };

  const target = await afterSignIn(user, safeNext(form.get("next")));
  redirect(target);
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
