// Grafismos autorais de prova: perfil de altimetria abstrato (não é o percurso real de nenhuma prova),
// marcações de km, ticks de parciais e coordenadas de checkpoint fictícias.
import { clsx } from "clsx";

const W = 1000;
const H = 220;

function profilePoints(seed = 7, n = 120) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y =
      0.55 +
      0.16 * Math.sin(t * Math.PI * 2.2 + seed) +
      0.08 * Math.sin(t * Math.PI * 7.3 + seed * 1.7) +
      0.04 * Math.sin(t * Math.PI * 17.1 + seed * 0.3) -
      0.22 * Math.exp(-((t - 0.78) ** 2) / 0.004); // a "subida" final, só como desenho
    pts.push([t * W, Math.max(0.08, Math.min(0.92, y)) * H]);
  }
  return pts;
}

function toPath(pts: [number, number][]) {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

const KM = [0, 5, 10, 15, 21.1, 25, 30, 35, 42.2];

export function ElevationLine({ className, animate = true, seed = 7 }: { className?: string; animate?: boolean; seed?: number }) {
  const pts = profilePoints(seed);
  const line = toPath(pts);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className={clsx("w-full", className)} aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id={`elev-${seed}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2c5ba8" stopOpacity="0.45" />
          <stop offset="1" stopColor="#2c5ba8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* animate: na abertura, a linha se desenha e as marcas aparecem (GSAP: data-draw e data-hero-fade). */}
      <path d={area} fill={`url(#elev-${seed})`} {...(animate ? { "data-hero-fade": "" } : {})} />
      <path d={line} fill="none" stroke="#ceff00" strokeWidth="2" vectorEffect="non-scaling-stroke" {...(animate ? { "data-draw": "" } : {})} />
      {KM.map((k) => {
        const x = (k / 42.2) * W;
        return (
          <g key={k} {...(animate ? { "data-hero-fade": "" } : {})}>
            <line x1={x} x2={x} y1={H - 4} y2={H + 8} stroke="#8fb0e6" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
            <text x={x} y={H + 26} fill="#8fb0e6" fillOpacity="0.7" fontSize="13" textAnchor={k === 0 ? "start" : k === 42.2 ? "end" : "middle"}
              fontFamily="var(--font-mono)">
              {k === 42.2 ? "42.2K" : k === 21.1 ? "21.1K" : `${k}K`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ticks de parciais: uma régua de cronômetro decorativa. */
export function SplitTicks({ className, count = 42 }: { className?: string; count?: number }) {
  return (
    <svg viewBox={`0 0 ${count * 10} 24`} className={clsx("w-full", className)} aria-hidden preserveAspectRatio="none">
      {Array.from({ length: count + 1 }, (_, i) => (
        <line key={i} x1={i * 10} x2={i * 10} y1={i % 5 === 0 ? 0 : 10} y2={24} stroke="currentColor"
          strokeOpacity={i % 5 === 0 ? 0.9 : 0.35} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Coordenadas de checkpoint fictícias, no estilo de sinalização de prova. */
export function Checkpoint({ km, label, className }: { km: string; label: string; className?: string }) {
  return (
    <div className={clsx("flex items-baseline gap-3", className)}>
      <span className="display text-2xl text-signal tabular">{km}</span>
      <span className="label-mono text-mist-300">{label}</span>
    </div>
  );
}
