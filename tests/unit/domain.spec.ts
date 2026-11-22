import { expect, test } from "@playwright/test";
import { formatDuration, formatGap, pacePerKm, parseDuration, validateMark } from "../../src/lib/domain/time";
import { ageOn, findStandard, isComplete, type StandardsVersion } from "../../src/lib/domain/standards";
import { runIndexLab } from "../../src/lib/domain/index-lab";
import { computePrelim, subtractMonths } from "../../src/lib/domain/triage";
import { athleteStatusView, type AthleteSituation } from "../../src/lib/domain/athlete-status";
import { toE164 } from "../../src/lib/validation/profile";
import { renderEmail } from "../../src/lib/email/render";

// Cópia da tabela oficial (baa.org, consultada em 20/11/2026) só como fixture de teste.
const ROWS: [number, number | null, number, number][] = [
  [18, 34, 10500, 12300], [35, 39, 10800, 12600], [40, 44, 11100, 12900], [45, 49, 11700, 13500], [50, 54, 12000, 13800],
  [55, 59, 12600, 14400], [60, 64, 13800, 15600], [65, 69, 14700, 16500], [70, 74, 15600, 17400], [75, 79, 16500, 18300], [80, null, 17400, 19200],
];
const V: StandardsVersion = {
  versionId: "v", label: "B.A.A. · Índices 2027 & 2028", raceDate: "2028-04-17", minAge: 18, sourceUrl: "https://www.baa.org/races/boston-marathon/qualify/",
  sourceTitle: "B.A.A.", consultedAt: "2026-11-20T18:40:00.000Z", notes: null,
  rows: ROWS.flatMap(([a, b, m, f]) => [
    { category: "M" as const, ageMin: a, ageMax: b, seconds: m }, { category: "F" as const, ageMin: a, ageMax: b, seconds: f },
    { category: "X" as const, ageMin: a, ageMax: b, seconds: f },
  ]),
};
const TODAY = "2026-11-20";

test.describe("tempo", () => {
  test("lê h:mm:ss, mm:ss e 3h05", () => {
    expect(parseDuration("3:05:12")).toEqual({ ok: true, seconds: 11112 });
    expect(parseDuration("03:05:12")).toEqual({ ok: true, seconds: 11112 });
    expect(parseDuration("3h05m")).toEqual({ ok: true, seconds: 11100 });
    expect(parseDuration("41:30")).toEqual({ ok: true, seconds: 2490 });
    expect(parseDuration("1:32", "hours")).toEqual({ ok: true, seconds: 5520 });
  });
  test("recusa formatos e valores impossíveis", () => {
    expect(parseDuration("").ok).toBe(false);
    expect(parseDuration("3:65:00").ok).toBe(false);
    expect(parseDuration("abc").ok).toBe(false);
    expect(parseDuration("0:00:00").ok).toBe(false);
    expect(validateMark("MARATHON", 6000)).toMatch(/recorde mundial/);
    expect(validateMark("HALF", 20000)).toMatch(/limite/);
    expect(validateMark("MARATHON", 10800)).toBeNull();
  });
  test("formata diferenças e ritmo", () => {
    expect(formatDuration(10500)).toBe("2:55:00");
    expect(formatDuration(-90, { sign: true })).toBe("−1:30");
    expect(formatGap(965)).toBe("+16 min 05 s");
    expect(formatGap(-130)).toBe("−2 min 10 s");
    expect(pacePerKm(10800, 42.195)).toBe("4:16 /km");
  });
});

test.describe("índice e idade no dia da prova", () => {
  test("idade é a do dia 17/04/2028, com aniversário e 29/02", () => {
    expect(ageOn("1993-04-17", "2028-04-17")).toBe(35);
    expect(ageOn("1993-04-18", "2028-04-17")).toBe(34);
    expect(ageOn("2000-02-29", "2028-04-17")).toBe(28);
  });
  test("faixas e categorias da tabela oficial", () => {
    expect(isComplete(V)).toBe(true);
    expect(findStandard(V, "M", 34)?.seconds).toBe(10500);
    expect(findStandard(V, "F", 35)?.seconds).toBe(12600);
    expect(findStandard(V, "X", 81)?.seconds).toBe(19200);
    expect(findStandard(V, "M", 17)).toBeNull();
  });
  test("Index Lab: maratona dentro da margem (15 min) e fora", () => {
    const base = { birthDate: "1990-06-10", category: "M" as const, distance: "MARATHON" as const, markDate: "2026-09-20", today: TODAY };
    const within = runIndexLab({ ...base, seconds: 10800 + 900 }, V);
    const outside = runIndexLab({ ...base, seconds: 10800 + 901 }, V);
    expect(within.ok && within.fit).toBe("WITHIN");
    expect(outside.ok && outside.fit).toBe("OUTSIDE");
    expect(within.ok && within.age).toBe(37);
    expect(within.ok && within.requiredPace).toBe("4:16 /km");
  });
  test("Index Lab: meia ×2 com 5 min de margem e aviso de que não é tempo oficial", () => {
    const r = runIndexLab({ birthDate: "1990-06-10", category: "M", distance: "HALF", seconds: 5550, markDate: "2026-09-20", today: TODAY }, V);
    expect(r.ok && r.fit).toBe("WITHIN");
    expect(r.ok && r.notes.join(" ")).toMatch(/exclusiva da BORA/);
    expect(r.ok && r.officialQualifies).toBeNull();
  });
  test("Index Lab: casos especiais, idade mínima, data no futuro e tabela ausente", () => {
    const special = runIndexLab({ birthDate: "1990-06-10", category: "OTHER", distance: "MARATHON", seconds: 12000, markDate: "2026-09-20", today: TODAY }, V);
    expect(special.ok && special.fit).toBe("MANUAL_REVIEW");
    const young = runIndexLab({ birthDate: "2010-05-01", category: "F", distance: "MARATHON", seconds: 12000, markDate: "2026-09-20", today: TODAY }, V);
    expect(young.ok && young.fit).toBe("UNDER_MIN_AGE");
    const future = runIndexLab({ birthDate: "1990-06-10", category: "F", distance: "MARATHON", seconds: 12000, markDate: "2026-12-01", today: TODAY }, V);
    expect(future.ok).toBe(false);
    expect(runIndexLab({ birthDate: "1990-06-10", category: "F", distance: "MARATHON", seconds: 12000, markDate: "2026-09-20", today: TODAY }, null).ok).toBe(false);
  });
});

