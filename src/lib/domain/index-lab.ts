// Boston Index Lab: simulação pública. Mostra o índice oficial da faixa no dia da prova, a diferença,
// o ritmo necessário e uma leitura SIMULADA da régua interna (nunca aprovação).

import { ageGroupLabel, ageOn, findStandard, type ReferenceCategory, type StandardsVersion } from "./standards";
import { MARATHON_KM, pacePerKm, validateMark } from "./time";
import { DEFAULT_RULE, type InternalRule } from "./triage";

export type LabInput = {
  birthDate: string; // AAAA-MM-DD
  category: ReferenceCategory;
  distance: "MARATHON" | "HALF";
  seconds: number;
  markDate: string; // AAAA-MM-DD
  raceName?: string;
  today: string; // AAAA-MM-DD (Brasília)
};

export type LabFit = "WITHIN" | "OUTSIDE" | "MANUAL_REVIEW" | "UNDER_MIN_AGE";

export type LabResult =
  | { ok: false; errors: Partial<Record<keyof LabInput | "form", string>> }
  | {
      ok: true;
      age: number;
      ageGroup: string | null;
      raceDate: string;
      standardSeconds: number | null;
      projectedMarathonSeconds: number;
      gapSeconds: number | null;
      requiredPace: string | null;
      currentPace: string;
      fit: LabFit;
      officialQualifies: boolean | null; // só para maratona: tempo ≤ índice
      notes: string[];
    };

export function runIndexLab(input: LabInput, version: StandardsVersion | null, rule: InternalRule = DEFAULT_RULE): LabResult {
  const errors: Partial<Record<keyof LabInput | "form", string>> = {};
  if (!version) return { ok: false, errors: { form: "A tabela oficial está indisponível agora. Tente de novo em instantes." } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) errors.birthDate = "Informe a data de nascimento.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.markDate)) errors.markDate = "Informe a data da prova.";
  else if (input.markDate > input.today) errors.markDate = "A data da marca não pode estar no futuro.";
  if (input.birthDate && input.birthDate > input.today) errors.birthDate = "Data de nascimento no futuro.";
  const markError = validateMark(input.distance, input.seconds);
  if (markError) errors.seconds = markError;
  if (Object.keys(errors).length) return { ok: false, errors };

  const age = ageOn(input.birthDate, version.raceDate);
  const notes: string[] = [];
  const projected = input.distance === "MARATHON" ? input.seconds : input.seconds * 2;
  if (input.distance === "HALF") {
    notes.push("Estimativa pela meia maratona (tempo × 2) é uma régua exclusiva da BORA para triagem. Não é tempo oficial de qualificação: Boston só aceita maratona certificada.");
  }

  let standard: number | null = null;
  let group: string | null = null;
  if (input.category !== "OTHER") {
    const row = findStandard(version, input.category, age);
    if (row) { standard = row.seconds; group = ageGroupLabel(row); }
  }

  let fit: LabFit;
  if (input.category === "OTHER") {
    fit = "MANUAL_REVIEW";
    notes.push("Para-atletas e casos especiais seguem regras próprias da B.A.A. A coordenação técnica da BORA avalia com você.");
  } else if (age < version.minAge) {
    fit = "UNDER_MIN_AGE";
    notes.push(`A B.A.A. exige ${version.minAge} anos completos no dia da prova.`);
  } else if (standard === null) {
    fit = "MANUAL_REVIEW";
    notes.push("Não encontramos o índice da sua faixa na tabela vigente. A coordenação técnica confere manualmente.");
  } else {
    const gap = projected - standard;
    const margin = input.distance === "MARATHON" ? rule.marathonMarginSeconds : rule.halfMarginSeconds;
    fit = gap <= margin ? "WITHIN" : "OUTSIDE";
  }

  const gap = standard !== null ? projected - standard : null;
  return {
    ok: true,
    age,
    ageGroup: group,
    raceDate: version.raceDate,
    standardSeconds: standard,
    projectedMarathonSeconds: projected,
    gapSeconds: gap,
    requiredPace: standard !== null ? pacePerKm(standard, MARATHON_KM) : null,
    currentPace: pacePerKm(projected, MARATHON_KM),
    fit,
    officialQualifies: input.distance === "MARATHON" && standard !== null ? input.seconds <= standard : null,
    notes,
  };
}

export const FIT_COPY: Record<LabFit, { title: string; body: string }> = {
  WITHIN: {
    title: "Possível adequação à régua interna BORA",
    body: "Simulação. Pela régua interna, sua marca está dentro da margem de triagem. Quem decide é a coordenação técnica, depois da candidatura.",
  },
  OUTSIDE: {
    title: "Ainda fora da margem da régua interna",
    body: "Simulação. Sua marca está além da margem de triagem hoje. Você pode se candidatar: a coordenação técnica avalia cada caso e indica o melhor caminho.",
  },
  MANUAL_REVIEW: {
    title: "Avaliação individual",
    body: "Seu caso precisa de análise humana. Crie seu Passport e a coordenação técnica avalia com você.",
  },
  UNDER_MIN_AGE: {
    title: "Idade mínima da B.A.A.",
    body: "A Boston Marathon exige 18 anos completos no dia da prova. O Passport guarda sua jornada para os próximos ciclos.",
  },
};
