// Renovação da sessão do Supabase no proxy (Next 16). Não decide acesso: isso é do servidor e do RLS.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, supabasePublicEnv } from "./env";

export async function refreshSupabaseSession(req: NextRequest, res: NextResponse, headers: Headers) {
  const { url, key } = supabasePublicEnv();
  let response = res;
  const supabase = createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
      },
    },
  });
  // getClaims() valida o JWT (chaves assimétricas: localmente) e renova o token quando necessário.
  const { data } = await supabase.auth.getClaims();
  return { response, signedIn: !!data?.claims?.sub };
}
