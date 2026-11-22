// Proxy (Next 16): nas áreas com dado pessoal (Passport, OS, login, cadastro, APIs) aplica CSP com nonce,
// proíbe cache e renova a sessão do Supabase. Quem não tem sessão vai para o login.
// Não decide permissão: o servidor confere o papel no banco e o RLS filtra cada linha.
import { NextResponse, type NextRequest } from "next/server";

const PRIVATE = ["/passport", "/os", "/cadastro", "/login", "/auth", "/api", "/sair", "/sem-acesso", "/v"];
const NEEDS_SESSION = ["/passport", "/os"];

function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}${dev ? " ws: wss:" : ""}`.trim(),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PRIVATE.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);

  let res = NextResponse.next({ request: { headers } });
  let signedIn = false;

  if (process.env.AUTH_DRIVER === "local") {
    signedIn = !!req.cookies.get("rtb_dev_session")?.value; // a assinatura é conferida no servidor
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { refreshSupabaseSession } = await import("@/lib/supabase/proxy");
    const out = await refreshSupabaseSession(req, res, headers);
    res = out.response;
    signedIn = out.signedIn;
  }

  if (!signedIn && NEEDS_SESSION.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    const r = NextResponse.redirect(url);
    r.headers.set("Content-Security-Policy", policy);
    return r;
  }

  res.headers.set("Content-Security-Policy", policy);
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|brand/|offline).*)"],
};
