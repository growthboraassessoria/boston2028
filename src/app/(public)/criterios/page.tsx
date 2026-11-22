import type { Metadata } from "next";
import { getActiveStandards, getRaces } from "@/lib/data/public";
import { Container, Criteria, IndexExplainer, SectionHead, StandardsTable } from "@/components/landing/Sections";

export const revalidate = 300;
export const metadata: Metadata = { title: "Critérios e provas alvo", description: "A régua interna da BORA, as provas alvo de 2027 e a tabela oficial de índices." };

export default async function CriteriosPage() {
  const [version, races] = await Promise.all([getActiveStandards(), getRaces()]);
  return (
    <>
      <Criteria races={races} intro />
      <IndexExplainer version={version} />
      <section aria-labelledby="tabela" className="bg-night-950">
        <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead id="tabela" eyebrow="Tabela oficial" title={<>Índices por<br />faixa etária</>} />
          <StandardsTable version={version} />
        </Container>
      </section>
    </>
  );
}
