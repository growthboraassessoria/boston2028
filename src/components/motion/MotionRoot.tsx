"use client";

// Movimento do site público, do login e do cadastro (GSAP). É progressivo: sem JavaScript ou com "reduzir movimento"
// ligado, tudo aparece parado e completo. Os componentes só marcam o que anima:
//   data-hero ........... bloco de abertura (anima ao carregar e ao chegar pela navegação)
//     data-hero-split ... título que sobe linha a linha
//     data-hero-item .... itens que entram em sequência
//     data-hero-fade .... itens que só aparecem (marcas do gráfico)
//     data-hero-bib ..... o número de peito (entra inclinando)
//     data-count-from ... número que conta até o valor do texto
//     data-draw ......... linha SVG que se desenha
//   data-scramble ....... números que rodam como cronômetro e assentam
//   data-split .......... título de seção que sobe linha a linha ao entrar na tela
//   data-reveal ......... bloco que sobe ao entrar na tela
//   data-stagger ........ os filhos entram em sequência ("fade": só opacidade, para linhas de tabela)
//   data-timeline ....... linha do calendário que acompanha a rolagem (com data-timeline-line e data-timeline-dot)
//   data-float .......... brilho de fundo que flutua devagar
//   data-magnetic ....... botão que segue levemente o ponteiro (só computador)
// O que abre a página começa escondido pelo CSS (globals.css › Movimento) para não piscar antes do script.
// Rolagem suave (ScrollSmoother) só no computador com mouse e fora de navegador automatizado.
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { gsap, isAutomation, ScrollSmoother, ScrollTrigger, SplitText, useGSAP } from "./gsap";

const MOTION = "(prefers-reduced-motion: no-preference)";
const DESKTOP = "(prefers-reduced-motion: no-preference) and (pointer: fine) and (min-width: 1024px)";
const INTRO = "[data-hero-split], [data-hero-item], [data-hero-fade], [data-hero-bib], [data-draw]";

// No 1º carregamento o HTML já veio pintado do servidor: só anima o que o CSS escondeu ou o que está abaixo da dobra.
// Depois de navegar, a página nova é montada antes de pintar, então tudo pode entrar animado.
let lastPath: string | null = null;
let navigated = false;

type Cleanup = () => void;
const all = <T extends Element = HTMLElement>(selector: string, root: Element) => gsap.utils.toArray<T>(selector, root);
const belowFold = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.9;
const hiddenByCss = (el: Element) => getComputedStyle(el).opacity === "0";

export function MotionRoot({ children, smooth = false }: { children: React.ReactNode; smooth?: boolean }) {
  const pathname = usePathname();
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  // Rolagem suave: criada uma vez; o conteúdo troca por dentro a cada página.
  useGSAP(() => {
    if (!smooth || !wrapper.current || !content.current) return;
    const mm = gsap.matchMedia();
    mm.add(DESKTOP, () => {
      if (isAutomation()) return;
      const root = document.documentElement;
      const header = document.querySelector<HTMLElement>("[data-site-header]");
      const setHeader = () => root.style.setProperty("--header-h", `${header?.offsetHeight ?? 0}px`);
      setHeader();
      root.classList.add("has-smoother");
      const smoother = ScrollSmoother.create({ wrapper: wrapper.current!, content: content.current!, smooth: 1.1, effects: false, smoothTouch: false });
      // Conteúdo que muda de altura (FAQ aberto, resultado do Index Lab) atualiza a altura da rolagem.
      let timer = 0;
      const ro = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => ScrollTrigger.refresh(), 150);
      });
      ro.observe(content.current!);
      window.addEventListener("resize", setHeader);
      return () => {
        ro.disconnect();
        window.clearTimeout(timer);
        window.removeEventListener("resize", setHeader);
        smoother.kill();
        root.classList.remove("has-smoother");
        root.style.removeProperty("--header-h");
      };
    });
  }, { dependencies: [smooth] });

  // Animações da página: refeitas a cada navegação.
  useGSAP(() => {
    const scope = content.current;
    if (!scope) return;
    if (lastPath !== null && lastPath !== pathname) navigated = true;
    lastPath = pathname;
    const arriving = navigated;

    // O Next já levou a janela para o lugar certo (topo ou posição salva). A rolagem suave vai direto para lá,
    // sem "rolar" a página nova, e desfaz qualquer rolagem que o Next tenha feito dentro do quadro fixo.
    const smoother = ScrollSmoother.get();
    if (smoother && wrapper.current) {
      wrapper.current.scrollTop = 0;
      smoother.scrollTop(window.scrollY);
    }

    const mm = gsap.matchMedia();
    mm.add(MOTION, (ctx) => {
      const cleanups: Cleanup[] = [];
      try {
        intro(scope, arriving, cleanups);
        headings(scope, arriving, ctx);
        reveals(scope, arriving);
        timelines(scope);
        floats(scope);
        scrambles(scope);
        faqs(scope, cleanups);
        if (window.matchMedia("(pointer: fine)").matches && !isAutomation()) magnetic(scope, cleanups);
      } catch (e) {
        // Nunca deixar conteúdo escondido por erro de animação.
        console.error("[motion]", e);
        gsap.set(all(INTRO, scope), { opacity: 1, clearProps: "transform" });
      }
      const refresh = () => ScrollTrigger.refresh();
      const raf = requestAnimationFrame(refresh);
      void document.fonts?.ready.then(refresh);
      return () => {
        cancelAnimationFrame(raf);
        cleanups.forEach((c) => c());
      };
    });
  }, { dependencies: [pathname], revertOnUpdate: true });

  if (!smooth) return <div ref={content}>{children}</div>;
  return (
    <div id="smooth-wrapper" ref={wrapper}>
      <div id="smooth-content" ref={content}>{children}</div>
    </div>
  );
}

