// Link do e-mail (Supabase): /auth/confirm?token_hash=…&type=email&next=/passport
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authDriver } from "@/lib/auth/session";
import { afterSignIn } from "@/lib/server/after-sign-in";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/passport";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/passport";
  const fail = new URL("/login?erro=link", url.origin);
  if (authDriver() !== "supabase" || !tokenHash || !type) return NextResponse.redirect(fail);

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return NextResponse.redirect(fail);
  const target = await afterSignIn({ id: data.user.id, email: data.user.email ?? "" }, next);
  return NextResponse.redirect(new URL(target, url.origin));
}
