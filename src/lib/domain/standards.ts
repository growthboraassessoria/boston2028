// Índices oficiais versionados (lidos do banco: rtb.v_public_standards). Nada aqui é hardcoded em produção.

export type Category = "M" | "F" | "X";
export type ReferenceCategory = Category | "OTHER";

export const CATEGORY_LABEL: Record<ReferenceCategory, string> = {
  M: "Masculino",
  F: "Feminino",
  X: "Não binário",
  OTHER: "Para-atleta ou caso especial",
};

export type StandardRow = { category: Category; ageMin: number; ageMax: number | null; seconds: number };

export type StandardsVersion = {
  versionId: string;
  label: string;
  raceDate: string; // AAAA-MM-DD
  minAge: number;
  sourceUrl: string;
  sourceTitle: string;
  consultedAt: string; // ISO
  notes: string | null;
  rows: StandardRow[];
};

/** Idade completa numa data (mesma regra do age() do Postgres). Datas em AAAA-MM-DD. */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

export function findStandard(version: StandardsVersion, category: Category, age: number): StandardRow | null {
  const candidates = version.rows
    .filter((r) => r.category === category && age >= r.ageMin && (r.ageMax === null || age <= r.ageMax))
    .sort((a, b) => b.ageMin - a.ageMin);
  return candidates[0] ?? null;
}

export function ageGroupLabel(row: StandardRow): string {
  return row.ageMax === null ? `${row.ageMin}+` : `${row.ageMin}-${row.ageMax}`;
}

/** Tabela completa = 11 faixas para cada categoria. Incompleta vai para revisão humana. */
export function isComplete(version: StandardsVersion): boolean {
  return (["M", "F", "X"] as const).every((c) => version.rows.filter((r) => r.category === c).length >= 11);
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
