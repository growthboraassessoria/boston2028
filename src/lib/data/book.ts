// Monta os dados do livro (páginas 1–5) a partir do Passport + vitrine de benefícios.
import "server-only";
import { asUser } from "@/lib/db";
import { athleteStatusView, MEMBERSHIP_LABEL } from "@/lib/domain/athlete-status";
import { CATEGORY_LABEL } from "@/lib/domain/standards";
import { formatDuration, formatGap, MARATHON_KM, pacePerKm } from "@/lib/domain/time";
import type { BookData } from "@/components/passport/book/types";
import type { PassportData } from "./passport";

const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso));

const DIST_LABEL: Record<string, string> = { MARATHON: "Maratona", HALF: "Meia maratona", "10K": "10 km", "5K": "5 km", "3K": "3 km" };

export async function buildBook(d: PassportData, avatarUrl: string | null): Promise<BookData> {
  const status = athleteStatusView(d.situation);
  const e = d.situation.enrollment;
  const a = d.application;

  const journeyActive = e?.status === "ACTIVE";
  const decided = a && ["TECH_APPROVED", "TECH_NOT_APPROVED", "REASSESSMENT_PENDING"].includes(a.status ?? "");
  const steps: BookData["journey"]["steps"] = [
    { label: "Passaporte emitido", state: "done" },
    { label: "Candidatura enviada", state: a?.submittedAt ? "done" : "current" },
    { label: "Avaliação técnica", state: !a?.submittedAt ? "todo" : decided || e ? "done" : "current" },
    { label: e?.journey === "BORA_NEXT" ? "BORA NEXT" : "Road to Boston 2028", state: journeyActive ? "current" : e ? "current" : "todo" },
    { label: "Prova alvo 2027", state: "todo" },
    { label: "Boston 2028 (índice e inscrição B.A.A.)", state: "todo" },
  ];

  // Melhor marca em equivalente de maratona (meia × 2 só como referência interna).
  const markPoints = d.marks
    .filter((m) => m.distance === "MARATHON" || m.distance === "HALF")
    .map((m) => ({ ...m, equivalent: m.distance === "HALF" ? m.seconds * 2 : m.seconds }));
  const best = markPoints.reduce<(typeof markPoints)[number] | null>((acc, m) => (!acc || m.equivalent < acc.equivalent ? m : acc), null);
  const points = [
    ...markPoints.map((m) => ({ label: `${DIST_LABEL[m.distance]} ${fmtDate(m.date)}`, seconds: m.equivalent, kind: "mark" as const, date: m.date })),
  ].sort((x, y) => x.date.localeCompare(y.date)).map(({ label, seconds, kind }) => ({ label, seconds, kind }));

  const catalog = await asUser(d.user, (tx) => tx`select slug, title, partner_name, eligible, lock_reason from rtb.my_benefit_catalog() limit 20`).catch(() => []);
  const [red] = await asUser(d.user, (tx) => tx`select count(*)::int as n from rtb.benefit_redemptions where user_id = ${d.user.id}`);

  const stampsEarned = new Set(d.stamps.map((s) => s.slug));
  const upcoming = ([["teste-3k", "Teste 3 km"], ["teste-5k", "Teste 5 km"], ["teste-10k", "Teste 10 km"], ["teste-21k", "Teste 21 km"], ["bora-42k", "BORA 42K"]] as const)
    .filter(([slug]) => !stampsEarned.has(slug)).map(([, name]) => name);

  return {
    firstName: d.profile.firstName,
    fullName: d.profile.fullName,
    city: d.profile.city,
    uf: d.profile.uf,
    passportNumber: d.profile.passportNumber,
    issuedAt: fmtDate(d.profile.issuedAt),
    categoryLabel: CATEGORY_LABEL[d.profile.category],
    ageGroup: a?.ageGroup ?? null,
    membershipLabel: MEMBERSHIP_LABEL[d.situation.membershipVerified],
    status,
    qrUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/v/${d.profile.passportToken}`,
    avatarUrl,
    journey: {
      kind: e?.journey ?? null,
      enrollmentStatus: e?.status ?? null,
      coachName: d.coachName,
      message: a?.athleteMessage ?? null,
      targetRace: a?.targetRace ?? null,
      targetRaceDate: a?.targetRaceDate ? fmtDate(a.targetRaceDate) : null,
      targetRaceConfirmed: !!a?.targetRaceConfirmed,
      steps,
    },
    stamps: d.stamps.map((s) => ({ slug: s.slug, name: s.name, kind: (s.kind as BookData["stamps"][number]["kind"]) ?? "stamp", date: fmtDate(s.awardedAt) })),
    upcomingStamps: upcoming.slice(0, Math.max(0, 6 - d.stamps.length)),
    evolution: {
      unlocked: d.situation.accessStatus === "ACTIVE_MEMBER" && (d.situation.journeyStatus === "ROAD_TO_BOSTON" || d.situation.journeyStatus === "BORA_NEXT"),
      best: best ? {
        label: best.distance === "HALF" ? `Meia ${formatDuration(best.seconds)} × 2 (estimativa interna)` : `Maratona${best.race ? ` · ${best.race}` : ""}`,
        time: formatDuration(best.equivalent), pace: pacePerKm(best.equivalent, MARATHON_KM), date: fmtDate(best.date),
      } : null,
      reference: a?.standardSeconds ? `${formatDuration(a.standardSeconds)}${a.ageGroup ? ` (${a.ageGroup})` : ""}` : null,
      gap: best && a?.standardSeconds ? formatGap(best.equivalent - a.standardSeconds) : null,
      points,
      referenceSeconds: a?.standardSeconds ?? null,
      nextReassessment: d.situation.nextReassessmentOn ? fmtDate(d.situation.nextReassessmentOn) : null,
      goals: d.goals.filter((g) => g.status === "ACTIVE").map((g) => ({
        title: g.title,
        detail: [g.targetDistance ? DIST_LABEL[g.targetDistance] : null, g.targetSeconds ? formatDuration(g.targetSeconds) : null, g.dueOn ? `até ${fmtDate(g.dueOn)}` : null].filter(Boolean).join(" · ") || "em andamento",
      })),
    },
    benefits: {
      availableCount: catalog.filter((c) => c.eligible).length,
      top: catalog.slice(0, 3).map((c) => ({ slug: c.slug, title: c.title, partner: c.partner_name, locked: c.eligible ? null : c.lock_reason })),
      redemptions: red?.n ?? 0,
    },
  };
}
