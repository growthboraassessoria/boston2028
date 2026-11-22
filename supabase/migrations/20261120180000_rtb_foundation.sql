-- BORA Road to Boston 2028 · 1/8 · fundação
-- Projeto independente da BORA. Não afiliado nem endossado pela Boston Athletic Association.
-- Tudo mora no schema rtb (isolado do public), para rodar num projeto Supabase dedicado ou em um já existente.
-- Migração aditiva: não altera nem apaga nada fora do schema rtb.

begin;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists rtb;
comment on schema rtb is 'BORA Road to Boston 2028 (iniciativa independente da BORA; não afiliada à B.A.A.)';
revoke all on schema rtb from public;
grant usage on schema rtb to anon, authenticated, service_role;
-- Funções nascem executáveis por PUBLIC no Postgres: aqui não. Cada uma recebe o grant explícito.
alter default privileges in schema rtb revoke execute on functions from public;

create or replace function rtb.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── Configuração do programa ─────────────────────────

create table rtb.program_cycles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (length(name) between 3 and 120),
  boston_year int not null check (boston_year between 2027 and 2100),
  starts_on date,
  ends_on date,
  applications_open_at timestamptz,
  applications_close_at timestamptz,
  status text not null default 'planning' check (status in ('planning', 'open', 'running', 'closed', 'archived')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index program_cycles_one_current on rtb.program_cycles (is_current) where is_current;
create trigger program_cycles_touch before update on rtb.program_cycles for each row execute function rtb.touch_updated_at();

-- Regras configuráveis. status: approved (valendo), proposed (proposta, a confirmar), pending (aguardando decisão).
create table rtb.program_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{3,80}$'),
  value jsonb not null,
  status text not null default 'proposed' check (status in ('approved', 'proposed', 'pending')),
  description text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table rtb.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]{3,80}$'),
  enabled boolean not null default false,
  description text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Índices oficiais versionados (fonte primária: baa.org). Uma versão ativa por vez.
create table rtb.standard_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 3 and 120),
  applies_to_years int[] not null check (cardinality(applies_to_years) > 0),
  race_date date not null,
  age_reference text not null default 'race_day' check (age_reference in ('race_day')),
  min_age int not null default 18 check (min_age between 10 and 30),
  source_url text not null check (source_url ~ '^https://'),
  source_title text not null,
  consulted_at timestamptz not null,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index standard_versions_one_active on rtb.standard_versions ((status)) where status = 'active';

create table rtb.qualification_standards (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references rtb.standard_versions (id) on delete cascade,
  category text not null check (category in ('M', 'F', 'X')),
  age_min int not null check (age_min between 0 and 120),
  age_max int check (age_max is null or age_max >= age_min),
  standard_seconds int not null check (standard_seconds between 3600 and 36000),
  unique (version_id, category, age_min)
);
create index qualification_standards_version on rtb.qualification_standards (version_id, category);

-- Tabela publicada é imutável: mudança de índice = nova versão.
create or replace function rtb.guard_published_standards() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from rtb.standard_versions where id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'draft' then
    raise exception 'standards_version_locked' using hint = 'Crie uma nova versão em rascunho para mudar índices.';
  end if;
  return coalesce(new, old);
end $$;
create trigger qualification_standards_guard before insert or update or delete on rtb.qualification_standards
  for each row execute function rtb.guard_published_standards();

-- Provas alvo de 2027. Datas só entram como confirmadas com fonte oficial.
create table rtb.target_races (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  city text not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  race_date date,
  race_date_confirmed boolean not null default false,
  enrollment_deadline date,
  deadline_confirmed boolean not null default false,
  sixteen_weeks_checked boolean not null default false,
  official_url text check (official_url is null or official_url ~ '^https://'),
  status text not null default 'provisional' check (status in ('provisional', 'confirmed', 'archived')),
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not race_date_confirmed or race_date is not null),
  check (not deadline_confirmed or enrollment_deadline is not null)
);
create trigger target_races_touch before update on rtb.target_races for each row execute function rtb.touch_updated_at();

