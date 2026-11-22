-- BORA Road to Boston 2028 · 2/8 · candidatura, análise técnica, jornadas, testes, comercial e comunicação

begin;

-- ───────────────────────── Candidatura ─────────────────────────

create table rtb.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_id uuid not null references rtb.program_cycles (id),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SUBMITTED', 'PRELIM_ELIGIBLE', 'PRELIM_ALMOST', 'PRELIM_NOT_NOW', 'UNDER_REVIEW',
    'NEEDS_INFO', 'TECH_APPROVED', 'TECH_NOT_APPROVED', 'REASSESSMENT_PENDING', 'WITHDRAWN'
  )),
  -- Triagem preliminar automática (nunca decide: só ordena a fila do Lucas).
  prelim_result text check (prelim_result in ('ELIGIBLE', 'ALMOST', 'NOT_NOW', 'MANUAL_REVIEW')),
  prelim_reasons text[] not null default '{}',
  standard_version_id uuid references rtb.standard_versions (id),
  category text check (category in ('M', 'F', 'X', 'OTHER')),
  age_on_race_day int,
  age_group text,
  standard_seconds int,
  projected_marathon_seconds int,
  gap_seconds int,
  target_race_choice text check (target_race_choice in ('RACE', 'NONE')),
  target_race_id uuid references rtb.target_races (id),
  sessions_4plus boolean,
  mark_id uuid,
  availability_note text check (availability_note is null or length(availability_note) <= 500),
  late_entry boolean not null default false,
  submitted_at timestamptz,
  sla_due_at timestamptz,
  first_contact_at timestamptz,
  reviewer_id uuid references auth.users (id) on delete set null,
  athlete_message text check (athlete_message is null or length(athlete_message) <= 1000),
  next_reassessment_on date,
  withdrawn_at timestamptz,
  idempotency_key text unique check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id),
  check (target_race_choice is distinct from 'RACE' or target_race_id is not null)
);
create index applications_status_created on rtb.applications (status, created_at desc);
create index applications_sla on rtb.applications (sla_due_at)
  where status in ('PRELIM_ALMOST', 'UNDER_REVIEW') and first_contact_at is null;
create index applications_target on rtb.applications (target_race_id);
create index applications_user on rtb.applications (user_id);
create trigger applications_touch before update on rtb.applications for each row execute function rtb.touch_updated_at();

create table rtb.performance_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  distance text not null check (distance in ('MARATHON', 'HALF', '10K', '5K', '3K')),
  seconds int not null,
  mark_date date not null check (mark_date >= date '2015-01-01'),
  race_name text check (race_name is null or length(race_name) <= 120),
  evidence_document_id uuid,
  source text not null default 'self_declared' check (source in ('self_declared', 'test', 'verified')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- Tempos fisicamente plausíveis por distância (abaixo dos recordes mundiais é erro de digitação).
  check (
    (distance = 'MARATHON' and seconds between 7200 and 32400) or
    (distance = 'HALF' and seconds between 3300 and 16200) or
    (distance = '10K' and seconds between 1500 and 7200) or
    (distance = '5K' and seconds between 720 and 3600) or
    (distance = '3K' and seconds between 420 and 2400)
  )
);
create index performance_marks_user on rtb.performance_marks (user_id, mark_date desc);
alter table rtb.applications add constraint applications_mark_fk foreign key (mark_id) references rtb.performance_marks (id) on delete set null;

-- Saúde: só Sim/Não, tabela separada, acesso restrito (dono e coordenação técnica). Retenção definida.
create table rtb.application_health (
  application_id uuid primary key references rtb.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  injury_in_treatment boolean not null,
  consent_id uuid references rtb.consents (id) on delete set null,
  retain_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger application_health_touch before update on rtb.application_health for each row execute function rtb.touch_updated_at();

-- Campos extras configuráveis do formulário.
create table rtb.application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rtb.applications (id) on delete cascade,
  question_key text not null check (question_key ~ '^[a-z0-9_.]{2,60}$'),
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (application_id, question_key)
);

