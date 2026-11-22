import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Rotas de rotina: só com Authorization: Bearer CRON_SECRET (a Vercel Cron envia esse cabeçalho). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
