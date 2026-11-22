// Paridade: a régua em TypeScript (calculadora e formulário) tem que dar o mesmo resultado que rtb.compute_prelim (fonte da verdade).
import { expect, test } from "@playwright/test";
import { computePrelim, DEFAULT_RULE } from "../../src/lib/domain/triage";
import type { StandardsVersion } from "../../src/lib/domain/standards";
import { freshDb, type Sql } from "./helpers";

let sql: Sql;
let version: StandardsVersion;
const TODAY = "2026-11-20";

test.beforeAll(async () => {
  sql = await freshDb("parity");
  const rows = await sql`select version_id, race_date::text as race_date, min_age, category, age_min, age_max, standard_seconds from rtb.v_public_standards`;
  version = {
    versionId: rows[0]!.version_id, label: "", raceDate: rows[0]!.race_date, minAge: rows[0]!.min_age, sourceUrl: "", sourceTitle: "", consultedAt: "", notes: null,
    rows: rows.map((r) => ({ category: r.category, ageMin: r.age_min, ageMax: r.age_max, seconds: r.standard_seconds })),
  };
});
test.afterAll(async () => sql?.end());

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

test("TS e SQL concordam em 400 casos (aleatórios + bordas)", async () => {
  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const cases = Array.from({ length: 400 }, (_, i) => {
    const birthYear = 1940 + Math.floor(rand() * 72);
    const birth = `${birthYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;
    const distance = pick(["MARATHON", "HALF", null] as const);
    const seconds = distance === "MARATHON" ? 9000 + Math.floor(rand() * 12000) : distance === "HALF" ? 4200 + Math.floor(rand() * 6000) : null;
    const markDate = distance ? pick(["2026-11-21", "2026-09-01", "2025-05-20", "2025-05-19", "2024-01-10"]) : null;
    return {
      birthDate: i === 0 ? "2010-04-18" : i === 1 ? "2010-04-17" : birth,
      category: pick(["M", "F", "X", "OTHER"] as const),
      distance, seconds, markDate,
      targetChoice: pick(["RACE", "NONE"] as const),
      sessions4plus: rand() > 0.3, injury: rand() > 0.85,
    };
  });
  // bordas exatas da margem
  cases.push({ birthDate: "1990-06-10", category: "M", distance: "MARATHON", seconds: 10800 + 900, markDate: "2026-09-01", targetChoice: "RACE", sessions4plus: true, injury: false });
  cases.push({ birthDate: "1990-06-10", category: "M", distance: "HALF", seconds: (10800 + 300) / 2, markDate: "2026-09-01", targetChoice: "RACE", sessions4plus: true, injury: false });

  const [race] = await sql`select id from rtb.target_races limit 1`;
  let mismatches = 0;
  for (const c of cases) {
    const target = c.targetChoice === "RACE" ? race!.id : null;
    const [row] = await sql`select rtb.compute_prelim(${c.birthDate}::date, ${c.category}, ${c.distance}, ${c.seconds}, ${c.markDate}::date,
      ${c.targetChoice}, ${target}, ${c.sessions4plus}, ${c.injury}, ${TODAY}::date) as r`;
    const s = row!.r as { result: string; reasons: string[]; age: number; standard_seconds: number | null; gap_seconds: number | null };
    const t = computePrelim({ ...c, targetRaceId: target, today: TODAY }, version, DEFAULT_RULE);
    const same = s.result === t.result && JSON.stringify(s.reasons) === JSON.stringify(t.reasons) && s.age === t.age
      && (s.standard_seconds ?? null) === t.standardSeconds && (s.gap_seconds ?? null) === t.gapSeconds;
    if (!same) {
      mismatches++;
      if (mismatches < 4) console.log("divergência", JSON.stringify({ c, sql: s, ts: t }));
    }
  }
  expect(mismatches).toBe(0);
});
