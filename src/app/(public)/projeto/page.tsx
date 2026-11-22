import type { Metadata } from "next";
import { BenefitsSection, FinalCta, HowSelection, Narrative, ProgramVsBoston } from "@/components/landing/Sections";
import { Container, SectionHead } from "@/components/landing/Sections";

export const metadata: Metadata = { title: "O projeto", description: "Road to Boston e BORA NEXT: dois caminhos de desenvolvimento da BORA, sem nova assinatura." };

export default function ProjetoPage() {
  return (
    <>
      <section className="bg-night-950" data-hero>
        <Container className="py-16 sm:py-24">
          <SectionHead intro eyebrow="O projeto" title={<>Dois caminhos.<br />Nenhuma assinatura nova.</>}
            lead="Road to Boston para quem foi aprovado tecnicamente. BORA NEXT para quem ainda precisa evoluir, sempre por decisão da coordenação técnica. Os dois vivem na mesma plataforma, cada um com metas e estados próprios." />
          <div className="mt-12 grid gap-4 md:grid-cols-2" data-hero-item>
            <div className="rounded-xl border border-volt/30 bg-volt/[0.05] p-7">
              <p className="label-mono text-volt">Road to Boston</p>
              <p className="mt-3 text-lg leading-relaxed text-mist-100">Ciclo com testes mensais, metas e acompanhamento rumo à prova alvo de 2027 e ao índice de Boston 2028.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-night-850 p-7">
              <p className="label-mono text-mist-300">BORA NEXT</p>
              <p className="mt-3 text-lg leading-relaxed text-mist-100">Metas intermediárias personalizadas e reavaliação periódica. A promoção ao Road depende de nova decisão técnica.</p>
            </div>
          </div>
        </Container>
      </section>
      <Narrative />
      <HowSelection />
      <ProgramVsBoston />
      <BenefitsSection />
      <FinalCta />
    </>
  );
}
