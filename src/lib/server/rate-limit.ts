// Limite de tentativas guardado no banco (rtb.hit_rate_limit), usado pelas ações do servidor.
import "server-only";
import { authDriver } from "@/lib/auth/session";
import { asService } from "@/lib/db";

export async function withinRateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  // Só com o login local (proibido na Vercel), para desenvolvimento e testes automatizados.
  if (process.env.RTB_RATE_LIMIT_OFF === "1" && authDriver() === "local") return true;
  const [r] = await asService((tx) => tx`select rtb.hit_rate_limit(${bucket}, ${max}, ${windowSeconds}) as ok`);
  return !!r?.ok;
}