-- Calendário de dias úteis (SLA de 3 dias úteis). Fuso: America/Sao_Paulo.
create table rtb.business_holidays (
  day date primary key,
  label text not null,
  kind text not null default 'national' check (kind in ('national', 'optional', 'local')),
  created_at timestamptz not null default now()
);

-- CMS simples do site público (textos, FAQ, calendário com status editável).
create table rtb.site_content (
  key text primary key check (key ~ '^[a-z0-9_.-]{2,80}$'),
  value jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  legal_review boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Fotografia e mídia: só entra no site com licença registrada e aprovação.
create table rtb.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'rtb-public',
  path text not null,
  alt text not null check (length(alt) between 3 and 300),
  credit text,
  license text not null check (length(license) between 3 and 500),
  license_proof_path text,
  usage_slot text check (usage_slot is null or usage_slot ~ '^[a-z0-9_.-]{2,60}$'),
  approved boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path),
  check (not approved or approved_at is not null)
);

-- ───────────────────────── Campanhas e origem ─────────────────────────

create table rtb.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  utm_campaign text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table rtb.referral_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{3,40}$'),
  kind text not null check (kind in ('coach', 'athlete', 'partner', 'campaign', 'other')),
  label text not null,
  coach_user_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table rtb.utm_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  anon_key text check (anon_key is null or anon_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  touch text not null default 'first' check (touch in ('first', 'last', 'signup')),
  source text check (length(source) <= 120),
  medium text check (length(medium) <= 120),
  campaign text check (length(campaign) <= 160),
  term text check (length(term) <= 160),
  content text check (length(content) <= 160),
  referrer_host text check (length(referrer_host) <= 200),
  landing_path text check (length(landing_path) <= 300),
  referral_code text check (length(referral_code) <= 40),
  created_at timestamptz not null default now()
);
create index utm_attributions_user on rtb.utm_attributions (user_id);
create index utm_attributions_campaign on rtb.utm_attributions (campaign, created_at);

-- ───────────────────────── Identidade ─────────────────────────

create sequence rtb.passport_seq;

-- Perfil do atleta. CPF não é coletado no MVP (privacidade por padrão).
create table rtb.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  preferred_name text check (preferred_name is null or length(preferred_name) <= 40),
  birth_date date not null check (birth_date between date '1920-01-01' and date '2015-12-31'),
  email extensions.citext not null,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  city text check (city is null or length(city) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  country text not null default 'BR' check (country ~ '^[A-Z]{2}$'),
  reference_category text not null check (reference_category in ('M', 'F', 'X', 'OTHER')),
  category_note text check (category_note is null or length(category_note) <= 300),
  origin_coach text check (origin_coach is null or length(origin_coach) <= 120),
  avatar_path text,
  public_profile boolean not null default false,
  ranking_opt_in boolean not null default false,
  passport_number text not null unique default ('RTB28-' || lpad(nextval('rtb.passport_seq')::text, 5, '0')),
  passport_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  passport_issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index profiles_email_unique on rtb.profiles (email) where deleted_at is null;
create unique index profiles_phone_unique on rtb.profiles (phone_e164) where phone_e164 is not null and deleted_at is null;
create index profiles_location on rtb.profiles (uf, city);
create trigger profiles_touch before update on rtb.profiles for each row execute function rtb.touch_updated_at();

-- Diretório público interno da equipe (nome e função), para o atleta ver quem é o treinador sem expor dados pessoais.
create table rtb.staff_directory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 2 and 80),
  title text check (length(title) <= 80),
  polo text check (length(polo) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_directory_touch before update on rtb.staff_directory for each row execute function rtb.touch_updated_at();

-- Papéis por atribuição explícita no banco (nunca por nome ou e-mail). "athlete" é implícito: quem tem perfil.
create table rtb.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('super_admin', 'growth', 'technical_director', 'coach', 'commercial', 'membership_verifier', 'partner_operator')),
  scope_polo text check (scope_polo is null or length(scope_polo) <= 80),
  partner_id uuid,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  note text check (note is null or length(note) <= 500),
  check ((role = 'partner_operator') = (partner_id is not null))
);
create unique index user_roles_active_unique on rtb.user_roles (user_id, role, coalesce(scope_polo, ''), coalesce(partner_id::text, ''))
  where revoked_at is null;