test.describe("régua interna (triagem)", () => {
  const base = { birthDate: "1990-06-10", category: "M" as const, distance: "MARATHON" as const, seconds: 10800, markDate: "2026-09-20",
    targetChoice: "RACE" as const, targetRaceId: "rio", sessions4plus: true, injury: false, today: TODAY };
  test("na régua → elegível", () => expect(computePrelim(base, V).result).toBe("ELIGIBLE"));
  test("lesão → Agora não (mesmo com marca boa)", () => expect(computePrelim({ ...base, injury: true }, V).result).toBe("NOT_NOW"));
  test("sem prova alvo ou poucos treinos → Quase lá, com todos os motivos", () => {
    const r = computePrelim({ ...base, targetChoice: "NONE", targetRaceId: null, sessions4plus: false }, V);
    expect(r.result).toBe("ALMOST");
    expect(r.reasons).toEqual(expect.arrayContaining(["no_target_race", "frequency_below_min"]));
  });
  test("marca fora da janela recente (18 meses, proposta)", () => {
    expect(computePrelim({ ...base, markDate: "2025-05-19" }, V).reasons).toContain("mark_not_recent");
    expect(computePrelim({ ...base, markDate: "2025-05-20" }, V).reasons).not.toContain("mark_not_recent");
  });
  test("subtração de meses igual ao Postgres", () => {
    expect(subtractMonths("2026-11-20", 18)).toBe("2025-05-20");
    expect(subtractMonths("2027-03-31", 1)).toBe("2027-02-28");
    expect(subtractMonths("2028-03-31", 1)).toBe("2028-02-29");
  });
});

test.describe("o que o atleta vê", () => {
  const sit = (o: Partial<AthleteSituation>): AthleteSituation => ({
    applicationStatus: "PRELIM_ALMOST", slaDueAt: "2026-11-25T23:59:59-03:00", nextReassessmentOn: null, membershipVerified: "PENDENTE",
    accessStatus: "CANDIDATE_ONLY", journeyStatus: "NONE", enrollment: null, openInfoRequest: false, ...o,
  });
  test("cenário 6 · Quase lá sem decisão: 'em análise', sem nenhuma menção ao NEXT", () => {
    for (const s of ["PRELIM_ALMOST", "UNDER_REVIEW", "PRELIM_ELIGIBLE", "SUBMITTED", "REASSESSMENT_PENDING", "PRELIM_NOT_NOW"] as const) {
      const v = athleteStatusView(sit({ applicationStatus: s }));
      expect(`${v.headline} ${v.body} ${v.label}`).not.toMatch(/NEXT/i);
    }
    expect(athleteStatusView(sit({})).headline).toBe("Sua candidatura está em análise pela coordenação técnica");
  });
  test("NEXT só aparece com jornada criada por decisão técnica", () => {
    const v = athleteStatusView(sit({ applicationStatus: "REASSESSMENT_PENDING", enrollment: { id: "e", journey: "BORA_NEXT", status: "OFFERED" } }));
    expect(v.headline).toMatch(/BORA NEXT/);
  });
  test("lesão: foco na recuperação, sem oferta de treino", () => {
    const v = athleteStatusView(sit({ applicationStatus: "PRELIM_NOT_NOW" }));
    expect(v.body).toMatch(/não há oferta de treino/);
  });
});

test.describe("utilitários", () => {
  test("WhatsApp em E.164", () => {
    expect(toE164("(61) 99999-0000")).toBe("+5561999990000");
    expect(toE164("+1 415 555 0100")).toBe("+14155550100");
    expect(toE164("123")).toBeNull();
  });
  test("e-mail escapa variáveis (sem HTML injetado)", () => {
    const m = renderEmail({ key: "t", subject: "Olá {{first_name}}", preheader: null, body: "Oi {{first_name}}.", cta_label: "Abrir", cta_path: "/passport" },
      { first_name: "<script>alert(1)</script>" }, "https://exemplo.com");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("https://exemplo.com/passport");
  });
});
