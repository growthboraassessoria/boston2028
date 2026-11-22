// Tudo o que o Passport mostra, lido como o próprio atleta (RLS). Uma transação por página.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import type { AthleteSituation } from "@/lib/domain/athlete-status";

export type PassportData = {
  user: SessionUser;
  profile: {
    fullName: string; preferredName: string | null; firstName: string; birthDate: string; email: string; phone: string | null;
    city: string | null; uf: string | null; category: "M" | "F" | "X" | "OTHER"; passportNumber: string; passportToken: string;
    issuedAt: string; avatarPath: string | null; publicProfile: boolean; rankingOptIn: boolean;
  };
  situation: AthleteSituation;
  application: {
    id: string; status: AthleteSituation["applicationStatus"]; submittedAt: string | null; ageGroup: string | null;
    standardSeconds: number | null; gapSeconds: number | null; projectedSeconds: number | null; targetRace: string | null;
    targetRaceDate: string | null; targetRaceConfirmed: boolean; athleteMessage: string | null; lateEntry: boolean;
  } | null;
  coachName: string | null;
  membershipDeclared: string;
  stamps: { slug: string; name: string; description: string; kind: string; awardedAt: string }[];
  marks: { distance: string; seconds: number; date: string; race: string | null }[];
  tests: { name: string; distanceM: number | null; seconds: number; status: string; level: string | null; pct: number | null; month: string }[];
  goals: { id: string; title: string; targetDistance: string | null; targetSeconds: number | null; dueOn: string | null; status: string }[];
  unread: number;
};

export const getPassport = cache(async (): Promise<PassportData> => {
  const user = await requireUser("/passport");
  const data = await asUser(user, async (tx) => {
    const [p] = await tx`select * from rtb.profiles where user_id = ${user.id} and deleted_at is null`;
    if (!p) return null;
    const [s] = await tx`select * from rtb.athlete_states where user_id = ${user.id}`;
    const [a] = await tx`
      select a.*, r.name as race_name, r.race_date::text as race_date, r.race_date_confirmed
      from rtb.applications a left join rtb.target_races r on r.id = a.target_race_id
      where a.user_id = ${user.id} and a.cycle_id = rtb.current_cycle_id()`;
    const [e] = await tx`
      select id, journey, status from rtb.journey_enrollments
      where user_id = ${user.id} and status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED')
      order by created_at desc limit 1`;
    const [info] = await tx`select 1 as ok from rtb.info_requests where user_id = ${user.id} and status = 'OPEN' limit 1`;
    const [coach] = await tx`
      select sd.display_name from rtb.athlete_coach_assignments c join rtb.staff_directory sd on sd.user_id = c.coach_user_id
      where c.athlete_id = ${user.id} and c.ends_at is null limit 1`;
    const [claim] = await tx`select answer from rtb.membership_claims where user_id = ${user.id} order by created_at desc limit 1`;
    const stamps = await tx`
      select b.slug, b.name, b.description, b.kind, e.awarded_at from rtb.earned_badges e join rtb.badge_definitions b on b.id = e.badge_id
      where e.user_id = ${user.id} order by e.awarded_at`;
    const marks = await tx`select distance, seconds, mark_date::text as d, race_name from rtb.performance_marks where user_id = ${user.id} order by mark_date`;
    const tests = await tx`
      select t.name, t.distance_m, r.seconds, r.status, r.level, r.normalized_pct, t.planned_month::text as m
      from rtb.test_results r join rtb.tests t on t.id = r.test_id where r.user_id = ${user.id} order by t.planned_month`;
    const goals = await tx`select id, title, target_distance, target_seconds, due_on::text as due_on, status from rtb.training_goals where user_id = ${user.id} order by created_at`;
    const [unread] = await tx`select count(*)::int as n from rtb.notifications where user_id = ${user.id} and read_at is null`;
    return { p, s, a, e, info, coach, claim, stamps, marks, tests, goals, unread };
  });
  if (!data) redirect("/cadastro");
  const { p, s, a, e, info, coach, claim, stamps, marks, tests, goals, unread } = data;
  return {
    user,
    profile: {
      fullName: p.full_name, preferredName: p.preferred_name, firstName: p.preferred_name || String(p.full_name).split(" ")[0],
      birthDate: String(p.birth_date instanceof Date ? p.birth_date.toISOString().slice(0, 10) : p.birth_date).slice(0, 10),
      email: p.email, phone: p.phone_e164, city: p.city, uf: p.uf, category: p.reference_category, passportNumber: p.passport_number,
      passportToken: p.passport_token, issuedAt: new Date(p.passport_issued_at).toISOString(), avatarPath: p.avatar_path,
      publicProfile: p.public_profile, rankingOptIn: p.ranking_opt_in,
    },
    situation: {
      applicationStatus: a?.status ?? null,
      slaDueAt: a?.sla_due_at ? new Date(a.sla_due_at).toISOString() : null,
      nextReassessmentOn: a?.next_reassessment_on ? String(a.next_reassessment_on instanceof Date ? a.next_reassessment_on.toISOString() : a.next_reassessment_on).slice(0, 10) : null,
      membershipVerified: s?.membership_verified ?? "PENDENTE",
      accessStatus: s?.access_status ?? "CANDIDATE_ONLY",
      journeyStatus: s?.journey_status ?? "NONE",
      enrollment: e ? { id: e.id, journey: e.journey, status: e.status } : null,
      openInfoRequest: !!info,
    },
    application: a ? {
      id: a.id, status: a.status, submittedAt: a.submitted_at ? new Date(a.submitted_at).toISOString() : null, ageGroup: a.age_group,
      standardSeconds: a.standard_seconds, gapSeconds: a.gap_seconds, projectedSeconds: a.projected_marathon_seconds,
      targetRace: a.race_name, targetRaceDate: a.race_date, targetRaceConfirmed: !!a.race_date_confirmed,
      athleteMessage: a.athlete_message, lateEntry: a.late_entry,
    } : null,
    coachName: coach?.display_name ?? null,
    membershipDeclared: claim?.answer ?? "NAO_INFORMADO",
    stamps: stamps.map((x) => ({ slug: x.slug, name: x.name, description: x.description, kind: x.kind, awardedAt: new Date(x.awarded_at).toISOString() })),
    marks: marks.map((m) => ({ distance: m.distance, seconds: m.seconds, date: m.d, race: m.race_name })),
    tests: tests.map((t) => ({ name: t.name, distanceM: t.distance_m, seconds: t.seconds, status: t.status, level: t.level,
      pct: t.normalized_pct === null ? null : Number(t.normalized_pct), month: t.m })),
    goals: goals.map((g) => ({ id: g.id, title: g.title, targetDistance: g.target_distance, targetSeconds: g.target_seconds, dueOn: g.due_on, status: g.status })),
    unread: unread?.n ?? 0,
  };
});
