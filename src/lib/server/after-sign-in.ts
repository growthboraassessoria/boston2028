// Depois do login (código ou link): liga simulação anônima e origem (UTM) à conta e decide para onde ir.
// Só servidor: nunca exportar de um arquivo "use server" (viraria ação chamável pelo navegador).
import "server-only";
import { cookies } from "next/headers";
import { asService, asUser } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { readAnonKey } from "@/lib/server/anon";
import { readUtmCookie, UTM_COOKIE } from "@/lib/server/utm";

export async function afterSignIn(user: SessionUser, next: string): Promise<string> {
  const anon = await readAnonKey();
  const utm = await readUtmCookie();
  const hasProfile = await asUser(user, async (tx) => {
    if (anon) await tx`select rtb.claim_simulations(${anon})`;
    const [p] = await tx`select 1 as ok from rtb.profiles where user_id = ${user.id} and deleted_at is null`;
    return !!p;
  });
  if (utm) {
    await asService((tx) => tx`
      insert into rtb.utm_attributions (user_id, anon_key, touch, source, medium, campaign, term, content, referrer_host, landing_path, referral_code)
      select ${user.id}, ${anon}, 'signup', ${utm.source ?? null}, ${utm.medium ?? null}, ${utm.campaign ?? null}, ${utm.term ?? null},
             ${utm.content ?? null}, ${utm.referrer ?? null}, ${utm.landing ?? null}, ${utm.ref ?? null}
      where not exists (select 1 from rtb.utm_attributions where user_id = ${user.id} and touch = 'signup')`);
    (await cookies()).delete(UTM_COOKIE);
  }
  // Equipe entrando pelo OS não precisa de perfil de atleta (o OS confere o papel no banco).
  if (!hasProfile && !next.startsWith("/os")) return `/cadastro?next=${encodeURIComponent(next)}`;
  return next;
}

