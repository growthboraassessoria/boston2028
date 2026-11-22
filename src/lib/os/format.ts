// Formatação do OS (fuso de Brasília, números tabulares).
export const TZ = "America/Sao_Paulo";
export const dt = (d: Date | string | null) => d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
export const day = (d: Date | string | null) => {
  if (!d) return "—";
  const s = typeof d === "string" && d.length === 10 ? `${d}T12:00:00-03:00` : d;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s));
};
export function slaInfo(due: Date | string | null, contacted: Date | string | null) {
  if (!due) return null;
  if (contacted) return { label: "Contato feito", tone: "ok" as const };
  const ms = new Date(due).getTime() - Date.now();
  const h = Math.round(Math.abs(ms) / 3_600_000);
  if (ms < 0) return { label: `Vencido há ${h < 48 ? `${h} h` : `${Math.round(h / 24)} d`}`, tone: "alert" as const };
  if (ms < 24 * 3_600_000) return { label: `Vence em ${h} h`, tone: "warn" as const };
  return { label: `Vence ${dt(due)}`, tone: "neutral" as const };
}
