// Dados públicos (views curadas, papel anon). Se o banco cair, a página mostra "indisponível" — nunca números inventados.
import "server-only";
import { cache } from "react";
import { asAnon } from "@/lib/db";
import type { StandardsVersion } from "@/lib/domain/standards";

export type PublicRace = {
  id: string; slug: string; name: string; city: string; country: string;
  raceDate: string | null; raceDateConfirmed: boolean; enrollmentDeadline: string | null;
  deadlineConfirmed: boolean; status: string;
};

export type CalendarItem = { key: string; label: string; when: string; status: string };

export const getActiveStandards = cache(async (): Promise<StandardsVersion | null> => {
  try {
    const rows = await asAnon((tx) => tx`
      select version_id, label, race_date::text as race_date, min_age, source_url, source_title,
             consulted_at, notes, category, age_min, age_max, standard_seconds
      from rtb.v_public_standards order by category, age_min`);
    if (!rows.length) return null;
    const first = rows[0]!;
    return {
      versionId: first.version_id,
      label: first.label,
      raceDate: first.race_date,
      minAge: first.min_age,
      sourceUrl: first.source_url,
      sourceTitle: first.source_title,
      consultedAt: new Date(first.consulted_at).toISOString(),
      notes: first.notes,
      rows: rows.map((r) => ({ category: r.category, ageMin: r.age_min, ageMax: r.age_max, seconds: r.standard_seconds })),
    };
  } catch (e) {
    console.error("[public] standards indisponíveis:", (e as Error).message);
    return null;
  }
});

export const getRaces = cache(async (): Promise<PublicRace[]> => {
  try {
    const rows = await asAnon((tx) => tx`
      select id, slug, name, city, country, race_date::text as race_date, race_date_confirmed,
             enrollment_deadline::text as enrollment_deadline, deadline_confirmed, status
      from rtb.v_public_races order by sort_order`);
    return rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, city: r.city, country: r.country,
      raceDate: r.race_date, raceDateConfirmed: r.race_date_confirmed,
      enrollmentDeadline: r.enrollment_deadline, deadlineConfirmed: r.deadline_confirmed, status: r.status,
    }));
  } catch (e) {
    console.error("[public] provas indisponíveis:", (e as Error).message);
    return [];
  }
});

export const getContent = cache(async <T,>(key: string): Promise<T | null> => {
  try {
    const rows = await asAnon((tx) => tx`select value from rtb.v_public_content where key = ${key}`);
    return (rows[0]?.value as T) ?? null;
  } catch {
    return null;
  }
});

export async function getCalendar(): Promise<CalendarItem[]> {
  const value = await getContent<{ items: CalendarItem[] }>("calendar");
  return value?.items ?? [];
}
