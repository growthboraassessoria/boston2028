// Identificador anônimo do visitante (cookie httpOnly). Liga simulações feitas antes do login à conta criada depois.
import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const ANON_COOKIE = "rtb_anon";
const VALID = /^[A-Za-z0-9_-]{16,64}$/;

export async function readAnonKey(): Promise<string | null> {
  const v = (await cookies()).get(ANON_COOKIE)?.value;
  return v && VALID.test(v) ? v : null;
}

/** Só em server action ou route handler (grava cookie). */
export async function getOrSetAnonKey(): Promise<string> {
  const existing = await readAnonKey();
  if (existing) return existing;
  const key = randomBytes(18).toString("base64url");
  (await cookies()).set(ANON_COOKIE, key, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180,
  });
  return key;
}