create index user_roles_user on rtb.user_roles (user_id) where revoked_at is null;
create index user_roles_role on rtb.user_roles (role) where revoked_at is null;

-- Estado atual das três dimensões do atleta (vínculo, acesso, jornada). Só muda por função auditada.
create table rtb.athlete_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  membership_declared text not null default 'NAO_INFORMADO'
    check (membership_declared in ('NAO_INFORMADO', 'SIM_ATUAL', 'NAO', 'EX_ALUNO')),
  membership_verified text not null default 'PENDENTE'
    check (membership_verified in ('PENDENTE', 'ATIVO_CONFIRMADO', 'EX_ALUNO_CONFIRMADO', 'NAO_ALUNO_CONFIRMADO', 'DIVERGENCIA')),
  access_status text not null default 'CANDIDATE_ONLY'
    check (access_status in ('CANDIDATE_ONLY', 'PENDING_ENROLLMENT', 'ACTIVE_MEMBER', 'SUSPENDED')),
  journey_status text not null default 'NONE'
    check (journey_status in ('NONE', 'ROAD_TO_BOSTON', 'BORA_NEXT', 'PAUSED', 'COMPLETED')),
  polo text check (polo is null or length(polo) <= 80),
  automations_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Matrícula ativa só existe com vínculo verificado.
  check (access_status <> 'ACTIVE_MEMBER' or membership_verified = 'ATIVO_CONFIRMADO'),
  check (journey_status not in ('ROAD_TO_BOSTON', 'BORA_NEXT') or access_status = 'ACTIVE_MEMBER')
);
create index athlete_states_verified on rtb.athlete_states (membership_verified);
create index athlete_states_journey on rtb.athlete_states (journey_status);
create index athlete_states_polo on rtb.athlete_states (polo);

-- ───────────────────────── Vínculo com a BORA ─────────────────────────

-- Autodeclaração (histórico; a última vale). Nunca libera função paga.
create table rtb.membership_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  answer text not null check (answer in ('SIM_ATUAL', 'NAO', 'EX_ALUNO')),
  coach_name text check (coach_name is null or length(coach_name) <= 120),
  support_point text check (support_point is null or length(support_point) <= 120),
  no_polo boolean not null default false,
  created_at timestamptz not null default now()
);
create index membership_claims_user on rtb.membership_claims (user_id, created_at desc);

-- Verificação humana (ou futura sincronização Running). Histórico append-only.
create table rtb.membership_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('PENDENTE', 'ATIVO_CONFIRMADO', 'EX_ALUNO_CONFIRMADO', 'NAO_ALUNO_CONFIRMADO', 'DIVERGENCIA')),
  previous_status text,
  source text not null check (source in ('manual', 'running_sync', 'import', 'system')),
  external_member_id text check (external_member_id is null or length(external_member_id) <= 80),
  note text check (note is null or length(note) <= 1000),
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index membership_verifications_user on rtb.membership_verifications (user_id, created_at desc);

-- Conector Running (futuro). Não existe integração ativa: ver feature flag running_integration.
create table rtb.external_member_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('running')),
  external_member_id text not null check (length(external_member_id) between 1 and 80),
  status text not null default 'linked' check (status in ('suggested', 'linked', 'rejected', 'unlinked')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  matched_on text[],
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_member_id)
);
create index external_member_links_user on rtb.external_member_links (user_id);
create trigger external_member_links_touch before update on rtb.external_member_links for each row execute function rtb.touch_updated_at();

create table rtb.sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('running')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'disabled')),
  stats jsonb not null default '{}'::jsonb,
  error text,
  triggered_by uuid references auth.users (id) on delete set null
);

-- ───────────────────────── LGPD ─────────────────────────

create table rtb.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in (
    'terms', 'privacy', 'health_data', 'marketing_email', 'marketing_whatsapp',
    'avatar_use', 'public_profile', 'ranking_public', 'partner_data_share', 'analytics'
  )),
  granted boolean not null,
  policy_version text not null check (length(policy_version) between 1 and 40),
  source text not null default 'web' check (source in ('web', 'os', 'import')),
  created_at timestamptz not null default now()
);
create index consents_user_purpose on rtb.consents (user_id, purpose, created_at desc);

