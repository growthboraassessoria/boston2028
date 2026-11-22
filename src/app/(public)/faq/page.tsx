import type { Metadata } from "next";
import { FaqSection, FinalCta } from "@/components/landing/Sections";

export const metadata: Metadata = { title: "Perguntas frequentes" };

export default function FaqPage() {
  return (
    <>
      <FaqSection intro />
      <FinalCta />
    </>
  );
}
