// Tempos de prova: entrada h:mm:ss (ou mm:ss), saída sempre com números tabulares.

export const MARATHON_KM = 42.195;
export const HALF_KM = 21.0975;

export type Distance = "MARATHON" | "HALF" | "10K" | "5K" | "3K";

export const DISTANCE_METERS: Record<Distance, number> = {
  MARATHON: 42195,
  HALF: 21097.5,
  "10K": 10000,
  "5K": 5000,
  "3K": 3000,
};

/** Limites plausíveis (iguais aos CHECK do banco). Abaixo do recorde mundial é erro de digitação. */
export const DISTANCE_BOUNDS: Record<Distance, { min: number; max: number }> = {
  MARATHON: { min: 7200, max: 32400 },
  HALF: { min: 3300, max: 16200 },
  "10K": { min: 1500, max: 7200 },
  "5K": { min: 720, max: 3600 },
  "3K": { min: 420, max: 2400 },
};

export type ParseResult = { ok: true; seconds: number } | { ok: false; error: string };

/**
 * Campo de tempo com teclado só de números (celular): monta h:mm:ss sozinho a partir dos dígitos, da direita para a esquerda.
 * "31230" → "3:12:30" · "1845" → "18:45" · "3:12:30" colado → "3:12:30". No máximo 6 números (hh:mm:ss).
 */
export function maskDuration(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** Aceita "3:05:12", "03:05:12", "3h05m12s", "65:30" (mm:ss) e "1:05" quando hint = "hours". */
export function parseDuration(raw: string, hint: "auto" | "hours" = "auto"): ParseResult {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!value) return { ok: false, error: "Informe o tempo." };
  const hms = value.match(/^(\d{1,2})h(?:(\d{1,2})m?)?(?:(\d{1,2})s?)?$/);
  let h = 0, m = 0, s = 0;
  if (hms) {
    h = Number(hms[1]); m = Number(hms[2] ?? 0); s = Number(hms[3] ?? 0);
  } else {
    const parts = value.split(":");
    if (parts.some((p) => !/^\d{1,2}$/.test(p))) return { ok: false, error: "Use o formato h:mm:ss, por exemplo 3:05:12." };
    if (parts.length === 3) {
      [h, m, s] = parts.map(Number) as [number, number, number];
    } else if (parts.length === 2) {
      const [a, b] = parts.map(Number) as [number, number];
      if (hint === "hours") { h = a; m = b; } else { m = a; s = b; }
    } else {
      return { ok: false, error: "Use o formato h:mm:ss, por exemplo 3:05:12." };
    }
  }
  if (m > 59 || s > 59) return { ok: false, error: "Minutos e segundos vão de 00 a 59." };
  const seconds = h * 3600 + m * 60 + s;
  if (seconds <= 0) return { ok: false, error: "Informe um tempo maior que zero." };
  return { ok: true, seconds };
}

export function validateMark(distance: Distance, seconds: number): string | null {
  const b = DISTANCE_BOUNDS[distance];
  if (seconds < b.min) return `Esse tempo está abaixo do recorde mundial da distância. Confira os números (mínimo aceito ${formatDuration(b.min)}).`;
  if (seconds > b.max) return `Tempo acima do limite aceito para a distância (${formatDuration(b.max)}).`;
  return null;
}

/** 10500 → "2:55:00". Com sign, diferenças ganham "+" ou "−". */
export function formatDuration(totalSeconds: number, opts: { sign?: boolean; forceHours?: boolean } = {}): string {
  const negative = totalSeconds < 0;
  const t = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const body = h > 0 || opts.forceHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  if (!opts.sign) return negative ? `−${body}` : body;
  if (t === 0) return "0:00";
  return `${negative ? "−" : "+"}${body}`;
}

/** Diferença legível: "+16 min 05 s", "−2 min 10 s", "+1 h 02 min". */
export function formatGap(seconds: number): string {
  const negative = seconds < 0;
  const t = Math.round(Math.abs(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const sign = t === 0 ? "" : negative ? "−" : "+";
  if (h > 0) return `${sign}${h} h ${pad(m)} min`;
  if (m > 0) return `${sign}${m} min ${pad(s)} s`;
  return `${sign}${s} s`;
}

/** Ritmo médio por km: "4:09 /km". */
export function pacePerKm(seconds: number, km: number): string {
  const per = seconds / km;
  const m = Math.floor(per / 60);
  const s = Math.round(per - m * 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${pad(s)} /km`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
