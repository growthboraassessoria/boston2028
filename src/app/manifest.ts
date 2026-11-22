import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boston Passport · BORA Road to Boston 2028",
    short_name: "Passport",
    description: "Seu passaporte do projeto Road to Boston 2028 da BORA.",
    id: "/passport",
    start_url: "/passport",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#071c3c",
    theme_color: "#071c3c",
    lang: "pt-BR",
    categories: ["sports", "health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
