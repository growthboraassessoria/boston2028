// Carimbos autorais da jornada (tinta azul ou preta sobre papel: nunca verde sobre claro).
import { clsx } from "clsx";
import { BoraShieldPaths } from "@/components/brand/Bora";

const INK = { blue: "#0b3476", black: "#0a1324", red: "#9b1c22" } as const;

function seed(text: string) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function Stamp({ title, date, kind = "stamp", ink = "blue", className, empty = false }: {
  title: string; date?: string | null; kind?: "stamp" | "seal" | "milestone"; ink?: keyof typeof INK; className?: string; empty?: boolean;
}) {
  const s = seed(title);
  const rotate = ((s % 15) - 7) * (empty ? 0 : 1);
  const color = INK[kind === "seal" ? "black" : ink];
  const id = `stamp-${s}`;
  if (empty) {
    return (
      <div className={clsx("grid aspect-square place-items-center rounded-full border border-dashed border-ink/25 p-2 text-center", className)}>
        <span className="label-mono text-[0.5rem] leading-snug tracking-[0.08em] text-mist-500">{title}</span>
      </div>
    );
  }
  return (
    <svg viewBox="0 0 200 200" className={clsx("aspect-square", className)} role="img" aria-label={`Carimbo: ${title}${date ? `, ${date}` : ""}`}
      style={{ transform: `rotate(${rotate}deg)` }}>
      <defs>
        <filter id={`${id}-ink`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={s % 97} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.25" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
        <path id={`${id}-top`} d="M 30 100 A 70 70 0 0 1 170 100" />
        <path id={`${id}-bottom`} d="M 38 112 A 62 62 0 0 0 162 112" />
      </defs>
      <g filter={`url(#${id}-ink)`} fill="none" stroke={color} opacity="0.86">
        {kind === "milestone" ? (
          <rect x="18" y="38" width="164" height="124" rx="10" strokeWidth="5" />
        ) : (
          <>
            <circle cx="100" cy="100" r="88" strokeWidth="5" />
            <circle cx="100" cy="100" r="78" strokeWidth="1.5" strokeDasharray={kind === "seal" ? "0" : "3 4"} />
          </>
        )}
        <text fill={color} stroke="none" fontFamily="var(--font-display)" fontWeight="800"
          fontSize={title.length > 18 ? 11.5 : title.length > 13 ? 13 : 15} letterSpacing={title.length > 18 ? 1.2 : title.length > 13 ? 1.8 : 2.5}>
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">{title.toUpperCase().slice(0, 26)}</textPath>
        </text>
        {date && (
          <text fill={color} stroke="none" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="2">
            <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">{date}</textPath>
          </text>
        )}
      </g>
      <g opacity="0.86" transform="translate(78 68) scale(0.0803)" filter={`url(#${id}-ink)`}>
        <BoraShieldPaths fill={color} />
      </g>
      <text x="100" y="146" fill={color} opacity="0.86" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="3" textAnchor="middle">RTB · 2028</text>
    </svg>
  );
}