/** Abertura: título linha a linha, itens em sequência, número de peito, linha do percurso e contadores. */
function intro(scope: HTMLElement, arriving: boolean, cleanups: Cleanup[]) {
  all("[data-hero]", scope).forEach((hero) => {
    const pending = all(INTRO, hero);
    // Já visível (o script chegou depois da animação de segurança do CSS): fica como está.
    const settled = arriving ? [] : pending.filter((el) => !hiddenByCss(el));
    pending.forEach((el) => (el.style.animation = "none"));
    gsap.set(settled, { opacity: 1 });
    const todo = (el: Element) => !settled.includes(el as HTMLElement);

    const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.1 } });

    const titles = all("[data-hero-split]", hero).filter(todo);
    titles.forEach((h) => {
      gsap.set(h, { opacity: 1 });
      const split = SplitText.create(h, { type: "lines", mask: "lines", aria: "none" });
      tl.from(split.lines, { yPercent: 115, stagger: 0.1, duration: 1.25, onComplete: () => split.revert() }, 0);
    });

    const bib = all("[data-hero-bib]", hero).filter(todo);
    if (bib.length) tl.fromTo(bib, { opacity: 0, y: 70, rotation: -8 }, { opacity: 1, y: 0, rotation: 0, duration: 1.5 }, 0.15);

    const items = all("[data-hero-item]", hero).filter(todo);
    if (items.length) tl.fromTo(items, { opacity: 0, y: 26 }, { opacity: 1, y: 0, stagger: 0.08, duration: 1 }, titles.length ? 0.3 : 0);

    const lines = all<SVGPathElement>("[data-draw]", hero).filter(todo);
    lines.forEach((path) => {
      gsap.set(path, { opacity: 1 });
      tl.fromTo(path, { drawSVG: "0%" }, { drawSVG: "100%", duration: 2.4, ease: "power2.inOut" }, 0.25);
    });

    const ticks = all("[data-hero-fade]", hero).filter(todo);
    if (ticks.length) tl.fromTo(ticks, { opacity: 0 }, { opacity: 1, stagger: 0.06, duration: 0.6, ease: "power1.out" }, 0.9);

    all("[data-count-from]", hero).forEach((el) => {
      const final = el.textContent ?? "";
      const to = Number(final.replace(/\D/g, ""));
      const from = Number(el.dataset.countFrom);
      if (!Number.isFinite(to) || !Number.isFinite(from) || !final) return;
      const n = { v: from };
      el.textContent = String(from);
      tl.to(n, { v: to, duration: 2, ease: "power4.out", onUpdate: () => void (el.textContent = String(Math.round(n.v))), onComplete: () => void (el.textContent = final) }, 0.35);
      cleanups.push(() => void (el.textContent = final));
    });
  });
}