-- Comprovantes (bucket privado). Caminho escopado por usuário.
create table rtb.application_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references rtb.applications (id) on delete cascade,
  kind text not null check (kind in ('MARK_PROOF', 'INFO_RESPONSE', 'OTHER')),
  bucket text not null default 'rtb-private' check (bucket = 'rtb-private'),
  storage_path text not null unique check (storage_path ~ '^users/[0-9a-f-]{36}/'),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  original_name text check (original_name is null or length(original_name) <= 200),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index application_documents_app on rtb.application_documents (application_id);
alter table rtb.performance_marks add constraint performance_marks_evidence_fk
  foreign key (evidence_document_id) references rtb.application_documents (id) on delete set null;

-- ───────────────────────── Análise técnica (Lucas / delegado) ─────────────────────────

create table rtb.technical_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rtb.applications (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  note text not null check (length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index technical_reviews_app on rtb.technical_reviews (application_id, created_at desc);

-- Decisão técnica humana: append-only, reversível só por nova decisão (supersedes_id).
create table rtb.technical_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rtb.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('APPROVE_ROAD', 'NOT_APPROVED', 'FORWARD_NEXT', 'REQUEST_INFO', 'KEEP_MONITORING')),
  reason text not null check (length(btrim(reason)) between 5 and 4000),
  next_step text not null check (length(btrim(next_step)) between 3 and 1000),
  next_step_on date,
  message_to_athlete text check (message_to_athlete is null or length(message_to_athlete) <= 1000),
  decided_by uuid not null references auth.users (id),
  decided_role text not null check (decided_role = 'technical_director'),
  supersedes_id uuid references rtb.technical_decisions (id),
  from_status text not null,
  to_status text not null,
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  created_at timestamptz not null default now()
);
create index technical_decisions_app on rtb.technical_decisions (application_id, created_at desc);
create trigger technical_decisions_immutable before update or delete on rtb.technical_decisions
  for each row execute function rtb.block_direct_mutation();

create table rtb.info_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rtb.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid references rtb.technical_decisions (id),
  requested_by uuid not null references auth.users (id),
  message text not null check (length(btrim(message)) between 5 and 2000),
  status text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CANCELLED')),
  response text check (response is null or length(response) <= 4000),
  document_id uuid references rtb.application_documents (id) on delete set null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz
);
create index info_requests_app on rtb.info_requests (application_id, status);

-- Tentativas de contato (SLA de 3 dias úteis para "Quase lá").
create table rtb.contact_attempts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references rtb.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  channel text not null check (channel in ('whatsapp', 'phone', 'email', 'in_person', 'other')),
  outcome text not null check (outcome in ('reached', 'no_answer', 'left_message', 'wrong_contact', 'scheduled')),
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index contact_attempts_app on rtb.contact_attempts (application_id, created_at desc);

