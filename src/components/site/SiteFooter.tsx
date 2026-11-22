import Link from "next/link";
import { BoraLogo } from "@/components/brand/Bora";

export const DISCLAIMER = "Projeto independente da BORA Assessoria. Não afiliado nem endossado pela Boston Athletic Association.";

export function SiteFooter({ disclaimer = DISCLAIMER }: { disclaimer?: string }) {
  return (
    <footer className="border-t border-white/5 bg-night-950" style={{ paddingBottom: "var(--safe-bottom)" }}>
      <div className="safe-x mx-auto grid max-w-7xl gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]" data-stagger>
        <div>
          <BoraLogo className="h-5 w-auto text-volt" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-mist-300">{disclaimer}</p>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-mist-400">
            “Boston Marathon” é citada apenas para informar o objetivo esportivo dos atletas. Índices e regras de inscrição são
            da B.A.A. e podem mudar: confira sempre a fonte oficial.
          </p>
        </div>
        <nav aria-label="Projeto" className="grid content-start gap-2 text-sm">
          <span className="label-mono mb-1 text-mist-400">Projeto</span>
          <Link className="text-mist-200 hover:text-volt" href="/projeto">O projeto</Link>
          <Link className="text-mist-200 hover:text-volt" href="/criterios">Critérios e provas alvo</Link>
          <Link className="text-mist-200 hover:text-volt" href="/calculadora">Boston Index Lab</Link>
          <Link className="text-mist-200 hover:text-volt" href="/calendario">Calendário</Link>
          <Link className="text-mist-200 hover:text-volt" href="/faq">Perguntas frequentes</Link>
        </nav>
        <nav aria-label="Legal" className="grid content-start gap-2 text-sm">
          <span className="label-mono mb-1 text-mist-400">Sua conta e seus dados</span>
          <Link className="text-mist-200 hover:text-volt" href="/login">Entrar no Passport</Link>
          <Link className="text-mist-200 hover:text-volt" href="/privacidade">Aviso de privacidade</Link>
          <Link className="text-mist-200 hover:text-volt" href="/termos">Termos de uso</Link>
          <a className="text-mist-200 hover:text-volt" href="https://www.baa.org/races/boston-marathon/qualify/" target="_blank" rel="noopener noreferrer">
            Fonte oficial dos índices (baa.org) ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
