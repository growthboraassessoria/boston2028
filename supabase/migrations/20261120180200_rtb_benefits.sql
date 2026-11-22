-- BORA Road to Boston 2028 · 3/8 · parceiros, benefícios, códigos e resgates

begin;

create table rtb.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  description text check (description is null or length(description) <= 2000),
  category text not null check (category in ('equipment', 'nutrition_recovery', 'health_assessment', 'experiences_services')),
  website_url text check (website_url is null or website_url ~ '^https://'),
  logo_path text,
  -- Marca do parceiro só aparece com autorização documentada (partner_brand_permissions).
  brand_authorized boolean not null default false,
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  contact_email extensions.citext,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partners_status on rtb.partners (status);
create trigger partners_touch before update on rtb.partners for each row execute function rtb.touch_updated_at();

alter table rtb.user_roles add constraint user_roles_partner_fk foreign key (partner_id) references rtb.partners (id) on delete cascade;

create table rtb.partner_brand_permissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references rtb.partners (id) on delete cascade,
  document_path text,
  scope text not null check (length(scope) between 3 and 500),
  granted_on date not null,
  expires_on date,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  check (expires_on is null or expires_on >= granted_on)
);
create index partner_brand_permissions_partner on rtb.partner_brand_permissions (partner_id);

create table rtb.benefits (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references rtb.partners (id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  title text not null check (length(btrim(title)) between 3 and 120),
  summary text not null check (length(summary) between 3 and 240),
  description text check (description is null or length(description) <= 4000),
  rules text check (rules is null or length(rules) <= 4000),
  category text not null check (category in ('equipment', 'nutrition_recovery', 'health_assessment', 'experiences_services')),
  audience_note text check (audience_note is null or length(audience_note) <= 300),
  -- Elegibilidade
  journey_scope text not null default 'ANY' check (journey_scope in ('ANY', 'ROAD', 'NEXT', 'BOTH')),
  requires_active_member boolean not null default true,
  cities text[] not null default '{}',
  ufs text[] not null default '{}',
  polos text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  -- Estoque: total_quantity nulo = sem limite global. remaining nunca negativo.
  total_quantity int check (total_quantity is null or total_quantity >= 0),
  remaining_quantity int check (remaining_quantity is null or remaining_quantity >= 0),
  per_member_limit int not null default 1 check (per_member_limit between 1 and 50),
  restock_on_expiry boolean not null default false,
  image_path text,
  redemption_instructions text check (redemption_instructions is null or length(redemption_instructions) <= 2000),
  mode text not null check (mode in ('COUPON', 'ONE_TIME_CODE', 'QR_VALIDATION', 'MANUAL_APPROVAL', 'EXTERNAL_URL')),
  generate_codes boolean not null default true,
  code_ttl_hours int not null default 720 check (code_ttl_hours between 1 and 8760),
  terms text check (terms is null or length(terms) <= 4000),
  cancellation_policy text check (cancellation_policy is null or length(cancellation_policy) <= 2000),
  visibility text not null default 'VISIBLE' check (visibility in ('HIDDEN', 'VISIBLE_LOCKED', 'VISIBLE')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  -- Benefício de saúde: nunca divulgar condição clínica; parceiro recebe só o mínimo.
  is_health_related boolean not null default false,
  is_demo boolean not null default false,
  views_count int not null default 0 check (views_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((total_quantity is null) = (remaining_quantity is null)),
  check (total_quantity is null or remaining_quantity <= total_quantity)
);
create index benefits_active on rtb.benefits (status, starts_at, ends_at) where status = 'ACTIVE';
create index benefits_partner on rtb.benefits (partner_id);
create trigger benefits_touch before update on rtb.benefits for each row execute function rtb.touch_updated_at();

-- Campos privados (cupom compartilhado, URL de resgate): o atleta nunca lê antes de um resgate válido.
create table rtb.benefit_secrets (
  benefit_id uuid primary key references rtb.benefits (id) on delete cascade,
  coupon_code text check (coupon_code is null or length(coupon_code) between 3 and 60),
  external_url text check (external_url is null or external_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

-- Lote de códigos únicos fornecidos pelo parceiro (modo ONE_TIME_CODE).
create table rtb.benefit_codes (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references rtb.benefits (id) on delete cascade,
  code text not null check (length(code) between 4 and 60),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ASSIGNED', 'VOID')),
  redemption_id uuid,
  created_at timestamptz not null default now(),
  unique (benefit_id, code)
);
create index benefit_codes_available on rtb.benefit_codes (benefit_id, created_at) where status = 'AVAILABLE';

create table rtb.benefit_redemptions (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references rtb.benefits (id),
  partner_id uuid not null references rtb.partners (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  sequence int not null check (sequence >= 1),
  status text not null check (status in ('RESERVED', 'ISSUED', 'REDEEMED', 'EXPIRED', 'CANCELLED')),
  reserved_at timestamptz not null default now(),
  issued_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  validation_idempotency_key text,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  stock_returned boolean not null default false,
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (benefit_id, user_id, sequence),
  check (status <> 'REDEEMED' or redeemed_at is not null),
  check (status <> 'ISSUED' or issued_at is not null)
);
create index benefit_redemptions_user on rtb.benefit_redemptions (user_id, created_at desc);
create index benefit_redemptions_benefit on rtb.benefit_redemptions (benefit_id, status);
create index benefit_redemptions_partner on rtb.benefit_redemptions (partner_id, status);
create index benefit_redemptions_expiring on rtb.benefit_redemptions (expires_at) where status = 'ISSUED';
create trigger benefit_redemptions_touch before update on rtb.benefit_redemptions for each row execute function rtb.touch_updated_at();
alter table rtb.benefit_codes add constraint benefit_codes_redemption_fk foreign key (redemption_id) references rtb.benefit_redemptions (id) on delete set null;

-- Código e token do QR: só o dono lê. O QR carrega só o token opaco, sem dado pessoal.
create table rtb.redemption_secrets (
  redemption_id uuid primary key references rtb.benefit_redemptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  benefit_id uuid not null references rtb.benefits (id) on delete cascade,
  display_code text,
  qr_token text unique check (qr_token is null or qr_token ~ '^[0-9a-f]{40}$'),
  external_url text,
  created_at timestamptz not null default now()
);
create unique index redemption_secrets_code on rtb.redemption_secrets (benefit_id, display_code) where display_code is not null and qr_token is not null;

create table rtb.redemption_events (
  id bigint generated always as identity primary key,
  redemption_id uuid not null references rtb.benefit_redemptions (id) on delete cascade,
  benefit_id uuid not null references rtb.benefits (id) on delete cascade,
  partner_id uuid not null references rtb.partners (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('reserved', 'issued', 'redeemed', 'expired', 'cancelled', 'validation_failed', 'approved')),
  actor_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index redemption_events_redemption on rtb.redemption_events (redemption_id, created_at);
create index redemption_events_benefit on rtb.redemption_events (benefit_id, type, created_at);
create trigger redemption_events_immutable before update or delete on rtb.redemption_events
  for each row execute function rtb.block_direct_mutation();

commit;
