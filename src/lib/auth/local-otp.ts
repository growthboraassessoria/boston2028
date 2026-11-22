// Login local de DESENVOLVIMENTO: substitui o e-mail do Supabase Auth por um código mostrado na tela.
// Só existe com AUTH_DRIVER=local e fora da Vercel (authDriver() recusa). Usa o esquema auth do stub local.
import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { authDriver } from "./session";

function hashCode(email: string, code: string) {
  return createHmac("sha256", process.env.LOCAL_AUTH_SECRET ?? "").update(`${email}:${code}`).digest("hex");
}

function assertLocal() {
  if (authDriver() !== "local") throw new Error("local_auth_disabled");
}

export async function localRequestCode(email: string): Promise<{ code: string }> {
  assertLocal();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db().begin(async (tx) => {
    await tx`insert into auth.users (email, email_confirmed_at) values (${email}, null) on conflict (email) do nothing`;
    await tx`insert into auth.dev_otp (email, code_hash, attempts, expires_at)
             values (${email}, ${hashCode(email, code)}, 0, now() + interval '10 minutes')
             on conflict (email) do update set code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now()`;
  });
  return { code };
}

export async function localVerifyCode(email: string, code: string): Promise<{ id: string; email: string } | null> {
  assertLocal();
  return db().begin(async (tx) => {
    const [row] = await tx`select code_hash, attempts, expires_at from auth.dev_otp where email = ${email} for update`;
    if (!row) return null;
    if (row.attempts >= 5 || new Date(row.expires_at) < new Date()) {
      await tx`delete from auth.dev_otp where email = ${email}`;
      return null;
    }
    const a = Buffer.from(row.code_hash, "hex");
    const b = Buffer.from(hashCode(email, code), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await tx`update auth.dev_otp set attempts = attempts + 1 where email = ${email}`;
      return null;
    }
    await tx`delete from auth.dev_otp where email = ${email}`;
    const [u] = await tx`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now()
                          where email = ${email} returning id, email`;
    return u ? { id: u.id as string, email: u.email as string } : null;
  });
}