-- Cronologia unificada. visibility = athlete aparece no Passport; internal só no OS.
create table rtb.application_events (
  id bigint generated always as identity primary key,
  application_id uuid references rtb.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type ~ '^[a-z0-9_.]{2,60}$'),
  from_status text,
  to_status text,
  actor_id uuid references auth.users (id) on delete set null,
  visibility text not null default 'internal' check (visibility in ('athlete', 'internal')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index application_events_user on rtb.application_events (user_id, created_at desc);
create index application_events_app on rtb.application_events (application_id, created_at desc);
create trigger application_events_immutable before update or delete on rtb.application_events
  for each row execute function rtb.block_direct_mutation();

-- ───────────────────────── Jornadas ─────────────────────────

-- Toda jornada nasce de uma decisão técnica humana (decision_id obrigatório e conferido por gatilho).
create table rtb.journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references rtb.applications (id) on delete cascade,
  cycle_id uuid not null references rtb.program_cycles (id),
  journey text not null check (journey in ('ROAD_TO_BOSTON', 'BORA_NEXT')),
  status text not null check (status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  decision_id uuid not null references rtb.technical_decisions (id),
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  activated_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason is null or length(end_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ACTIVE' or activated_at is not null)
);
create unique index journey_one_open on rtb.journey_enrollments (user_id, cycle_id)
  where status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED');
create index journey_status on rtb.journey_enrollments (journey, status);
create trigger journey_enrollments_touch before update on rtb.journey_enrollments for each row execute function rtb.touch_updated_at();

create or replace function rtb.guard_enrollment_decision() returns trigger
language plpgsql set search_path = '' as $$
declare v_dec rtb.technical_decisions%rowtype;
begin
  select * into v_dec from rtb.technical_decisions where id = new.decision_id;
  if v_dec.id is null then
    raise exception 'enrollment_requires_decision';
  end if;
  if v_dec.application_id <> new.application_id or v_dec.user_id <> new.user_id then
    raise exception 'enrollment_decision_mismatch';
  end if;
  if (new.journey = 'BORA_NEXT' and v_dec.decision <> 'FORWARD_NEXT')
     or (new.journey = 'ROAD_TO_BOSTON' and v_dec.decision <> 'APPROVE_ROAD') then
    raise exception 'enrollment_decision_type_mismatch: % exige decisão própria', new.journey;
  end if;
  if v_dec.decided_role <> 'technical_director' then
    raise exception 'enrollment_requires_technical_decision';
  end if;
  return new;
end $$;
create trigger journey_enrollments_guard before insert or update of decision_id, journey on rtb.journey_enrollments
  for each row execute function rtb.guard_enrollment_decision();

create table rtb.athlete_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);
create unique index coach_assignment_one_active on rtb.athlete_coach_assignments (athlete_id) where ends_at is null;
create index coach_assignment_coach on rtb.athlete_coach_assignments (coach_user_id) where ends_at is null;

create table rtb.training_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  journey text not null check (journey in ('ROAD_TO_BOSTON', 'BORA_NEXT')),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text check (description is null or length(description) <= 1000),
  target_distance text check (target_distance in ('MARATHON', 'HALF', '10K', '5K', '3K')),
  target_seconds int check (target_seconds is null or target_seconds between 420 and 32400),
  due_on date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ACHIEVED', 'MISSED', 'CANCELLED')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index training_goals_user on rtb.training_goals (user_id, status);
create trigger training_goals_touch before update on rtb.training_goals for each row execute function rtb.touch_updated_at();

create table rtb.reassessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references rtb.applications (id) on delete cascade,
  decision_id uuid references rtb.technical_decisions (id),
  scheduled_for date not null,
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'DONE', 'CANCELLED')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index reassessments_due on rtb.reassessments (scheduled_for) where status = 'SCHEDULED';
create index reassessments_user on rtb.reassessments (user_id);

-- ───────────────────────── Testes e gamificação ─────────────────────────

create table rtb.tests (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references rtb.program_cycles (id),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  distance_m int check (distance_m is null or distance_m between 1000 and 42195),
  planned_month date not null,
  test_date date,
  date_confirmed boolean not null default false,
  format_note text check (format_note is null or length(format_note) <= 300),
  badge_slug text,
  status text not null default 'planned' check (status in ('planned', 'open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (cycle_id, slug),
  check (not date_confirmed or test_date is not null)
);

create table rtb.test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references rtb.tests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seconds int not null check (seconds between 420 and 32400),
  evidence_document_id uuid references rtb.application_documents (id) on delete set null,
  source text not null default 'self_reported' check (source in ('self_reported', 'coach_recorded', 'chip_timing')),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'VALIDATED', 'REJECTED')),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 500),
  equivalent_marathon_seconds int,
  reference_seconds int,
  normalized_pct numeric(6, 2),
  level text check (level in ('BOSTON_SEGURO', 'INDICE', 'NA_ROTA', 'EM_PREPARACAO')),
  formula_version text,
  created_at timestamptz not null default now(),
  unique (test_id, user_id)
);
create index test_results_status on rtb.test_results (test_id, status);

