// Padrão de segurança autoral (rosácea de curvas), só decorativo. Não imita documento oficial.
export function Guilloche({ className, color = "#0b3476", opacity = 0.09 }: { className?: string; color?: string; opacity?: number }) {
  const paths: string[] = [];
  for (let k = 0; k < 14; k++) {
    let d = "";
    for (let i = 0; i <= 360; i += 3) {
      const t = (i * Math.PI) / 180;
      const r = 120 + 26 * Math.sin(7 * t + k * 0.45) + 9 * Math.cos(13 * t);
      const x = 200 + (r - k * 6) * Math.cos(t);
      const y = 200 + (r - k * 6) * Math.sin(t);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    paths.push(d + "Z");
  }
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke={color} strokeWidth="0.6" opacity={opacity}>
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}
