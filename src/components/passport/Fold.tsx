"use client";

// Seção que abre e fecha (perfil). <details> nativo: funciona sem JavaScript, com teclado e leitor de tela.
// A altura anima pelo CSS (details.fold em globals.css) onde o navegador suporta.
// Abre sozinha quando o endereço aponta para ela (#id), por exemplo pelo atalho da foto.
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

export function Fold({ id, icon, title, summary, children }: {
  id: string; icon: React.ReactNode; title: string; summary?: React.ReactNode; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openIfTarget = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    openIfTarget();
    window.addEventListener("hashchange", openIfTarget);
    return () => window.removeEventListener("hashchange", openIfTarget);
  }, [id]);

  // No celular, ao abrir, rola até a seção para o formulário aparecer inteiro.
  function onToggle() {
    const el = ref.current;
    if (!el?.open || !window.matchMedia("(max-width: 639px)").matches) return;
    window.setTimeout(() => {
      const top = el.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.35 || top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  return (
    <details ref={ref} id={id} onToggle={onToggle} className="fold scroll-mt-20 overflow-hidden rounded-xl border border-white/10 bg-night-850 open:border-white/15">
      <summary className="flex min-h-16 cursor-pointer select-none items-center gap-3 px-4 py-3 transition-colors active:bg-white/[0.04] [-webkit-tap-highlight-color:transparent]">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-mist-200">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-mist-50">{title}</span>
          {summary && <span className="block truncate text-xs text-mist-400">{summary}</span>}
        </span>
        <ChevronRight className="fold-chevron size-4 shrink-0 text-mist-500 transition-transform duration-300" aria-hidden />
      </summary>
      <div className="border-t border-white/8 px-4 pb-5 pt-4 sm:px-5">{children}</div>
    </details>
  );
}

/** Link que abre uma seção <Fold> da mesma página (ex.: a câmera do cartão abre "Foto do passaporte"). */
export function OpenFoldLink({ target, className, children, ...rest }: { target: string; className?: string; children: React.ReactNode } & React.AriaAttributes) {
  return (
    <a href={`#${target}`} className={className} {...rest}
      onClick={(e) => {
        const el = document.getElementById(target);
        if (!(el instanceof HTMLDetailsElement)) return;
        e.preventDefault();
        el.open = true;
        history.replaceState(null, "", `#${target}`);
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      }}>
      {children}
    </a>
  );
}