create table rtb.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  description text not null,
  kind text not null default 'stamp' check (kind in ('stamp', 'seal', 'milestone')),
  icon text not null default 'stamp',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table rtb.earned_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id uuid not null references rtb.badge_definitions (id),
  source_ref text not null default 'manual' check (length(source_ref) <= 120),
  note text check (note is null or length(note) <= 300),
  awarded_by uuid references auth.users (id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id, source_ref)
);
create index earned_badges_user on rtb.earned_badges (user_id, awarded_at desc);

-- ───────────────────────── Comercial ─────────────────────────

-- Só nasce por regra do fluxo (aprovado ou recomendado ao NEXT sem matrícula ativa). Não registra receita.
create table rtb.commercial_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references rtb.applications (id) on delete set null,
  origin text not null check (origin in ('ROAD_APPROVED_NON_MEMBER', 'NEXT_FORWARDED_NON_MEMBER', 'FORMER_MEMBER_RETURN', 'OTHER')),
  status text not null default 'OPEN' check (status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'WON', 'LOST', 'ON_HOLD')),
  owner_id uuid references auth.users (id) on delete set null,
  next_action text check (next_action is null or length(next_action) <= 300),
  next_action_on date,
  lost_reason text check (lost_reason is null or length(lost_reason) <= 300),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index commercial_one_open on rtb.commercial_opportunities (user_id) where status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD');
create index commercial_status on rtb.commercial_opportunities (status, created_at desc);
create trigger commercial_opportunities_touch before update on rtb.commercial_opportunities for each row execute function rtb.touch_updated_at();

create table rtb.commercial_activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references rtb.commercial_opportunities (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('note', 'call', 'message', 'meeting', 'status_change', 'system')),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index commercial_activities_opp on rtb.commercial_activities (opportunity_id, created_at desc);

-- Vínculo com cobrança externa (nunca dados de cartão).
create table rtb.subscription_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('running', 'manual', 'other')),
  external_ref text check (external_ref is null or length(external_ref) <= 120),
  status text not null default 'unknown' check (status in ('unknown', 'active', 'past_due', 'cancelled')),
  observed_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Comunicação ─────────────────────────

create table rtb.message_templates (
  key text primary key check (key ~ '^[a-z0-9_]{3,60}$'),
  channel text not null default 'email' check (channel in ('email')),
  kind text not null default 'transactional' check (kind in ('transactional', 'automation', 'marketing')),
  subject text not null check (length(subject) between 3 and 160),
  preheader text check (preheader is null or length(preheader) <= 200),
  body text not null check (length(body) between 10 and 8000),
  cta_label text check (cta_label is null or length(cta_label) <= 40),
  cta_path text check (cta_path is null or cta_path ~ '^/'),
  active boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table rtb.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9_.]{2,60}$'),
  title text not null check (length(title) between 2 and 140),
  body text check (body is null or length(body) <= 1000),
  action_url text check (action_url is null or action_url ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on rtb.notifications (user_id, created_at desc);
create index notifications_unread on rtb.notifications (user_id) where read_at is null;

-- Fila de e-mails. "accepted" = o provedor aceitou (id devolvido); "delivered" só com webhook.
create table rtb.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  to_email extensions.citext not null,
  template_key text not null references rtb.message_templates (key),
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'delivered', 'bounced', 'failed', 'suppressed', 'cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider text,
  provider_message_id text,
  last_error text check (last_error is null or length(last_error) <= 500),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);
create index email_outbox_queue on rtb.email_outbox (next_attempt_at) where status = 'queued';
create index email_outbox_provider on rtb.email_outbox (provider_message_id) where provider_message_id is not null;
create index email_outbox_created on rtb.email_outbox (created_at desc);

create table rtb.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references rtb.email_outbox (id) on delete cascade,
  provider text not null,
  provider_event_id text unique,
  event_type text not null check (length(event_type) <= 60),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

commit;
