import { getActiveStandards, getCalendar, getRaces } from "@/lib/data/public";
import {
  BenefitsSection, CalendarSection, Container, Criteria, FaqSection, FinalCta, Hero, HowSelection, IndexExplainer,
  Narrative, ProgramVsBoston, SectionHead, TestsGamification,
} from "@/components/landing/Sections";
import { IndexLab } from "@/components/landing/IndexLab";

export const revalidate = 300;

export default async function Home() {
  const [version, races, calendar] = await Promise.all([getActiveStandards(), getRaces(), getCalendar()]);
  // JSON-LD só com fatos: nome e endereço deste site (sem afirmar evento, oferta ou parceria).
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "BORA · Road to Boston 2028", url: process.env.NEXT_PUBLIC_SITE_URL ?? "", inLanguage: "pt-BR" };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Hero version={version} />
      <Narrative />
      <IndexExplainer version={version} />
      <section id="index-lab" aria-labelledby="lab-title" className="border-y border-white/5 bg-night-950">
        <Container className="py-20 sm:py-28">
          <SectionHead id="lab-title" eyebrow="Boston Index Lab" title={<>Quanto falta<br />para o seu índice?</>}
            lead="Simule em um minuto, sem login. Você vê o índice oficial da sua faixa no dia da prova, a diferença e o ritmo necessário." />
          <div className="mt-12" data-reveal>
            <IndexLab version={version} />
          </div>
        </Container>
      </section>
      <HowSelection />
      <Criteria races={races} />
      <ProgramVsBoston />
      <CalendarSection items={calendar} />
      <TestsGamification />
      <BenefitsSection />
      <FaqSection limit={6} />
      <FinalCta />
    </>
  );
}
