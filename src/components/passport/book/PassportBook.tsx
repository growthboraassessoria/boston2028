"use client";

// O Boston Passport: capa que gira 3D em torno da lombada (mola ~700 ms), páginas que se revelam,
// troca por gesto, teclado, botões ou abas. Sem 3D com "reduzir movimento". Não repete a abertura
// sozinho: depois da primeira vez abre direto; "Fechar" e "Abrir" de novo é o replay intencional.
// Som desligado por padrão (Configurações); vibração só onde o aparelho suporta.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { clsx } from "clsx";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { BoraLogo, BoraShield } from "@/components/brand/Bora";
import { Guilloche } from "@/components/passport/Guilloche";
import { BenefitsPage, EvolutionPage, IdentityPage, JourneyPage, PAGE_TITLES, StampsPage } from "./Pages";
import { PassportStack } from "./PassportStack";
import type { BookData } from "./types";

export const OPENED_KEY = "rtb.passport.opened.v1";
export const SOUND_KEY = "rtb.passport.sound";
const PAGE_KEY = "rtb.passport.page";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function paperSound(kind: "open" | "close" | "turn") {
  try {
    if (localStorage.getItem(SOUND_KEY) !== "1") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const seconds = kind === "open" ? 0.38 : kind === "close" ? 0.24 : 0.16;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2.2);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = kind === "turn" ? 3200 : 2100;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.onended = () => void ctx.close();
    src.start();
  } catch {
    /* sem áudio: segue em silêncio */
  }
}

function haptic() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* sem vibração */
  }
}

