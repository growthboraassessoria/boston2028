// Régua interna BORA: espelho exato de rtb.compute_prelim (o banco é a fonte da verdade da candidatura;
// este espelho serve à calculadora e ao formulário). Teste de paridade em tests/db/parity.spec.ts.

import { ageGroupLabel, ageOn, findStandard, type ReferenceCategory, type StandardsVersion } from "./standards";

export type InternalRule = {
  marathonMarginSeconds: number; // 900 = 15 min
  halfMarginSeconds: number; // 300 = 5 min (sobre a meia ×2)
  recentMarkMonths: number; // proposta: 18
};

export const DEFAULT_RULE: InternalRule = { marathonMarginSeconds: 900, halfMarginSeconds: 300, recentMarkMonths: 18 };

export type PrelimReason =
  | "injury_in_treatment"
  | "under_min_age"
  | "special_category_review"
  | "standard_unavailable"
  | "frequency_below_min"
  | "no_target_race"
  | "no_recent_mark"
  | "mark_in_future"
  | "mark_not_recent"
  | "mark_outside_margin";

export type PrelimResult = "ELIGIBLE" | "ALMOST" | "NOT_NOW" | "MANUAL_REVIEW";

export type PrelimInput = {
  birthDate: string;
  category: ReferenceCategory | null;
  distance: "MARATHON" | "HALF" | null;
  seconds: number | null;
  markDate: string | null;
  targetChoice: "RACE" | "NONE" | null;
  targetRaceId: string | null;
  sessions4plus: boolean | null;
  injury: boolean | null;
  today: string; // AAAA-MM-DD (fuso de Brasília)
};

export type PrelimOutput = {
  result: PrelimResult;
  reasons: PrelimReason[];
  age: number;
  ageGroup: string | null;
  standardSeconds: number | null;
  projectedMarathonSeconds: number | null;
  gapSeconds: number | null;
};

export function subtractMonths(isoDate: string, months: number): string {
  // Igual ao Postgres: date - interval 'N months' (dia é limitado ao fim do mês).
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  let year = y;
  let month = m - months;
  while (month <= 0) { month += 12; year -= 1; }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function computePrelim(input: PrelimInput, version: StandardsVersion | null, rule: InternalRule = DEFAULT_RULE): PrelimOutput {
  if (!version) {
    return { result: "MANUAL_REVIEW", reasons: ["standard_unavailable"], age: 0, ageGroup: null, standardSeconds: null, projectedMarathonSeconds: null, gapSeconds: null };
  }
  const age = ageOn(input.birthDate, version.raceDate);
  const reasons: PrelimReason[] = [];
  let std: number | null = null;
  let group: string | null = null;
  if (input.category === "M" || input.category === "F" || input.category === "X") {
    const row = findStandard(version, input.category, age);
    if (row) { std = row.seconds; group = ageGroupLabel(row); }
  }
  let projected: number | null = null;
  if (input.seconds !== null) {
    projected = input.distance === "MARATHON" ? input.seconds : input.distance === "HALF" ? input.seconds * 2 : null;
  }
  const gap = std !== null && projected !== null ? projected - std : null;

  if (input.injury) reasons.push("injury_in_treatment");
  if (age < version.minAge) reasons.push("under_min_age");
  if (input.category === null || input.category === "OTHER") reasons.push("special_category_review");
  else if (std === null && age >= version.minAge) reasons.push("standard_unavailable");
  if (!input.sessions4plus) reasons.push("frequency_below_min");
  if (input.targetChoice !== "RACE" || !input.targetRaceId) reasons.push("no_target_race");
  if (input.seconds === null || input.markDate === null || input.distance === null) reasons.push("no_recent_mark");
  else if (input.markDate > input.today) reasons.push("mark_in_future");
  else if (input.markDate < subtractMonths(input.today, rule.recentMarkMonths)) reasons.push("mark_not_recent");
  if (gap !== null) {
    if ((input.distance === "MARATHON" && gap > rule.marathonMarginSeconds) || (input.distance === "HALF" && gap > rule.halfMarginSeconds)) {
      reasons.push("mark_outside_margin");
    }
  }

  let result: PrelimResult;
  if (reasons.includes("injury_in_treatment") || reasons.includes("under_min_age")) result = "NOT_NOW";
  else if (reasons.includes("special_category_review") || reasons.includes("standard_unavailable") || reasons.includes("mark_in_future")) result = "MANUAL_REVIEW";
  else if (reasons.length > 0) result = "ALMOST";
  else result = "ELIGIBLE";

  return { result, reasons, age, ageGroup: group, standardSeconds: std, projectedMarathonSeconds: projected, gapSeconds: gap };
}

/** Textos para a equipe (OS). O atleta nunca vê "Quase lá" como convite. */
export const REASON_LABEL: Record<PrelimReason, string> = {
  injury_in_treatment: "Lesão em tratamento",
  under_min_age: "Abaixo da idade mínima (18 anos no dia da prova)",
  special_category_review: "Categoria especial: revisão humana",
  standard_unavailable: "Índice indisponível para a faixa",
  frequency_below_min: "Menos de 4 treinos por semana",
  no_target_race: "Sem prova alvo de 2027",
  no_recent_mark: "Sem marca recente",
  mark_in_future: "Data da marca no futuro",
  mark_not_recent: "Marca fora da janela recente",
  mark_outside_margin: "Marca acima da margem da régua",
};
