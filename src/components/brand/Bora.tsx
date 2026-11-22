import type { CSSProperties } from "react";
import { clsx } from "clsx";

/** Logotipo BORA (PNG oficial do kit como máscara: a cor é exatamente a do texto, ex. #CEFF00 ou branco). */
export function BoraLogo({ className, title = "BORA" }: { className?: string; title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      className={clsx("brand-icon aspect-[1200/307]", className)}
      style={{ "--icon": "url(/brand/bora-logo-white.png)" } as CSSProperties}
    />
  );
}

export function BoraSymbol({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("brand-icon aspect-[600/765]", className)}
      style={{ "--icon": "url(/brand/bora-symbol-white.png)" } as CSSProperties}
    />
  );
}

// Escudo com raio redesenhado nas coordenadas do PNG oficial (548 × 680), o mesmo desenho usado na BORA Store.
const SHIELD_OUTER = "M0 0H548V400C548 560 430 680 274 680C118 680 0 560 0 400Z";
const SHIELD_INNER = "M34 34H514V400C514 549.8 409.6 646 274 646C138.4 646 34 549.8 34 400Z";
const BOLT_TOP = "115,330 338,102 352,100 362,114 362,335 305,335 305,200 185,335";
const BOLT_BOTTOM = "433,350 210,578 196,580 186,566 186,345 243,345 243,480 363,345";

/** Só os traços do escudo (para usar dentro de outro SVG). Caixa 548 × 680. */
export function BoraShieldPaths({ fill = "currentColor" }: { fill?: string }) {
  return (
    <>
      <path d={`${SHIELD_OUTER} ${SHIELD_INNER}`} fillRule="evenodd" fill={fill} />
      <polygon points={BOLT_TOP} fill={fill} />
      <polygon points={BOLT_BOTTOM} fill={fill} />
    </>
  );
}

/** Monograma BORA em vetor, para relevo e carimbos (uma cor). */
export function BoraShield({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 548 680" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={`${SHIELD_OUTER} ${SHIELD_INNER}`} fillRule="evenodd" fill="currentColor" />
      <polygon points={BOLT_TOP} fill="currentColor" />
      <polygon points={BOLT_BOTTOM} fill="currentColor" />
    </svg>
  );
}

/** Marca própria do projeto (tipográfica, original). Nunca usar logo, unicórnio ou identidade da B.A.A. */
export function RtbWordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex flex-col leading-none", className)} aria-label="Road to Boston 2028">
      <span aria-hidden className="display text-[1em] tracking-tight">
        Road to Boston
      </span>
      {!compact && (
        <span aria-hidden className="label-mono mt-1 text-[0.32em] tracking-[0.42em] text-volt">
          2028 · BORA
        </span>
      )}
    </span>
  );
}
