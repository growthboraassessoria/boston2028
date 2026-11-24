import type { Metadata } from "next";
import { getActiveStandards } from "@/lib/data/public";
import { Container, SectionHead, StandardsTable } from "@/components/landing/Sections";
import { IndexLab } from "@/components/landing/IndexLab";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Boston Index Lab",
  description: "Simule o índice da Boston Marathon 2028 para a sua faixa etária no dia da prova, com a tabela oficial da B.A.A.",
};

export default async function CalculadoraPage() {
  const version = await getActiveStandards();
  return (
    <>
      <section className="bg-night-950" data-hero>
        <Container className="py-14 sm:py-20">
          <SectionHead intro eyebrow="Boston Index Lab" title={<>Seu índice,<br />no dia da prova</>}
            lead="Simulação sem login. O resultado é preliminar: a régua interna da BORA é revisada por uma pessoa e o índice não garante inscrição." />
          <div className="mt-10" data-hero-item><IndexLab version={version} /></div>
        </Container>
      </section>
      <section aria-labelledby="tabela" className="bg-night-900">
        <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead id="tabela" eyebrow="Tabela vigente" title={<>Índices 2027<br />e 2028</>}
            lead="Os índices são os mesmos para 2027 e 2028, segundo a B.A.A. Usamos a tabela oficial, com a fonte e a data da consulta." />
          <StandardsTable version={version} />
        </Container>
      </section>
    </>
  );
}