/** Títulos de seção: sobem linha a linha quando entram na tela. */
function headings(scope: HTMLElement, arriving: boolean, ctx: gsap.Context) {
  all("[data-split]", scope).forEach((h) => {
    if (!arriving && !belowFold(h)) return; // já pintado no 1º carregamento: não pisca
    gsap.set(h, { opacity: 0 });
    ScrollTrigger.create({
      trigger: h,
      start: "top 88%",
      once: true,
      onEnter: () =>
        ctx.add(() => {
          const split = SplitText.create(h, { type: "lines", mask: "lines", aria: "none" });
          gsap.set(h, { opacity: 1 });
          gsap.from(split.lines, { yPercent: 115, duration: 1.05, stagger: 0.09, ease: "expo.out", onComplete: () => split.revert() });
        }),
    });
  });
}

/** Blocos e grupos que sobem ao entrar na tela. */
function reveals(scope: HTMLElement, arriving: boolean) {
  const take = (el: Element) => arriving || belowFold(el);
  all("[data-reveal]", scope).filter(take).forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 1, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
  });
  all("[data-stagger]", scope).forEach((group) => {
    const kids = Array.from(group.children).filter(take);
    if (!kids.length) return;
    const fadeOnly = group.getAttribute("data-stagger") === "fade";
    gsap.fromTo(
      kids,
      fadeOnly ? { opacity: 0 } : { opacity: 0, y: 36 },
      { opacity: 1, ...(fadeOnly ? {} : { y: 0 }), duration: 0.9, stagger: fadeOnly ? 0.04 : 0.08, scrollTrigger: { trigger: group, start: "top 88%", once: true } },
    );
  });
}

/** Calendário: a linha acompanha a rolagem e os marcadores acendem quando ela passa. */
function timelines(scope: HTMLElement) {
  all("[data-timeline]", scope).forEach((list) => {
    const line = list.querySelector("[data-timeline-line]");
    if (line) {
      gsap.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: list, start: "top 75%", end: "bottom 55%", scrub: 0.6 } });
    }
    all("[data-timeline-dot]", list).forEach((dot) => {
      gsap.fromTo(dot, { scale: 0.3, opacity: 0.35 }, {
        scale: 1, opacity: 1, duration: 0.6, ease: "back.out(3)",
        scrollTrigger: { trigger: dot, start: "top 72%", toggleActions: "play none none reverse" },
      });
    });
  });
}

/** Brilhos de fundo flutuando devagar. */
function floats(scope: HTMLElement) {
  all("[data-float]", scope).forEach((el, i) => {
    gsap.to(el, { x: i % 2 ? -36 : 36, y: i % 2 ? 26 : -26, duration: 9 + i * 2, ease: "sine.inOut", repeat: -1, yoyo: true });
  });
}

/** Números que rodam como um cronômetro e assentam no valor certo (o texto real fica para leitores de tela). */
function scrambles(scope: HTMLElement) {
  all("[data-scramble]", scope).forEach((el, i) => {
    const text = el.textContent ?? "";
    if (!text) return;
    gsap.to(el, {
      duration: 1.4, delay: 0.25 + i * 0.12, ease: "none",
      scrambleText: { text, chars: "0123456789", speed: 0.7, revealDelay: 0.45 },
      scrollTrigger: { trigger: el, start: "top 95%", once: true },
    });
  });
}

/** Perguntas frequentes: a resposta desliza ao abrir. */
function faqs(scope: HTMLElement, cleanups: Cleanup[]) {
  const onToggle = (e: Event) => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    const answer = details.querySelector(":scope > summary + *");
    if (answer) gsap.fromTo(answer, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
  };
  scope.addEventListener("toggle", onToggle, true); // "toggle" não sobe: escuta na captura
  cleanups.push(() => scope.removeEventListener("toggle", onToggle, true));
}

/** Botões principais seguem o ponteiro de leve (só com mouse). */
function magnetic(scope: HTMLElement, cleanups: Cleanup[]) {
  all("[data-magnetic]", scope).forEach((el) => {
    const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.2);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.3);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    cleanups.push(() => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    });
  });
}