export function PassportBook({ data }: { data: BookData }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const [wide, setWide] = useState(false);
  // Celular (até 639 px): as páginas empilhadas numa rolagem só (PassportStack). Do tablet para cima, o livro 3D.
  const [compact, setCompact] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  // Ângulo da capa. A face visível é escolhida pelo ângulo (não depende do backface-visibility do Safari).
  const rotate = useMotionValue(0);
  const coverOpacity = useMotionValue(1);
  const frontVisibility = useTransform(rotate, (v) => (v > -90 ? "visible" : "hidden"));
  const backVisibility = useTransform(rotate, (v) => (v <= -90 ? "visible" : "hidden"));
  const shade = useTransform(rotate, [-178, -90, 0], [0, 0.35, 0]);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Já abriu antes neste aparelho: abre direto, sem animação involuntária.
  useIsoLayoutEffect(() => {
    try {
      if (localStorage.getItem(OPENED_KEY) === data.passportNumber) setOpen(true);
      const saved = Number(sessionStorage.getItem(PAGE_KEY));
      if (Number.isInteger(saved) && saved > 0 && saved < PAGE_TITLES.length) setPage(saved);
    } catch {
      /* armazenamento indisponível: começa fechado, na página 1 */
    }
    const mq = window.matchMedia("(min-width: 960px)");
    const small = window.matchMedia("(max-width: 639px)");
    setWide(mq.matches);
    setCompact(small.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    const onSmall = (e: MediaQueryListEvent) => setCompact(e.matches);
    mq.addEventListener("change", onChange);
    small.addEventListener("change", onSmall);
    return () => {
      mq.removeEventListener("change", onChange);
      small.removeEventListener("change", onSmall);
    };
  }, [data.passportNumber]);

  useEffect(() => {
    const targetRotate = reduce ? 0 : open ? -178 : 0;
    const targetOpacity = open && (reduce || !wide) ? 0 : 1;
    if (!animated) {
      rotate.set(targetRotate);
      coverOpacity.set(targetOpacity);
      return;
    }
    const a = reduce
      ? animate(rotate, 0, { duration: 0 })
      : animate(rotate, targetRotate, { type: "spring", bounce: 0.14, duration: 0.72 });
    const b = animate(coverOpacity, targetOpacity, reduce ? { duration: 0.18 } : { duration: 0.22, delay: open ? 0.46 : 0 });
    return () => { a.stop(); b.stop(); };
  }, [open, animated, reduce, wide, rotate, coverOpacity]);

  const doOpen = useCallback(() => {
    setAnimated(true);
    setOpen(true);
    paperSound("open");
    haptic();
    try {
      localStorage.setItem(OPENED_KEY, data.passportNumber);
    } catch {
      /* ok */
    }
  }, [data.passportNumber]);

  const doClose = useCallback(() => {
    setAnimated(true);
    setOpen(false);
    paperSound("close");
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }, []);

  const go = useCallback((next: number) => {
    setPage((cur) => {
      const target = Math.max(0, Math.min(PAGE_TITLES.length - 1, next));
      if (target !== cur) {
        setDir(target > cur ? 1 : -1);
        paperSound("turn");
        haptic();
        try {
          sessionStorage.setItem(PAGE_KEY, String(target));
        } catch {
          /* ok */
        }
      }
      return target;
    });
  }, []);

  // Depois de abrir ou trocar de página, o foco vai para o título da página (leitor de tela anuncia).
  useEffect(() => {
    if (!open || !animated || compact) return;
    const t = window.setTimeout(() => document.getElementById(`page-${page}`)?.focus({ preventScroll: true }), reduce ? 50 : 420);
    return () => window.clearTimeout(t);
  }, [open, page, animated, reduce, compact]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(page + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(page - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(PAGE_TITLES.length - 1); }
  }

  if (compact) {
    return <PassportStack data={data} open={open} onOpen={doOpen} onClose={doClose} cover={<CoverFront data={data} />} />;
  }

  const pages = [
    <IdentityPage key="0" d={data} />, <JourneyPage key="1" d={data} />, <StampsPage key="2" d={data} />,
    <EvolutionPage key="3" d={data} />, <BenefitsPage key="4" d={data} />,
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Saudação: com o passaporte aberto, o "Fechar" fica aqui (sobra altura para o livro). */}
      <div className="mb-3 flex min-h-11 w-full max-w-[26rem] items-center justify-between gap-3 lg:max-w-none">
        <h1 className="display truncate text-[1.6rem] text-mist-50 sm:text-4xl">Olá, {data.firstName}</h1>
        {open ? (
          <button type="button" onClick={doClose}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/12 px-3.5 text-sm text-mist-200 transition-colors hover:text-mist-50 active:scale-[0.97]">
            <X className="size-4" aria-hidden /> Fechar
          </button>
        ) : (
          <span className="tabular shrink-0 font-mono text-xs text-mist-400">{data.passportNumber}</span>
        )}
      </div>

      <div className="relative w-full" style={{ perspective: 2000 }}>
        <motion.div
          className="preserve-3d book-size relative mx-auto"
          initial={false}
          animate={{ x: wide && open && !reduce ? "50%" : "0%" }}
          transition={animated ? { type: "spring", bounce: 0.1, duration: 0.7 } : { duration: 0 }}
        >
          {/* Folhas de baixo: dão profundidade de livro quando aberto. */}
          <motion.div aria-hidden className="pointer-events-none absolute inset-0" initial={false}
            animate={{ opacity: open ? 1 : 0 }} transition={{ duration: animated ? 0.4 : 0 }}>
            <div className="absolute inset-x-[3%] -bottom-[10px] top-3 rounded-r-[10px] rounded-l-[3px] bg-[#cfcabd]" />
            <div className="absolute inset-x-[1.5%] -bottom-[5px] top-2 rounded-r-[10px] rounded-l-[3px] bg-[#e0dbcf]" />
          </motion.div>

          {/* Miolo: as páginas ficam embaixo da capa. Fechado = inerte para teclado e leitor de tela. */}
          <div
            ref={regionRef}
            className="absolute inset-0 rounded-r-[10px] rounded-l-[3px] shadow-[0_30px_70px_-25px_rgb(0_0_0/0.75)]"
            role="region"
            aria-roledescription="passaporte"
            aria-label="Páginas do Boston Passport"
            onKeyDown={onKeyDown}
            inert={!open}
          >
            <div className="absolute inset-0 overflow-hidden rounded-r-[10px] rounded-l-[3px]">
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <motion.div
                  key={page}
                  custom={dir}
                  className="absolute inset-0 touch-pan-y"
                  role="tabpanel"
                  id={`passport-panel-${page}`}
                  aria-labelledby={`passport-tab-${page}`}
                  variants={{
                    enter: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? "38%" : "-38%", opacity: 0, rotateY: d > 0 ? -14 : 14 }),
                    center: { x: 0, opacity: 1, rotateY: 0 },
                    exit: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? "-38%" : "38%", opacity: 0, rotateY: d > 0 ? 14 : -14 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.08, duration: 0.42 }}
                  drag={reduce ? false : "x"}
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: page === PAGE_TITLES.length - 1 ? 0.12 : 0.45, right: page === 0 ? 0.12 : 0.45 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60 || info.velocity.x < -450) go(page + 1);
                    else if (info.offset.x > 60 || info.velocity.x > 450) go(page - 1);
                  }}
                >
                  {pages[page]}
                </motion.div>
              </AnimatePresence>
            </div>
            {/* Sombra dinâmica da capa sobre as páginas */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-r-[10px] bg-linear-to-r from-black/45 via-black/10 to-transparent"
              initial={false}
              animate={{ opacity: open ? 0 : 1 }}
              transition={animated ? { duration: reduce ? 0.15 : 0.55 } : { duration: 0 }}
            />
          </div>

          {/* Capa: frente (couro sintético com relevo) e verso (papel interno). Gira em torno da lombada. */}
          <motion.div
            className="preserve-3d absolute inset-0 origin-left"
            style={{ rotateY: rotate, opacity: coverOpacity, pointerEvents: open ? "none" : "auto" }}
            aria-hidden={open}
          >
            {/* Safari: a face que esconde o verso não pode ter overflow:hidden; o recorte fica no filho. */}
            <motion.button
              ref={openButtonRef}
              type="button"
              onClick={doOpen}
              tabIndex={open ? -1 : 0}
              aria-label="Abrir meu passaporte"
              className="backface-hidden absolute inset-0 text-left [transform:rotateY(0deg)_translateZ(1px)] active:scale-[0.99]"
              style={{ visibility: frontVisibility }}
            >
              <span className="block h-full w-full overflow-hidden rounded-r-[12px] rounded-l-[4px]"><CoverFront data={data} /></span>
              <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-r-[12px] rounded-l-[4px] bg-black" style={{ opacity: shade }} />
            </motion.button>
            <motion.div className="backface-hidden absolute inset-0 [transform:rotateY(180deg)_translateZ(1px)]" style={{ visibility: backVisibility }}>
              <div className="h-full w-full overflow-hidden rounded-l-[10px] rounded-r-[3px]"><InnerCover data={data} /></div>
              <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-l-[10px] rounded-r-[3px] bg-black" style={{ opacity: shade }} />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Controles: uma linha só (anterior · nome da página e progresso · próxima). */}
      <div className={clsx("mt-4 w-full max-w-[26rem]", wide && open && "lg:max-w-2xl")}>
        {open ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(page - 1)} disabled={page === 0}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-white/12 text-mist-100 transition-[opacity,transform] active:scale-90 disabled:opacity-25" aria-label="Página anterior">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium text-mist-50" aria-live="polite">
                <span className="sr-only">Página {page + 1} de 5: </span>{PAGE_TITLES[page]}
              </p>
              <div role="tablist" aria-label="Páginas do passaporte" className="mt-0.5 flex justify-center">
                {PAGE_TITLES.map((t, i) => (
                  <button key={t} id={`passport-tab-${i}`} role="tab" type="button" aria-selected={page === i} aria-controls={`passport-panel-${i}`}
                    aria-label={`${i + 1}. ${t}`} tabIndex={page === i ? 0 : -1} onClick={() => go(i)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight") { go(i + 1); document.getElementById(`passport-tab-${Math.min(i + 1, 4)}`)?.focus(); }
                      if (e.key === "ArrowLeft") { go(i - 1); document.getElementById(`passport-tab-${Math.max(i - 1, 0)}`)?.focus(); }
                    }}
                    className="group grid h-7 w-7 place-items-center rounded-full lg:w-auto lg:px-2">
                    <span className={clsx("block h-1.5 rounded-full transition-all duration-300 lg:hidden",
                      page === i ? "w-5 bg-volt" : "w-1.5 bg-mist-500 group-hover:bg-mist-300")} />
                    <span className={clsx("hidden text-[0.7rem] lg:block", page === i ? "text-volt" : "text-mist-400 group-hover:text-mist-100")}>{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => go(page + 1)} disabled={page === PAGE_TITLES.length - 1}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-white/12 text-mist-100 transition-[opacity,transform] active:scale-90 disabled:opacity-25" aria-label="Próxima página">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={doOpen}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-volt px-6 font-semibold text-night-950 transition-transform active:scale-[0.98]">
              <BookOpen className="size-4" aria-hidden /> Abrir meu passaporte
            </button>
            <p className="text-center text-xs text-mist-400">Depois, deslize para os lados para virar as páginas.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CoverFront({ data }: { data: BookData }) {
  return (
    <div className="relative h-full w-full bg-[#0a2249] [container-type:inline-size]">
      {/* textura de couro sintético + vinheta */}
      <div aria-hidden className="absolute inset-0 opacity-[0.55] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='l'><feTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.6  0 0 0 0 0.7  0 0 0 0 0.95  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23l)'/></svg>\")" }} />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_15%,rgb(255_255_255/0.10),transparent_55%),radial-gradient(140%_100%_at_50%_120%,rgb(0_0_0/0.55),transparent_60%)]" />
      {/* lombada costurada */}
      <div aria-hidden className="absolute inset-y-0 left-0 w-[7%] bg-linear-to-r from-black/55 via-black/25 to-transparent" />
      <div aria-hidden className="absolute inset-y-3 left-[4.5%] w-px border-l border-dashed border-white/15" />
      {/* moldura em relevo seco */}
      <div aria-hidden className="absolute inset-[6%] rounded-[6px] border border-white/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_-1px_0_rgb(0_0_0/0.35)]" />

      <div className="relative flex h-full flex-col items-center px-[11%] pb-[9%] pt-[11%] text-center">
        <BoraLogo className="h-[4.2%] min-h-3 w-auto text-volt/90" />
        <span className="label-mono mt-[3%] text-[0.55rem] tracking-[0.5em] text-mist-300/70">apresenta</span>

        {/* monograma em relevo: duas camadas deslocadas (luz e sombra) */}
        <div className="relative mt-[11%] h-[24%] aspect-[548/680]">
          <BoraShield className="absolute inset-0 h-full w-full translate-x-[1px] translate-y-[1.5px] text-black/45" />
          <BoraShield className="absolute inset-0 h-full w-full -translate-x-[0.5px] -translate-y-[0.5px] text-white/[0.12]" />
          <BoraShield className="absolute inset-0 h-full w-full text-[#0c2a57]" />
        </div>

        <p className="display mt-[11%] bg-linear-to-b from-[#e8ff7a] via-volt to-[#9fc400] bg-clip-text text-[clamp(1.6rem,8.5cqw,2.6rem)] leading-[0.92] text-transparent [filter:drop-shadow(0_1px_0_rgb(0_0_0/0.35))]">
          Road to<br />Boston
        </p>
        <p className="tabular mt-[3%] font-mono text-sm tracking-[0.42em] text-volt/90">2028</p>

        <div className="mt-auto w-full">
          <div className="mx-auto h-px w-1/2 bg-white/15" aria-hidden />
          <p className="label-mono mt-3 text-[0.6rem] tracking-[0.36em] text-mist-200/90">Boston Passport</p>
          <p className="tabular mt-1.5 font-mono text-[0.68rem] tracking-[0.14em] text-mist-300/80">Edição BORA · {data.passportNumber}</p>
        </div>
      </div>
    </div>
  );
}

function InnerCover({ data }: { data: BookData }) {
  return (
    <div className="light relative flex h-full flex-col bg-[#ece8de] p-[9%]">
      <Guilloche className="pointer-events-none absolute inset-0 h-full w-full" opacity={0.12} />
      <div className="relative">
        <BoraShield className="h-10 w-auto text-ink" />
        <p className="display mt-6 text-3xl leading-none text-ink">Este passaporte é de {data.firstName}.</p>
        <p className="mt-4 text-sm leading-relaxed text-mist-700">
          Ele registra a jornada rumo ao índice de Boston 2028: candidatura, avaliações, testes, carimbos e conquistas.
        </p>
      </div>
      <p className="relative mt-auto text-[0.7rem] leading-relaxed text-mist-600">
        Documento digital autoral da BORA, sem valor oficial. Projeto independente; não afiliado nem endossado pela Boston Athletic Association.
      </p>
    </div>
  );
}
