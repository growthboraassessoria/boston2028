import { Container } from "@/components/landing/Sections";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <section className="light" data-hero>
      <Container className="max-w-3xl py-16 sm:py-24">
        <p className="label-mono text-blue-700" data-hero-item>Rascunho · sujeito a revisão jurídica</p>
        <h1 className="display mt-3 text-[clamp(2.2rem,1.4rem+3vw,3.6rem)] text-ink" data-hero-split>{title}</h1>
        <p className="mt-3 text-sm text-mist-600" data-hero-item>Versão {updated}</p>
        <div data-hero-item className="mt-10 space-y-6 leading-relaxed text-mist-800 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </Container>
    </section>
  );
}