create table rtb.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('ACCESS', 'RECTIFICATION', 'DELETION', 'PORTABILITY', 'OBJECTION')),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED')),
  response text check (response is null or length(response) <= 2000),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index data_requests_status on rtb.data_requests (status, created_at);

-- ───────────────────────── Auditoria imutável ─────────────────────────

create table rtb.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (length(action) between 3 and 80),
  entity text not null check (length(entity) between 2 and 80),
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity on rtb.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor on rtb.audit_logs (actor_id, created_at desc);
create index audit_logs_created on rtb.audit_logs (created_at desc);

create or replace function rtb.block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_table: % não aceita %', tg_table_name, tg_op using errcode = '42501';
end $$;
create trigger audit_logs_immutable before update or delete on rtb.audit_logs for each row execute function rtb.block_mutation();
create trigger audit_logs_no_truncate before truncate on rtb.audit_logs for each statement execute function rtb.block_mutation();

-- Históricos ligados ao atleta (decisões, eventos): nunca se editam nem se apagam diretamente.
-- Só somem em cascata, quando o próprio usuário é excluído (direito de exclusão da LGPD).
create or replace function rtb.block_direct_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'immutable_history: % não aceita %', tg_table_name, tg_op using errcode = '42501';
end $$;

-- ───────────────────────── Proteções de operação ─────────────────────────

create table rtb.rate_limits (
  bucket text not null check (length(bucket) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

-- Analytics próprio, só com consentimento (o app só grava depois do aceite). Sem PII e sem dado clínico.
create table rtb.analytics_events (
  id bigint generated always as identity primary key,
  anon_id text not null check (anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (name ~ '^[a-z0-9_.]{2,60}$'),
  path text check (path is null or length(path) <= 300),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_name on rtb.analytics_events (name, created_at);

-- ───────────────────────── Boston Index Lab ─────────────────────────

create table rtb.index_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  anon_key text check (anon_key is null or anon_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  idempotency_key text unique check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  standard_version_id uuid references rtb.standard_versions (id),
  birth_date date not null,
  category text not null check (category in ('M', 'F', 'X', 'OTHER')),
  distance text not null check (distance in ('MARATHON', 'HALF')),
  mark_seconds int not null check (mark_seconds between 3300 and 32400),
  mark_date date not null,
  race_name text check (race_name is null or length(race_name) <= 120),
  age_on_race_day int,
  age_group text,
  standard_seconds int,
  projected_marathon_seconds int,
  gap_seconds int,
  internal_fit text not null check (internal_fit in ('WITHIN', 'OUTSIDE', 'MANUAL_REVIEW', 'UNDER_MIN_AGE')),
  ip_hash text check (ip_hash is null or length(ip_hash) <= 80),
  created_at timestamptz not null default now()
);
create index index_simulations_anon on rtb.index_simulations (anon_key) where anon_key is not null;
create index index_simulations_user on rtb.index_simulations (user_id, created_at desc);
create index index_simulations_created on rtb.index_simulations (created_at);

-- ───────────────────────── Funções de identidade usadas pelo RLS ─────────────────────────

create or replace function rtb.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtb.user_roles r
    where r.user_id = (select auth.uid()) and r.role = p_role and r.revoked_at is null
  )
$$;

create or replace function rtb.has_any_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtb.user_roles r
    where r.user_id = (select auth.uid()) and r.role = any (p_roles) and r.revoked_at is null
  )
$$;

create or replace function rtb.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtb.user_roles r
    where r.user_id = (select auth.uid()) and r.revoked_at is null
  )
$$;

-- Escopo por polo: papel sem escopo vale para todos; com escopo, só para o polo (ou atleta ainda sem polo).
create or replace function rtb.role_allows_polo(p_role text, p_polo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtb.user_roles r
    where r.user_id = (select auth.uid()) and r.role = p_role and r.revoked_at is null
      and (r.scope_polo is null or p_polo is null or r.scope_polo = p_polo)
  )
$$;

commit;
