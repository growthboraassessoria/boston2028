import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3530";
  const indexable = process.env.SITE_INDEXABLE === "1";
  return {
    rules: indexable
      ? [{ userAgent: "*", allow: "/", disallow: ["/passport", "/os", "/api", "/login", "/cadastro", "/auth", "/v"] }]
      : [{ userAgent: "*", disallow: "/" }],
    sitemap: indexable ? `${site}/sitemap.xml` : undefined,
  };
}
