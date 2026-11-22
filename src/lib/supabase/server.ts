// Cliente Supabase do servidor (Auth e Storage com a sessão do usuário). Cookies httpOnly.
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_OPTIONS, supabasePublicEnv } from "./env";

export async function createSupabaseServerClient() {
  const store = await cookies();
  const { url, key } = supabasePublicEnv();
  return createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
        } catch {
          // Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

/** Chave de serviço: só no servidor, só para Storage (upload já validado) e rotinas. */
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
