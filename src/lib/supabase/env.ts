// Supabase: URL e chave pública (publishable nova ou anon legada). A service role nunca passa por aqui.
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e a chave pública (PUBLISHABLE ou ANON) são obrigatórias no modo supabase.");
  return { url, key };
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
