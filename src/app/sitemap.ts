import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3530";
  return ["", "/projeto", "/criterios", "/calculadora", "/calendario", "/faq", "/privacidade", "/termos"].map((p) => ({
    url: `${site}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.6,
  }));
}
