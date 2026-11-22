import type { NextConfig } from "next";

// Páginas públicas são estáticas (sem nonce possível): CSP sem scripts externos, sem frames e sem objetos.
// Passport, OS e login recebem CSP com nonce no proxy (src/proxy.ts).
const dev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publicCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  serverExternalPackages: ["postgres"],
  // Comprovantes vão até 10 MB (o padrão das Server Actions é 1 MB).
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/((?!passport|os|cadastro|login|auth|api|sair|sem-acesso|v/).*)",
        headers: [{ key: "Content-Security-Policy", value: publicCsp }],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
