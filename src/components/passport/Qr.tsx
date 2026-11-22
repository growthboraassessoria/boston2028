// QR em SVG (um único path). Conteúdo é só um link com token opaco: nenhum dado pessoal dentro do código.
import { encode } from "uqr";

export function Qr({ value, className, title = "Código QR" }: { value: string; className?: string; title?: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 1 });
  let d = "";
  data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={title} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#0a1324" />
    </svg>
  );
}
