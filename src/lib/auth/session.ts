// Sessão do usuário no servidor (o login com CPF + senha está em ./password.ts). Dois motores:
//  · supabase (produção): Supabase Auth (senha); claims verificadas com getClaims().
//  · local (só desenvolvimento e testes): senha bcrypt no stub e cookie assinado. Recusado na Vercel.
// O resto do app só enxerga { id, email } e passa isso ao banco (asUser), onde o RLS decide.
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { asUser } from "@/lib/db";

export type SessionUser = { id: string; email: string };

export const LOCAL_SESSION_COOKIE = "rtb_dev_session";

export function authDriver(): "supabase" | "local" {
  const d = process.env.AUTH_DRIVER === "local" ? "local" : "supabase";
  if (d === "local" && (process.env.VERCEL || process.env.VERCEL_ENV)) {
    throw new Error("AUTH_DRIVER=local é proibido na Vercel.");
  }
  return d;
}

function localSecret(): string {
  const s = process.env.LOCAL_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("LOCAL_AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return s;
}

export function signLocalSession(user: SessionUser, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", localSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyLocalSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", localSecret()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & { exp: number };
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: data.id, email: data.email };
  } catch {
    return null;
  }
}

/** Usuário da requisição atual (ou null). Memorizado por requisição. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (authDriver() === "local") {
    const jar = await cookies();
    return verifyLocalSession(jar.get(LOCAL_SESSION_COOKIE)?.value);
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: String(data.claims.sub), email: String(data.claims.email ?? "") };
});

export async function requireUser(next = "/passport"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export type StaffRole = "super_admin" | "growth" | "technical_director" | "coach" | "commercial" | "membership_verifier" | "partner_operator";

export type StaffContext = { user: SessionUser; roles: { role: StaffRole; scopePolo: string | null; partnerId: string | null }[] };

/** Papéis vindos do banco (nunca de claim do cliente). */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const rows = await asUser(user, (tx) => tx`
    select role, scope_polo, partner_id from rtb.user_roles where user_id = ${user.id} and revoked_at is null`);
  if (!rows.length) return null;
  return { user, roles: rows.map((r) => ({ role: r.role as StaffRole, scopePolo: r.scope_polo, partnerId: r.partner_id })) };
});

export function hasRole(ctx: StaffContext | null, ...roles: StaffRole[]) {
  return !!ctx && ctx.roles.some((r) => roles.includes(r.role));
}

export async function requireStaff(...roles: StaffRole[]): Promise<StaffContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/os");
  const ctx = await getStaffContext();
  if (!ctx || (roles.length > 0 && !hasRole(ctx, ...roles))) redirect("/sem-acesso");
  return ctx;
}
