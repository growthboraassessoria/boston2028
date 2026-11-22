-- BORA Road to Boston 2028 · 6/8 · views
-- Públicas (anon): só dado aprovado e sem identificação pessoal. Rodam com o dono e escolhem colunas a dedo.
-- OS: security_invoker = true, então o RLS de cada tabela vale para quem consulta.

begin;

create or replace view rtb.v_public_standards as
  select v.id as version_id, v.label, v.applies_to_years, v.race_date, v.min_age, v.source_url, v.source_title,
         v.consulted_at, v.notes, s.category, s.age_min, s.age_max, s.standard_seconds
  from rtb.standard_versions v
  join rtb.qualification_standards s on s.version_id = v.id
  where v.status = 'active';

create or replace view rtb.v_public_races as
  select id, slug, name, city, country, race_date, race_date_confirmed, enrollment_deadline, deadline_confirmed,
         sixteen_weeks_checked, official_url, status, sort_order
  from rtb.target_races
  where status <> 'archived';

create or replace view rtb.v_public_tests as
  select t.id, t.slug, t.name, t.distance_m, t.planned_month, t.test_date, t.date_confirmed, t.format_note, t.status
  from rtb.tests t
  join rtb.program_cycles c on c.id = t.cycle_id and c.is_current
  where t.status <> 'cancelled';

create or replace view rtb.v_public_content as
  select key, value, legal_review, updated_at from rtb.site_content where status = 'published';

create or replace view rtb.v_public_media as
  select id, bucket, path, alt, credit, usage_slot from rtb.media_assets where approved;

create or replace view rtb.v_public_cycle as
  select slug, name, boston_year, starts_on, ends_on, applications_open_at, applications_close_at, status
  from rtb.program_cycles where is_current;

-- Mural/ranking público: só com o flag ligado E opt-in do atleta. Nome curto (primeiro nome + inicial) e cidade.
create or replace view rtb.v_public_ranking as
  select r.test_id, t.name as test_name, t.planned_month,
         coalesce(nullif(p.preferred_name, ''), split_part(p.full_name, ' ', 1)) || ' ' ||
           left(split_part(p.full_name, ' ', greatest(array_length(string_to_array(p.full_name, ' '), 1), 1)), 1) || '.' as display_name,
         p.city, p.uf, s.polo, r.normalized_pct, r.level,
         rank() over (partition by r.test_id order by r.normalized_pct) as position
  from rtb.test_results r
  join rtb.tests t on t.id = r.test_id
  join rtb.profiles p on p.user_id = r.user_id and p.deleted_at is null and p.ranking_opt_in
  join rtb.athlete_states s on s.user_id = r.user_id
  where r.status = 'VALIDATED' and r.normalized_pct is not null
    and s.journey_status = 'ROAD_TO_BOSTON'
    and coalesce((select f.enabled from rtb.feature_flags f where f.key = 'ranking_public'), false);

grant select on rtb.v_public_standards, rtb.v_public_races, rtb.v_public_tests, rtb.v_public_content,
  rtb.v_public_media, rtb.v_public_cycle, rtb.v_public_ranking to anon, authenticated;

-- ───────────────────────── OS (respeitam o RLS de quem consulta) ─────────────────────────

create or replace view rtb.os_candidates with (security_invoker = true) as
  select a.id as application_id, a.user_id, a.status, a.prelim_result, a.prelim_reasons, a.category, a.age_on_race_day,
         a.age_group, a.standard_seconds, a.projected_marathon_seconds, a.gap_seconds, a.target_race_choice,
         a.target_race_id, tr.name as target_race_name, a.sessions_4plus, a.late_entry, a.submitted_at, a.sla_due_at,
         a.first_contact_at, a.reviewer_id, a.next_reassessment_on, a.created_at, a.updated_at,
         p.full_name, p.email, p.phone_e164, p.city, p.uf, p.passport_number, p.birth_date,
         s.membership_declared, s.membership_verified, s.access_status, s.journey_status, s.polo, s.automations_paused,
         m.distance as mark_distance, m.seconds as mark_seconds, m.mark_date, m.race_name as mark_race_name,
         (select sd.display_name from rtb.staff_directory sd where sd.user_id = a.reviewer_id) as reviewer_name,
         (select e.status from rtb.journey_enrollments e where e.application_id = a.id
            and e.status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED') order by e.created_at desc limit 1) as open_journey_status,
         (select e.journey from rtb.journey_enrollments e where e.application_id = a.id
            and e.status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED') order by e.created_at desc limit 1) as open_journey
  from rtb.applications a
  join rtb.profiles p on p.user_id = a.user_id
  join rtb.athlete_states s on s.user_id = a.user_id
  left join rtb.target_races tr on tr.id = a.target_race_id
  left join rtb.performance_marks m on m.id = a.mark_id
  where a.status <> 'DRAFT';

create or replace view rtb.os_members with (security_invoker = true) as
  select p.user_id, p.full_name, p.email, p.phone_e164, p.city, p.uf, p.passport_number, p.created_at,
         s.membership_declared, s.membership_verified, s.access_status, s.journey_status, s.polo,
         c.coach_name as declared_coach, c.support_point as declared_support_point, c.no_polo as declared_no_polo,
         c.created_at as declared_at,
         (select v.created_at from rtb.membership_verifications v where v.user_id = p.user_id order by v.created_at desc limit 1) as verified_at
  from rtb.profiles p
  join rtb.athlete_states s on s.user_id = p.user_id
  left join lateral (
    select mc.* from rtb.membership_claims mc where mc.user_id = p.user_id order by mc.created_at desc limit 1
  ) c on true
  where p.deleted_at is null;

create or replace view rtb.os_ranking with (security_invoker = true) as
  select r.id as result_id, r.test_id, t.name as test_name, t.planned_month, r.user_id, p.full_name, p.city, p.uf,
         s.polo, s.journey_status, r.seconds, r.status, r.normalized_pct, r.level, r.formula_version, p.ranking_opt_in,
         rank() over (partition by r.test_id, s.journey_status order by r.normalized_pct nulls last) as position
  from rtb.test_results r
  join rtb.tests t on t.id = r.test_id
  join rtb.profiles p on p.user_id = r.user_id
  join rtb.athlete_states s on s.user_id = r.user_id;

grant select on rtb.os_candidates, rtb.os_members, rtb.os_ranking to authenticated;

commit;
