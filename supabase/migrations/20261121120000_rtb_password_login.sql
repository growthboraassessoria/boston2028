-- BORA Road to Boston 2028 · 9/9 · login com CPF e senha (decisão do Alex em 21/11/2026)
-- O atleta entra com CPF + senha. A senha mora no Supabase Auth (auth.users), nunca aqui.
-- Este arquivo guarda só a ligação CPF → conta e os códigos de troca de senha (hash, com validade).
-- Migração aditiva: só cria objetos no schema rtb.

begin;

-- CPF de login: 11 números, um por conta e uma conta por CPF.
create table rtb.login_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table rtb.login_identities is 'CPF usado no login. Lido só pelo servidor (service_role); o titular vê o próprio.';
create trigger login_identities_touch before update on rtb.login_identities for each row execute function rtb.touch_updated_at();

-- Código de troca de senha (esqueci a senha). Guarda só o hash; vale 15 minutos e 5 tentativas.
create table rtb.password_resets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table rtb.password_resets is 'Código de troca de senha (hash). Só o servidor lê e grava.';

alter table rtb.login_identities enable row level security;
alter table rtb.password_resets enable row level security;

revoke all on rtb.login_identities, rtb.password_resets from public, anon, authenticated;
grant all on rtb.login_identities, rtb.password_resets to service_role;

-- O titular pode ver o próprio CPF (tela de perfil). Ninguém mais, nem a equipe, lê pela sessão.
grant select on rtb.login_identities to authenticated;
create policy login_identities_owner_read on rtb.login_identities for select to authenticated
  using (user_id = (select auth.uid()));

commit;
