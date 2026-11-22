import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import { RegisterSW } from "@/components/pwa/RegisterSW";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3530";
const INDEXABLE = process.env.SITE_INDEXABLE === "1";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Road to Boston 2028 · BORA", template: "%s · Road to Boston 2028" },
  description:
    "Seu próximo índice começa aqui. Projeto independente da BORA para atletas que querem buscar o índice da Boston Marathon 2028, com avaliação técnica, metas e o Boston Passport.",
  applicationName: "Boston Passport",
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "BORA · Road to Boston 2028",
    title: "Road to Boston 2028 · BORA",
    description: "Seu próximo índice começa aqui. Simule seu índice no Boston Index Lab e crie seu Boston Passport.",
  },
  appleWebApp: { capable: true, title: "Passport", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

// Zoom por pinça liberado (acessibilidade): sem maximum-scale nem user-scalable=no.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071c3c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
