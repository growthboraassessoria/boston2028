"use client";

// Boston Passport no celular. O livro 3D (computador e tablet) prende o conteúdo num cartão de altura fixa,
// com rolagem dentro da rolagem e páginas escondidas atrás de setas. Aqui:
//  · fechado: a capa e "Abrir meu passaporte" (só na primeira vez; depois abre direto, como no livro);
//  · aberto: a situação e o próximo passo no topo, atalhos fixos para as 5 páginas (acompanham a rolagem)
//    e as páginas de papel inteiras, empilhadas numa rolagem só.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { ArrowRight, BookOpen, X } from "lucide-react";
import { BenefitsPage, EvolutionPage, IdentityPage, JourneyPage, PAGE_TITLES, StampsPage } from "./Pages";
import type { BookData } from "./types";

const SHORT = ["Identificação", "Jornada", "Carimbos", "Evolução", "Benefícios"] as const;
const sectionId = (i: number) => `passaporte-${i}`;

const TONE: Record<string, string> = {
  success: "border-volt/35 bg-volt/[0.06]",
  progress: "border-blue-300/30 bg-blue-700/20",
  attention: "border-warn/40 bg-warn/[0.08]",
  calm: "border-white/10 bg-night-850",
  neutral: "border-white/10 bg-night-850",
};

function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* sem vibração */
  }
}

export function PassportStack({ data, open, onOpen, onClose, cover }: {
  data: BookData; open: boolean; onOpen: () => void; onClose: () => void; cover: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const openRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  // Ao fechar, o foco volta para o botão de abrir (teclado e leitor de tela não se perdem).
  useEffect(() => {
    if (wasOpen.current && !open) requestAnimationFrame(() => openRef.current?.focus());
    // Ao abrir, o foco vai para a situação (o leitor de tela anuncia o que mudou).
    if (!wasOpen.current && open) window.setTimeout(() => document.getElementById("passaporte-situacao")?.focus({ preventScroll: true }), 400);
    wasOpen.current = open;
  }, [open]);

  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 18 };
  const center = { opacity: 1, y: 0 };
  const exit = reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 };

  return (
    <div>
      {/* Saudação: aberto, o "Fechar" volta para a capa. */}
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <h1 className="display truncate text-[1.6rem] text-mist-50">Olá, {data.firstName}</h1>
        {open ? (
          <button type="button" onClick={onClose}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/12 px-3.5 text-sm text-mist-200 transition-[color,transform] hover:text-mist-50 active:scale-[0.97]">
            <X className="size-4" aria-hidden /> Fechar
          </button>
        ) : (
          <span className="tabular shrink-0 font-mono text-xs text-mist-400">{data.passportNumber}</span>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div key="aberto" initial={enter} animate={center} exit={exit} transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <OpenStack data={data} />
          </motion.div>
        ) : (
          <motion.div key="capa" initial={enter} animate={center} exit={exit} transition={{ duration: reduce ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center">
            <button type="button" onClick={onOpen} aria-label="Abrir meu passaporte"
              className="book-size block overflow-hidden rounded-r-[12px] rounded-l-[4px] text-left shadow-[0_30px_70px_-25px_rgb(0_0_0/0.75)] transition-transform active:scale-[0.99]">
              {cover}
            </button>
            <div className="mt-4 flex flex-col items-center gap-1">
              <button ref={openRef} type="button" onClick={onOpen}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-volt px-6 font-semibold text-night-950 transition-transform active:scale-[0.98]">
                <BookOpen className="size-4" aria-hidden /> Abrir meu passaporte
              </button>
              <p className="text-center text-xs text-mist-400">Depois, role a tela para ver todas as páginas.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OpenStack({ data }: { data: BookData }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const chipsRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const lock = useRef(0); // enquanto a rolagem do toque acontece, o destaque não fica pulando entre atalhos

  // Qual página está em leitura: a última cujo topo já passou da linha de leitura.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (Date.now() < lock.current) return;
      // Linha de leitura: um terço abaixo da barra de atalhos (a página que domina a parte de cima da tela).
      const top = navRef.current?.getBoundingClientRect().bottom ?? 120;
      const line = top + (window.innerHeight - top) * 0.33;
      let current = 0;
      for (let i = 0; i < PAGE_TITLES.length; i++) {
        const el = document.getElementById(sectionId(i));
        if (el && el.getBoundingClientRect().top <= line) current = i;
      }
      // No fim da tela, a última página fica ativa mesmo que o topo dela não chegue na linha.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = PAGE_TITLES.length - 1;
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // O atalho ativo sempre aparece na barra (ela rola para os lados).
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!bar || !chip) return;
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [active, reduce]);

  const goTo = useCallback((i: number) => {
    const el = document.getElementById(sectionId(i));
    if (!el) return;
    lock.current = Date.now() + (reduce ? 50 : 700);
    setActive(i);
    haptic();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // Leitor de tela: anuncia o título da página escolhida.
    window.setTimeout(() => document.getElementById(`page-${i}`)?.focus({ preventScroll: true }), reduce ? 50 : 500);
  }, [reduce]);

  const s = data.status;
  return (
    <div>
      {/* Situação e próximo passo: o que a pessoa mais procura ao abrir o passaporte. */}
      <section id="passaporte-situacao" tabIndex={-1} aria-label="Sua situação" className={clsx("rounded-xl border p-4 outline-none", TONE[s.tone] ?? TONE.neutral)}>
        <p className="label-mono text-[0.6rem] text-mist-400">{s.label}</p>
        <p className="mt-1.5 font-semibold leading-snug text-mist-50">{s.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist-200">{s.body}</p>
        {s.action && (
          <Link href={s.action.href}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-volt px-4 text-sm font-semibold text-night-950 transition-transform active:scale-[0.98]">
            {s.action.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      {/* Atalhos das páginas: ficam presos logo abaixo do topo e acompanham a rolagem. */}
      <nav ref={navRef} aria-label="Páginas do passaporte"
        className="sticky z-20 -mx-4 mt-4 border-b border-white/8 bg-night-900/90 backdrop-blur-xl"
        style={{ top: "calc(3.5rem + var(--safe-top))" }}>
        <div ref={chipsRef} className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SHORT.map((t, i) => (
            <button key={t} type="button" data-chip={i} onClick={() => goTo(i)} aria-current={active === i ? "true" : undefined}
              className={clsx("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-[background-color,border-color,color,transform] duration-200 active:scale-95",
                active === i ? "border-volt/60 bg-volt/10 text-volt" : "border-white/10 text-mist-300")}>
              <span className="tabular font-mono text-[0.68rem] opacity-70">{String(i + 1).padStart(2, "0")}</span> {t}
            </button>
          ))}
        </div>
      </nav>

      <div className="mt-4 grid gap-5">
        {[
          <IdentityPage key="0" d={data} flow />,
          <JourneyPage key="1" d={data} flow hideStatus />,
          <StampsPage key="2" d={data} flow />,
          <EvolutionPage key="3" d={data} flow />,
          <BenefitsPage key="4" d={data} flow />,
        ].map((page, i) => (
          <section key={i} id={sectionId(i)} aria-label={PAGE_TITLES[i]}
            className="scroll-mt-[calc(3.5rem+var(--safe-top)+3.75rem)]">
            {page}
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-mist-500">
        Documento digital autoral da BORA, sem valor oficial. Projeto independente; não afiliado nem endossado pela Boston Athletic Association.
      </p>
    </div>
  );
}
