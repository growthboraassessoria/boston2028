// Sair (POST, para não ser acionado por link de terceiros).
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authDriver, LOCAL_SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return new NextResponse("Origem inválida", { status: 403 });
  if (authDriver() === "local") {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  } else {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    await (await createSupabaseServerClient()).auth.signOut();
  }
  return NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
}
