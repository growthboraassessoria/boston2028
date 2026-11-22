-- BORA Road to Boston 2028 · 4/8 · regras de negócio no banco
-- Toda transição sensível passa por aqui: SECURITY DEFINER minimalista, search_path vazio,
-- checagem explícita de auth.uid() e do papel, auditoria e idempotência.
-- Nenhuma decisão técnica é automática: a triagem só ordena a fila; aprovar e encaminhar ao NEXT exigem pessoa.

begin;

-- ───────────────────────── Utilitários ─────────────────────────

create or replace function rtb.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function rtb.require_any_role(p_roles text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := rtb.require_uid();
begin
  if not rtb.has_any_role(p_roles) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function rtb.append_audit_event(p_action text, p_entity text, p_entity_id text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into rtb.audit_logs (actor_id, action, entity, entity_id, data)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb));
$$;

-- Auditoria genérica de mudanças em cadastros (só nomes de colunas; valores apenas em tabelas sem dado pessoal).
create or replace function rtb.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_id text := coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id', v_row ->> 'benefit_id', v_row ->> 'day');
  v_cols jsonb := '[]'::jsonb;
  v_with_values boolean := coalesce(tg_argv[0], '') = 'with_values';
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k), '[]'::jsonb) into v_cols
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k and k not in ('updated_at', 'views_count');
    if v_cols = '[]'::jsonb then
      return new;
    end if;
  end if;
  insert into rtb.audit_logs (actor_id, action, entity, entity_id, data)
  values (
    auth.uid(), lower(tg_op), tg_table_name, v_id,
    jsonb_build_object('changed', v_cols) ||
      case when v_with_values and tg_op <> 'DELETE' then jsonb_build_object('values', v_new) else '{}'::jsonb end
  );
  return coalesce(new, old);
end $$;

create or replace function rtb.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from rtb.program_settings where key = p_key
$$;

create or replace function rtb.flag(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from rtb.feature_flags where key = p_key), false)
$$;

create or replace function rtb.current_cycle_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from rtb.program_cycles where is_current limit 1
$$;

-- Limite de tentativas por janela, compartilhado entre servidores (vale para funções serverless).
create or replace function rtb.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into rtb.rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = rtb.rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.02 then
    delete from rtb.rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_max;
end $$;

create or replace function rtb.random_code(p_len int default 8) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_len);
  v_out text := '';
begin
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end $$;

-- ───────────────────────── Índice e triagem ─────────────────────────

create or replace function rtb.age_on(p_birth date, p_on date) returns int
language sql immutable set search_path = '' as $$
  select extract(year from age(p_on, p_birth))::int
$$;

create or replace function rtb.active_standard_version() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from rtb.standard_versions where status = 'active' limit 1
$$;

create or replace function rtb.lookup_standard(p_version uuid, p_category text, p_age int) returns int
language sql stable security definer set search_path = '' as $$
  select s.standard_seconds from rtb.qualification_standards s
  where s.version_id = p_version and s.category = p_category
    and p_age >= s.age_min and (s.age_max is null or p_age <= s.age_max)
  order by s.age_min desc
  limit 1
$$;

create or replace function rtb.age_group_label(p_version uuid, p_category text, p_age int) returns text
language sql stable security definer set search_path = '' as $$
  select case when s.age_max is null then s.age_min || '+' else s.age_min || '-' || s.age_max end
  from rtb.qualification_standards s
  where s.version_id = p_version and s.category = p_category
    and p_age >= s.age_min and (s.age_max is null or p_age <= s.age_max)
  order by s.age_min desc
  limit 1
$$;

-- Régua interna BORA (distinta da qualificação oficial). Espelhada em src/lib/domain/triage.ts (teste de paridade).
-- Resultado: ELIGIBLE (na régua) · ALMOST (fora por marca, prova ou frequência) · NOT_NOW (lesão em tratamento
-- ou idade mínima) · MANUAL_REVIEW (categoria especial, tabela incompleta ou dado inconsistente).
create or replace function rtb.compute_prelim(
  p_birth date,
  p_category text,
  p_distance text,
  p_seconds int,
  p_mark_date date,
  p_target_choice text,
  p_target_race uuid,
  p_sessions_4plus boolean,
  p_injury boolean,
  p_today date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date);
  v_version rtb.standard_versions%rowtype;
  v_rule jsonb := coalesce(rtb.setting('internal_rule'), '{}'::jsonb);
  v_marathon_margin int := coalesce((v_rule ->> 'marathon_margin_seconds')::int, 900);
  v_half_margin int := coalesce((v_rule ->> 'half_margin_seconds')::int, 300);
  v_recent_months int := coalesce((rtb.setting('internal_rule.recency') ->> 'recent_mark_months')::int, 18);
  v_age int;
  v_std int;
  v_group text;
  v_proj int;
  v_gap int;
  v_reasons text[] := '{}';
  v_result text;
begin
  select * into v_version from rtb.standard_versions where status = 'active' limit 1;
  if v_version.id is null then
    return jsonb_build_object('result', 'MANUAL_REVIEW', 'reasons', jsonb_build_array('standards_unavailable'));
  end if;

  v_age := rtb.age_on(p_birth, v_version.race_date);
  if p_category in ('M', 'F', 'X') then
    v_std := rtb.lookup_standard(v_version.id, p_category, v_age);
    v_group := rtb.age_group_label(v_version.id, p_category, v_age);
  end if;
  if p_seconds is not null then
    v_proj := case p_distance when 'MARATHON' then p_seconds when 'HALF' then p_seconds * 2 end;
  end if;
  if v_std is not null and v_proj is not null then
    v_gap := v_proj - v_std;
  end if;

  -- Todas as respostas contam (mesmo quando a primeira já tira da régua).
  if coalesce(p_injury, false) then v_reasons := array_append(v_reasons, 'injury_in_treatment'); end if;
  if v_age < v_version.min_age then v_reasons := array_append(v_reasons, 'under_min_age'); end if;
  if p_category is null or p_category not in ('M', 'F', 'X') then
    v_reasons := array_append(v_reasons, 'special_category_review');
  elsif v_std is null and v_age >= v_version.min_age then
    v_reasons := array_append(v_reasons, 'standard_unavailable');
  end if;
  if not coalesce(p_sessions_4plus, false) then v_reasons := array_append(v_reasons, 'frequency_below_min'); end if;
  if p_target_choice is distinct from 'RACE' or p_target_race is null then
    v_reasons := array_append(v_reasons, 'no_target_race');
  end if;
  if p_seconds is null or p_mark_date is null or p_distance is null then
    v_reasons := array_append(v_reasons, 'no_recent_mark');
  elsif p_mark_date > v_today then
    v_reasons := array_append(v_reasons, 'mark_in_future');
  elsif p_mark_date < (v_today - make_interval(months => v_recent_months))::date then
    v_reasons := array_append(v_reasons, 'mark_not_recent');
  end if;
  if v_gap is not null then
    if (p_distance = 'MARATHON' and v_gap > v_marathon_margin) or (p_distance = 'HALF' and v_gap > v_half_margin) then
      v_reasons := array_append(v_reasons, 'mark_outside_margin');
    end if;
  end if;

  v_result := case
    when 'injury_in_treatment' = any (v_reasons) or 'under_min_age' = any (v_reasons) then 'NOT_NOW'
    when 'special_category_review' = any (v_reasons) or 'standard_unavailable' = any (v_reasons)
      or 'mark_in_future' = any (v_reasons) then 'MANUAL_REVIEW'
    when cardinality(v_reasons) > 0 then 'ALMOST'
    else 'ELIGIBLE'
  end;

  return jsonb_build_object(
    'result', v_result,
    'reasons', to_jsonb(v_reasons),
    'version_id', v_version.id,
    'race_date', v_version.race_date,
    'age', v_age,
    'age_group', v_group,
    'standard_seconds', v_std,
    'projected_marathon_seconds', v_proj,
    'gap_seconds', v_gap
  );
end $$;

-- Soma N dias úteis (seg–sex, sem feriados cadastrados) e vence às 23:59:59 de Brasília do último dia.
create or replace function rtb.add_business_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_day date := (p_from at time zone v_tz)::date;
  v_count int := 0;
  v_skip_optional boolean := coalesce((rtb.setting('sla') ->> 'skip_optional_holidays')::boolean, true);
begin
  if p_days <= 0 then
    return p_from;
  end if;
  while v_count < p_days loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 and not exists (
      select 1 from rtb.business_holidays h
      where h.day = v_day and (h.kind <> 'optional' or v_skip_optional)
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return (v_day + time '23:59:59') at time zone v_tz;
end $$;

-- Salva a simulação do Boston Index Lab (o servidor chama como service_role, com limite por IP).
create or replace function rtb.save_simulation(
  p_birth date, p_category text, p_distance text, p_seconds int, p_mark_date date,
  p_race_name text, p_anon_key text, p_idempotency_key text, p_ip_hash text, p_user uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing rtb.index_simulations%rowtype;
  v_version rtb.standard_versions%rowtype;
  v_rule jsonb := coalesce(rtb.setting('internal_rule'), '{}'::jsonb);
  v_age int; v_std int; v_group text; v_proj int; v_gap int; v_fit text;
  v_id uuid;
begin
  select * into v_existing from rtb.index_simulations where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('simulation_id', v_existing.id, 'replayed', true);
  end if;
  if p_distance not in ('MARATHON', 'HALF') then raise exception 'invalid_distance'; end if;
  if p_mark_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'mark_in_future'; end if;
  select * into v_version from rtb.standard_versions where status = 'active' limit 1;
  if v_version.id is not null then
    v_age := rtb.age_on(p_birth, v_version.race_date);
    if p_category in ('M', 'F', 'X') then
      v_std := rtb.lookup_standard(v_version.id, p_category, v_age);
      v_group := rtb.age_group_label(v_version.id, p_category, v_age);
    end if;
  end if;
  v_proj := case p_distance when 'MARATHON' then p_seconds else p_seconds * 2 end;
  if v_std is not null then v_gap := v_proj - v_std; end if;
  v_fit := case
    when v_version.id is null or p_category not in ('M', 'F', 'X') or v_std is null then 'MANUAL_REVIEW'
    when v_age < v_version.min_age then 'UNDER_MIN_AGE'
    when p_distance = 'MARATHON' and v_gap <= coalesce((v_rule ->> 'marathon_margin_seconds')::int, 900) then 'WITHIN'
    when p_distance = 'HALF' and v_gap <= coalesce((v_rule ->> 'half_margin_seconds')::int, 300) then 'WITHIN'
    else 'OUTSIDE'
  end;
  insert into rtb.index_simulations (
    user_id, anon_key, idempotency_key, standard_version_id, birth_date, category, distance, mark_seconds,
    mark_date, race_name, age_on_race_day, age_group, standard_seconds, projected_marathon_seconds, gap_seconds,
    internal_fit, ip_hash
  ) values (
    p_user, p_anon_key, p_idempotency_key, v_version.id, p_birth, p_category, p_distance, p_seconds,
    p_mark_date, nullif(btrim(p_race_name), ''), v_age, v_group, v_std, v_proj, v_gap, v_fit, p_ip_hash
  ) returning id into v_id;
  return jsonb_build_object('simulation_id', v_id, 'internal_fit', v_fit, 'replayed', false);
end $$;

-- Liga as simulações anônimas feitas antes do login à conta (não perde o contexto da conversão).
create or replace function rtb.claim_simulations(p_anon_key text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_n int;
begin
  if p_anon_key is null or p_anon_key !~ '^[A-Za-z0-9_-]{16,64}$' then return 0; end if;
  update rtb.index_simulations set user_id = v_uid where anon_key = p_anon_key and user_id is null;
  get diagnostics v_n = row_count;
  update rtb.utm_attributions set user_id = v_uid where anon_key = p_anon_key and user_id is null;
  return v_n;
end $$;

-- ───────────────────────── Notificação e e-mail ─────────────────────────

create or replace function rtb.has_consent(p_user uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted from rtb.consents c
    where c.user_id = p_user and c.purpose = p_purpose
    order by c.created_at desc limit 1
  ), false)
$$;

create or replace function rtb.notify(p_user uuid, p_kind text, p_title text, p_body text, p_url text) returns void
language sql security definer set search_path = '' as $$
  insert into rtb.notifications (user_id, kind, title, body, action_url) values (p_user, p_kind, p_title, p_body, p_url);
$$;

create or replace function rtb.notify_role(p_role text, p_kind text, p_title text, p_body text, p_url text) returns void
language sql security definer set search_path = '' as $$
  insert into rtb.notifications (user_id, kind, title, body, action_url)
  select distinct r.user_id, p_kind, p_title, p_body, p_url
  from rtb.user_roles r where r.role = p_role and r.revoked_at is null;
$$;

-- Enfileira (nunca envia daqui). Marketing exige consentimento; automação respeita a pausa do candidato.
create or replace function rtb.queue_email(p_user uuid, p_template text, p_vars jsonb, p_idempotency_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_kind text;
  v_paused boolean;
  v_status text := 'queued';
begin
  select kind into v_kind from rtb.message_templates where key = p_template and active;
  if v_kind is null then
    return;
  end if;
  select email into v_email from rtb.profiles where user_id = p_user and deleted_at is null;
  if v_email is null then
    select email into v_email from auth.users where id = p_user;
  end if;
  if v_email is null then
    return;
  end if;
  if v_kind = 'marketing' and not rtb.has_consent(p_user, 'marketing_email') then
    return;
  end if;
  select automations_paused into v_paused from rtb.athlete_states where user_id = p_user;
  if v_kind = 'automation' and coalesce(v_paused, false) then
    v_status := 'suppressed';
  end if;
  insert into rtb.email_outbox (user_id, to_email, template_key, variables, status, idempotency_key)
  values (p_user, v_email, p_template, coalesce(p_vars, '{}'::jsonb), v_status, p_idempotency_key)
  on conflict (idempotency_key) do nothing;
end $$;

create or replace function rtb.first_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.preferred_name, ''), split_part(p.full_name, ' ', 1)) from rtb.profiles p where p.user_id = p_user
$$;

-- Carimbo automático da jornada (sistema). Idempotente por (atleta, carimbo, origem).
create or replace function rtb.stamp(p_user uuid, p_badge_slug text, p_source_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_badge uuid;
begin
  select id into v_badge from rtb.badge_definitions where slug = p_badge_slug and active;
  if v_badge is null then return; end if;
  insert into rtb.earned_badges (user_id, badge_id, source_ref, awarded_by)
  values (p_user, v_badge, p_source_ref, null)
  on conflict (user_id, badge_id, source_ref) do nothing;
end $$;

-- ───────────────────────── Cadastro do atleta ─────────────────────────

create or replace function rtb.save_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_email text;
  v_cep text := regexp_replace(coalesce(p ->> 'cep', ''), '\D', '', 'g');
  v_row rtb.profiles%rowtype;
  v_new boolean;
begin
  -- CEP obrigatório (decisão do Alex em 20/11/2026), também aqui, para nenhum caminho gravar perfil sem ele.
  if v_cep !~ '^[0-9]{8}$' then
    raise exception 'cep_required' using errcode = '22023', hint = 'Informe o CEP com 8 números.';
  end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'user_without_email';
  end if;
  v_new := not exists (select 1 from rtb.profiles where user_id = v_uid);
  insert into rtb.profiles as pr (
    user_id, full_name, preferred_name, birth_date, email, phone_e164, cep, city, uf, country,
    reference_category, category_note, origin_coach
  ) values (
    v_uid, btrim(p ->> 'full_name'), nullif(btrim(p ->> 'preferred_name'), ''), (p ->> 'birth_date')::date,
    lower(v_email), nullif(p ->> 'phone_e164', ''), v_cep,
    nullif(btrim(p ->> 'city'), ''), nullif(upper(btrim(p ->> 'uf')), ''), coalesce(nullif(upper(p ->> 'country'), ''), 'BR'),
    p ->> 'reference_category', nullif(btrim(p ->> 'category_note'), ''), nullif(btrim(p ->> 'origin_coach'), '')
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    preferred_name = excluded.preferred_name,
    birth_date = excluded.birth_date,
    phone_e164 = excluded.phone_e164,
    cep = excluded.cep,
    city = excluded.city,
    uf = excluded.uf,
    country = excluded.country,
    reference_category = excluded.reference_category,
    category_note = excluded.category_note,
    origin_coach = coalesce(pr.origin_coach, excluded.origin_coach)
  returning * into v_row;

  insert into rtb.athlete_states (user_id) values (v_uid) on conflict (user_id) do nothing;

  if v_new then
    perform rtb.stamp(v_uid, 'passaporte-emitido', 'system');
    perform rtb.notify(v_uid, 'passport.issued', 'Seu Boston Passport foi emitido',
      'Passaporte ' || v_row.passport_number || '. Ele guarda sua jornada, mesmo antes de qualquer aprovação.', '/passport');
    perform rtb.queue_email(v_uid, 'account_created', jsonb_build_object('passport_number', v_row.passport_number), 'account_created:' || v_uid);
  end if;
  perform rtb.append_audit_event(case when v_new then 'profile.created' else 'profile.updated' end, 'profiles', v_uid::text,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p) k)));
  return jsonb_build_object('passport_number', v_row.passport_number, 'created', v_new);
end $$;

-- "Você já é aluno BORA?": guarda a autodeclaração. Nunca altera vínculo verificado nem acesso.
create or replace function rtb.save_membership_claim(p_answer text, p_coach_name text, p_support_point text, p_no_polo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid();
begin
  if p_answer not in ('SIM_ATUAL', 'NAO', 'EX_ALUNO') then
    raise exception 'invalid_membership_answer';
  end if;
  insert into rtb.athlete_states (user_id) values (v_uid) on conflict (user_id) do nothing;
  insert into rtb.membership_claims (user_id, answer, coach_name, support_point, no_polo)
  values (v_uid, p_answer,
    case when p_answer = 'SIM_ATUAL' then nullif(btrim(p_coach_name), '') end,
    case when p_answer = 'SIM_ATUAL' then nullif(btrim(p_support_point), '') end,
    p_answer = 'SIM_ATUAL' and coalesce(p_no_polo, false));
  update rtb.athlete_states set membership_declared = p_answer, updated_at = now() where user_id = v_uid;
  perform rtb.append_audit_event('membership.claimed', 'athlete_states', v_uid::text, jsonb_build_object('answer', p_answer));
end $$;

-- Consentimentos granulares (histórico; o último de cada finalidade vale).
create or replace function rtb.record_consents(p_items jsonb, p_policy_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid();
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_consents';
  end if;
  insert into rtb.consents (user_id, purpose, granted, policy_version)
  select v_uid, x ->> 'purpose', (x ->> 'granted')::boolean, p_policy_version
  from jsonb_array_elements(p_items) x;
  update rtb.profiles set
    public_profile = rtb.has_consent(v_uid, 'public_profile'),
    ranking_opt_in = rtb.has_consent(v_uid, 'ranking_public')
  where user_id = v_uid;
end $$;

create or replace function rtb.set_my_avatar(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid();
begin
  if p_path is not null and p_path !~ ('^users/' || v_uid::text || '/avatar/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_avatar_path';
  end if;
  if p_path is not null and not rtb.has_consent(v_uid, 'avatar_use') then
    raise exception 'avatar_consent_required';
  end if;
  if p_path is not null and not rtb.hit_rate_limit('avatar:' || v_uid, 20, 3600) then
    raise exception 'rate_limited';
  end if;
  update rtb.profiles set avatar_path = p_path where user_id = v_uid;
  perform rtb.append_audit_event('profile.avatar', 'profiles', v_uid::text, jsonb_build_object('removed', p_path is null));
end $$;

create or replace function rtb.request_data(p_kind text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_id uuid;
begin
  if not rtb.hit_rate_limit('data_request:' || v_uid, 5, 86400) then raise exception 'rate_limited'; end if;
  insert into rtb.data_requests (user_id, kind, details) values (v_uid, p_kind, nullif(btrim(p_details), '')) returning id into v_id;
  perform rtb.notify_role('super_admin', 'lgpd.request', 'Novo pedido LGPD', 'Tipo: ' || p_kind, '/os/configuracoes');
  perform rtb.append_audit_event('lgpd.requested', 'data_requests', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end $$;

create or replace function rtb.mark_notifications_read(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_n int;
begin
  update rtb.notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────── Candidatura ─────────────────────────

create or replace function rtb.submit_application(p jsonb, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_profile rtb.profiles%rowtype;
  v_cycle rtb.program_cycles%rowtype;
  v_existing rtb.applications%rowtype;
  v_app rtb.applications%rowtype;
  v_calc jsonb;
  v_result text;
  v_status text;
  v_mark_id uuid;
  v_injury boolean := (p ->> 'injury_in_treatment')::boolean;
  v_sessions boolean := (p ->> 'sessions_4plus')::boolean;
  v_target_choice text := p ->> 'target_choice';
  v_target uuid := nullif(p ->> 'target_race_id', '')::uuid;
  v_has_mark boolean := coalesce((p ->> 'has_mark')::boolean, false);
  v_distance text := case when v_has_mark then p ->> 'mark_distance' end;
  v_seconds int := case when v_has_mark then nullif(p ->> 'mark_seconds', '')::int end;
  v_mark_date date := case when v_has_mark then nullif(p ->> 'mark_date', '')::date end;
  v_sla timestamptz;
  v_late boolean := false;
  v_sla_days int := coalesce((rtb.setting('sla') ->> 'almost_business_days')::int, 3);
  v_retention_months int := coalesce((rtb.setting('privacy') ->> 'health_retention_months')::int, 24);
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,80}$' then
    raise exception 'idempotency_key_required';
  end if;
  select * into v_existing from rtb.applications where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
    return jsonb_build_object('application_id', v_existing.id, 'status', v_existing.status, 'sla_due_at', v_existing.sla_due_at, 'replayed', true);
  end if;
  if not rtb.hit_rate_limit('apply:' || v_uid, 10, 3600) then
    raise exception 'rate_limited';
  end if;

  select * into v_profile from rtb.profiles where user_id = v_uid and deleted_at is null;
  if not found then raise exception 'profile_required'; end if;
  if not rtb.has_consent(v_uid, 'health_data') then raise exception 'health_consent_required'; end if;

  select * into v_cycle from rtb.program_cycles where is_current;
  if not found or v_cycle.status not in ('open', 'running', 'closed') then
    raise exception 'cycle_not_open';
  end if;
  if v_cycle.status = 'closed' or (v_cycle.applications_close_at is not null and now() > v_cycle.applications_close_at) then
    v_late := true;
  end if;

  -- Todas as perguntas são obrigatórias, mesmo se uma já indicar inelegibilidade.
  if v_injury is null or v_sessions is null or v_target_choice is null or v_target_choice not in ('RACE', 'NONE') then
    raise exception 'incomplete_answers';
  end if;
  if v_target_choice = 'RACE' and not exists (select 1 from rtb.target_races where id = v_target and status <> 'archived') then
    raise exception 'invalid_target_race';
  end if;
  if v_target_choice = 'NONE' then v_target := null; end if;
  if v_has_mark and (v_distance not in ('MARATHON', 'HALF') or v_seconds is null or v_mark_date is null) then
    raise exception 'incomplete_mark';
  end if;

  select * into v_existing from rtb.applications where user_id = v_uid and cycle_id = v_cycle.id for update;
  if found and v_existing.status not in ('DRAFT', 'WITHDRAWN') then
    raise exception 'application_already_submitted' using detail = v_existing.id::text;
  end if;

  if v_has_mark then
    insert into rtb.performance_marks (user_id, distance, seconds, mark_date, race_name, source)
    values (v_uid, v_distance, v_seconds, v_mark_date, nullif(btrim(p ->> 'mark_race_name'), ''), 'self_declared')
    returning id into v_mark_id;
  end if;

  v_calc := rtb.compute_prelim(v_profile.birth_date, v_profile.reference_category, v_distance, v_seconds, v_mark_date,
                               v_target_choice, v_target, v_sessions, v_injury);
  v_result := v_calc ->> 'result';
  v_status := case v_result
    when 'ELIGIBLE' then 'PRELIM_ELIGIBLE'
    when 'ALMOST' then 'PRELIM_ALMOST'
    when 'NOT_NOW' then 'PRELIM_NOT_NOW'
    else 'UNDER_REVIEW'
  end;
  if v_result in ('ALMOST', 'MANUAL_REVIEW') then
    v_sla := rtb.add_business_days(now(), v_sla_days);
  end if;

  begin
    if v_existing.id is null then
      insert into rtb.applications (
        user_id, cycle_id, status, prelim_result, prelim_reasons, standard_version_id, category, age_on_race_day,
        age_group, standard_seconds, projected_marathon_seconds, gap_seconds, target_race_choice, target_race_id,
        sessions_4plus, mark_id, availability_note, late_entry, submitted_at, sla_due_at, idempotency_key
      ) values (
        v_uid, v_cycle.id, v_status, v_result, array(select jsonb_array_elements_text(v_calc -> 'reasons')),
        nullif(v_calc ->> 'version_id', '')::uuid, v_profile.reference_category, (v_calc ->> 'age')::int,
        v_calc ->> 'age_group', (v_calc ->> 'standard_seconds')::int, (v_calc ->> 'projected_marathon_seconds')::int,
        (v_calc ->> 'gap_seconds')::int, v_target_choice, v_target, v_sessions, v_mark_id,
        nullif(btrim(p ->> 'availability_note'), ''), v_late, now(), v_sla, p_idempotency_key
      ) returning * into v_app;
    else
      update rtb.applications set
        status = v_status, prelim_result = v_result,
        prelim_reasons = array(select jsonb_array_elements_text(v_calc -> 'reasons')),
        standard_version_id = nullif(v_calc ->> 'version_id', '')::uuid, category = v_profile.reference_category,
        age_on_race_day = (v_calc ->> 'age')::int, age_group = v_calc ->> 'age_group',
        standard_seconds = (v_calc ->> 'standard_seconds')::int,
        projected_marathon_seconds = (v_calc ->> 'projected_marathon_seconds')::int,
        gap_seconds = (v_calc ->> 'gap_seconds')::int, target_race_choice = v_target_choice, target_race_id = v_target,
        sessions_4plus = v_sessions, mark_id = v_mark_id, availability_note = nullif(btrim(p ->> 'availability_note'), ''),
        late_entry = v_late, submitted_at = now(), sla_due_at = v_sla, first_contact_at = null, withdrawn_at = null,
        idempotency_key = p_idempotency_key
      where id = v_existing.id
      returning * into v_app;
    end if;
  exception when unique_violation then
    raise exception 'application_already_submitted';
  end;

  insert into rtb.application_health (application_id, user_id, injury_in_treatment, consent_id, retain_until)
  values (v_app.id, v_uid, v_injury,
    (select c.id from rtb.consents c where c.user_id = v_uid and c.purpose = 'health_data' order by c.created_at desc limit 1),
    (now() + make_interval(months => v_retention_months))::date)
  on conflict (application_id) do update set injury_in_treatment = excluded.injury_in_treatment, consent_id = excluded.consent_id,
    retain_until = excluded.retain_until;

  insert into rtb.application_answers (application_id, question_key, answer)
  select v_app.id, e.key, e.value from jsonb_each(coalesce(p -> 'extra', '{}'::jsonb)) e
  where e.key ~ '^[a-z0-9_.]{2,60}$'
  on conflict (application_id, question_key) do update set answer = excluded.answer;

  insert into rtb.application_events (application_id, user_id, type, from_status, to_status, actor_id, visibility, payload)
  values
    (v_app.id, v_uid, 'application.submitted', coalesce(v_existing.status, 'DRAFT'), 'SUBMITTED', v_uid, 'athlete', '{}'::jsonb),
    (v_app.id, v_uid, 'application.triaged', 'SUBMITTED', v_status, null, 'internal',
      jsonb_build_object('result', v_result, 'reasons', v_calc -> 'reasons', 'late_entry', v_late));

  perform rtb.stamp(v_uid, 'candidatura-enviada', 'application:' || v_app.id);
  perform rtb.notify(v_uid, 'application.submitted', 'Candidatura enviada',
    'Recebemos sua candidatura ao Road to Boston 2028. A coordenação técnica vai analisar e você acompanha tudo aqui.',
    '/passport/candidatura');
  perform rtb.queue_email(v_uid, 'application_submitted',
    jsonb_build_object('first_name', rtb.first_name(v_uid), 'sla_due_at', v_sla), 'application_submitted:' || v_app.id || ':' || p_idempotency_key);
  perform rtb.notify_role('technical_director', 'queue.new', 'Nova candidatura para analisar',
    case v_result when 'ALMOST' then 'Quase lá · contato em até ' || v_sla_days || ' dias úteis'
                  when 'NOT_NOW' then 'Agora não · revisão técnica'
                  when 'MANUAL_REVIEW' then 'Revisão manual necessária'
                  else 'Elegível preliminar · aguardando aprovação técnica' end
      || case when v_late then ' (entrada tardia)' else '' end,
    '/os/candidatos/' || v_app.id);
  perform rtb.append_audit_event('application.submitted', 'applications', v_app.id::text,
    jsonb_build_object('status', v_status, 'late_entry', v_late));

  return jsonb_build_object('application_id', v_app.id, 'status', v_status, 'sla_due_at', v_sla, 'replayed', false);
end $$;

create or replace function rtb.withdraw_application(p_application_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_app rtb.applications%rowtype;
begin
  select * into v_app from rtb.applications where id = p_application_id and user_id = v_uid for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.status in ('WITHDRAWN', 'DRAFT') then raise exception 'invalid_state'; end if;
  update rtb.applications set status = 'WITHDRAWN', withdrawn_at = now() where id = v_app.id;
  update rtb.journey_enrollments set status = 'CANCELLED', ended_at = now(), end_reason = 'withdrawn_by_athlete'
  where application_id = v_app.id and status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED');
  update rtb.athlete_states set journey_status = 'NONE', updated_at = now()
  where user_id = v_uid and journey_status in ('ROAD_TO_BOSTON', 'BORA_NEXT', 'PAUSED');
  insert into rtb.application_events (application_id, user_id, type, from_status, to_status, actor_id, visibility, payload)
  values (v_app.id, v_uid, 'application.withdrawn', v_app.status, 'WITHDRAWN', v_uid, 'athlete', jsonb_build_object('reason', left(p_reason, 300)));
  perform rtb.append_audit_event('application.withdrawn', 'applications', v_app.id::text, '{}'::jsonb);
end $$;

create or replace function rtb.respond_info_request(p_request_id uuid, p_response text, p_document_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_req rtb.info_requests%rowtype;
  v_app rtb.applications%rowtype;
begin
  select * into v_req from rtb.info_requests where id = p_request_id and user_id = v_uid for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'OPEN' then raise exception 'request_not_open'; end if;
  if length(btrim(coalesce(p_response, ''))) < 2 then raise exception 'response_required'; end if;
  if p_document_id is not null and not exists (
    select 1 from rtb.application_documents d where d.id = p_document_id and d.user_id = v_uid and d.deleted_at is null
  ) then
    raise exception 'invalid_document';
  end if;
  update rtb.info_requests set status = 'ANSWERED', response = btrim(p_response), responded_at = now(), document_id = p_document_id
  where id = v_req.id;
  select * into v_app from rtb.applications where id = v_req.application_id for update;
  if v_app.status = 'NEEDS_INFO' and not exists (
    select 1 from rtb.info_requests r where r.application_id = v_app.id and r.status = 'OPEN'
  ) then
    update rtb.applications set status = 'UNDER_REVIEW' where id = v_app.id;
  end if;
  insert into rtb.application_events (application_id, user_id, type, from_status, to_status, actor_id, visibility, payload)
  values (v_app.id, v_uid, 'info.answered', v_app.status,
    case when v_app.status = 'NEEDS_INFO' then 'UNDER_REVIEW' else v_app.status end, v_uid, 'athlete', '{}'::jsonb);
  if v_app.reviewer_id is not null then
    perform rtb.notify(v_app.reviewer_id, 'info.answered', 'Candidato respondeu ao pedido de informações', null, '/os/candidatos/' || v_app.id);
  else
    perform rtb.notify_role('technical_director', 'info.answered', 'Candidato respondeu ao pedido de informações', null, '/os/candidatos/' || v_app.id);
  end if;
  perform rtb.append_audit_event('info.answered', 'info_requests', v_req.id::text, '{}'::jsonb);
end $$;

-- Comprovante enviado pelo próprio atleta (o servidor já validou tipo real e tamanho e subiu o arquivo).
create or replace function rtb.add_my_document(
  p_application_id uuid, p_kind text, p_storage_path text, p_mime text, p_size int, p_original_name text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_id uuid; v_app rtb.applications%rowtype;
begin
  if p_storage_path !~ ('^users/' || v_uid::text || '/docs/[A-Za-z0-9._-]+$') then raise exception 'invalid_path'; end if;
  if p_application_id is not null then
    select * into v_app from rtb.applications where id = p_application_id and user_id = v_uid;
    if not found then raise exception 'application_not_found'; end if;
  end if;
  if not rtb.hit_rate_limit('upload:' || v_uid, 30, 3600) then raise exception 'rate_limited'; end if;
  insert into rtb.application_documents (user_id, application_id, kind, storage_path, mime, size_bytes, original_name)
  values (v_uid, p_application_id, p_kind, p_storage_path, p_mime, p_size, left(p_original_name, 200))
  returning id into v_id;
  if p_kind = 'MARK_PROOF' and v_app.mark_id is not null then
    update rtb.performance_marks set evidence_document_id = v_id where id = v_app.mark_id and user_id = v_uid;
  end if;
  perform rtb.append_audit_event('document.uploaded', 'application_documents', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end $$;

-- ───────────────────────── Equipe técnica ─────────────────────────

-- Quem pode ver um atleta (base das políticas e das funções da equipe).
create or replace function rtb.can_see_athlete(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    rtb.has_any_role(array['super_admin', 'technical_director'])
    or exists (
      select 1 from rtb.athlete_coach_assignments a
      where a.athlete_id = p_athlete and a.coach_user_id = (select auth.uid()) and a.ends_at is null
    )
    or (rtb.has_role('membership_verifier') and rtb.role_allows_polo('membership_verifier',
          (select s.polo from rtb.athlete_states s where s.user_id = p_athlete)))
    or (rtb.has_role('commercial') and exists (
          select 1 from rtb.commercial_opportunities o where o.user_id = p_athlete)
        and rtb.role_allows_polo('commercial', (select s.polo from rtb.athlete_states s where s.user_id = p_athlete)))
$$;

create or replace function rtb.is_assigned_coach(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtb.athlete_coach_assignments a
    where a.athlete_id = p_athlete and a.coach_user_id = (select auth.uid()) and a.ends_at is null
  )
$$;

create or replace function rtb.can_coach_athlete(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select rtb.has_role('technical_director') or (rtb.has_role('coach') and rtb.is_assigned_coach(p_athlete))
$$;

create or replace function rtb.start_review(p_application_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['technical_director']); v_app rtb.applications%rowtype;
begin
  select * into v_app from rtb.applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.status not in ('PRELIM_ELIGIBLE', 'PRELIM_ALMOST', 'PRELIM_NOT_NOW') then
    raise exception 'invalid_transition';
  end if;
  update rtb.applications set status = 'UNDER_REVIEW', reviewer_id = v_uid where id = v_app.id;
  insert into rtb.application_events (application_id, user_id, type, from_status, to_status, actor_id, visibility)
  values (v_app.id, v_app.user_id, 'review.started', v_app.status, 'UNDER_REVIEW', v_uid, 'internal');
  perform rtb.append_audit_event('review.started', 'applications', v_app.id::text, '{}'::jsonb);
end $$;

create or replace function rtb.add_review_note(p_application_id uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_app rtb.applications%rowtype; v_id uuid;
begin
  select * into v_app from rtb.applications where id = p_application_id;
  if not found then raise exception 'application_not_found'; end if;
  if not rtb.can_coach_athlete(v_app.user_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into rtb.technical_reviews (application_id, author_id, note) values (v_app.id, v_uid, btrim(p_note)) returning id into v_id;
  insert into rtb.application_events (application_id, user_id, type, actor_id, visibility)
  values (v_app.id, v_app.user_id, 'review.note', v_uid, 'internal');
  return v_id;
end $$;

create or replace function rtb.record_contact_attempt(p_application_id uuid, p_channel text, p_outcome text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_app rtb.applications%rowtype; v_id uuid;
begin
  select * into v_app from rtb.applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if not (rtb.can_coach_athlete(v_app.user_id) or (rtb.has_role('commercial') and rtb.can_see_athlete(v_app.user_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into rtb.contact_attempts (application_id, user_id, actor_id, channel, outcome, note)
  values (v_app.id, v_app.user_id, v_uid, p_channel, p_outcome, nullif(btrim(p_note), '')) returning id into v_id;
  if p_outcome in ('reached', 'scheduled') and v_app.first_contact_at is null then
    update rtb.applications set first_contact_at = now() where id = v_app.id;
  end if;
  insert into rtb.application_events (application_id, user_id, type, actor_id, visibility, payload)
  values (v_app.id, v_app.user_id, 'contact.attempt', v_uid, 'internal', jsonb_build_object('channel', p_channel, 'outcome', p_outcome));
  perform rtb.append_audit_event('contact.recorded', 'applications', v_app.id::text, jsonb_build_object('outcome', p_outcome));
  return v_id;
end $$;

-- Decisão técnica humana. Só technical_director (Lucas ou delegado com o papel atribuído no banco).
-- APPROVE_ROAD → TECH_APPROVED · NOT_APPROVED → TECH_NOT_APPROVED · FORWARD_NEXT → REASSESSMENT_PENDING + NEXT
-- REQUEST_INFO → NEEDS_INFO · KEEP_MONITORING → REASSESSMENT_PENDING. Reversível por nova decisão; nada é apagado.
create or replace function rtb.record_technical_decision(
  p_application_id uuid, p_decision text, p_reason text, p_next_step text, p_next_step_on date,
  p_message_to_athlete text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_app rtb.applications%rowtype;
  v_state rtb.athlete_states%rowtype;
  v_prev rtb.technical_decisions%rowtype;
  v_dec rtb.technical_decisions%rowtype;
  v_existing rtb.technical_decisions%rowtype;
  v_to text;
  v_member boolean;
  v_enroll_status text;
  v_enroll_id uuid;
  v_had_road boolean;
  v_reassess_days int := coalesce((rtb.setting('next') ->> 'reassessment_days')::int, 90);
  v_reassess_on date;
  v_first text;
  v_cancelled int;
begin
  if not rtb.has_role('technical_director') then
    raise exception 'forbidden_technical_decision' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,80}$' then
    raise exception 'idempotency_key_required';
  end if;
  select * into v_existing from rtb.technical_decisions where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('decision_id', v_existing.id, 'to_status', v_existing.to_status, 'replayed', true);
  end if;
  if p_decision not in ('APPROVE_ROAD', 'NOT_APPROVED', 'FORWARD_NEXT', 'REQUEST_INFO', 'KEEP_MONITORING') then
    raise exception 'invalid_decision';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required'; end if;
  if length(btrim(coalesce(p_next_step, ''))) < 3 then raise exception 'next_step_required'; end if;
  if p_decision = 'REQUEST_INFO' and length(btrim(coalesce(p_message_to_athlete, ''))) < 5 then
    raise exception 'message_required_for_info_request';
  end if;

  select * into v_app from rtb.applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.status in ('DRAFT', 'SUBMITTED', 'WITHDRAWN') then raise exception 'invalid_state_for_decision'; end if;

  -- Transições permitidas.
  if p_decision in ('APPROVE_ROAD', 'FORWARD_NEXT') and v_app.status = 'PRELIM_NOT_NOW' then
    raise exception 'invalid_transition: reavalie (KEEP_MONITORING) antes de oferecer treinamento a quem está em "Agora não"';
  end if;
  if p_decision = 'APPROVE_ROAD' and v_app.status = 'TECH_APPROVED' then raise exception 'no_change'; end if;
  if p_decision = 'NOT_APPROVED' and v_app.status = 'TECH_NOT_APPROVED' then raise exception 'no_change'; end if;
  if p_decision = 'FORWARD_NEXT' and exists (
    select 1 from rtb.journey_enrollments e
    where e.application_id = v_app.id and e.journey = 'BORA_NEXT' and e.status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED')
  ) then
    raise exception 'no_change: já encaminhado ao BORA NEXT';
  end if;

  select * into v_state from rtb.athlete_states where user_id = v_app.user_id for update;
  v_member := v_state.membership_verified = 'ATIVO_CONFIRMADO';
  v_first := rtb.first_name(v_app.user_id);
  select * into v_prev from rtb.technical_decisions where application_id = v_app.id order by created_at desc limit 1;

  v_to := case p_decision
    when 'APPROVE_ROAD' then 'TECH_APPROVED'
    when 'NOT_APPROVED' then 'TECH_NOT_APPROVED'
    when 'FORWARD_NEXT' then 'REASSESSMENT_PENDING'
    when 'REQUEST_INFO' then 'NEEDS_INFO'
    when 'KEEP_MONITORING' then 'REASSESSMENT_PENDING'
  end;

  insert into rtb.technical_decisions (
    application_id, user_id, decision, reason, next_step, next_step_on, message_to_athlete, decided_by, decided_role,
    supersedes_id, from_status, to_status, idempotency_key
  ) values (
    v_app.id, v_app.user_id, p_decision, btrim(p_reason), btrim(p_next_step), p_next_step_on,
    nullif(btrim(p_message_to_athlete), ''), v_uid, 'technical_director', v_prev.id, v_app.status, v_to, p_idempotency_key
  ) returning * into v_dec;

  if p_decision = 'APPROVE_ROAD' then
    update rtb.journey_enrollments set status = 'COMPLETED', ended_at = now(), end_reason = 'promoted_to_road'
    where application_id = v_app.id and journey = 'BORA_NEXT' and status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED');
    v_enroll_status := case when v_member then 'ACTIVE' else 'PENDING_ENROLLMENT' end;
    insert into rtb.journey_enrollments (user_id, application_id, cycle_id, journey, status, decision_id, activated_at, accepted_at)
    values (v_app.user_id, v_app.id, v_app.cycle_id, 'ROAD_TO_BOSTON', v_enroll_status, v_dec.id,
      case when v_member then now() end, case when v_member then now() end)
    returning id into v_enroll_id;
    update rtb.athlete_states set
      access_status = case when v_member then 'ACTIVE_MEMBER' else 'PENDING_ENROLLMENT' end,
      journey_status = case when v_member then 'ROAD_TO_BOSTON' else 'NONE' end,
      updated_at = now()
    where user_id = v_app.user_id;
    if v_member then
      perform rtb.stamp(v_app.user_id, 'road-to-boston', 'decision:' || v_dec.id);
      perform rtb.notify(v_app.user_id, 'journey.road_active', 'Aprovação técnica: você está no Road to Boston 2028',
        'Como aluno BORA ativo, você entra no ciclo sem cobrança adicional.', '/passport/jornada');
      perform rtb.queue_email(v_app.user_id, 'cycle_joined', jsonb_build_object('first_name', v_first, 'journey', 'Road to Boston 2028'), 'cycle_joined:' || v_dec.id);
    else
      insert into rtb.commercial_opportunities (user_id, application_id, origin)
      values (v_app.user_id, v_app.id, 'ROAD_APPROVED_NON_MEMBER') on conflict do nothing;
      perform rtb.notify_role('commercial', 'commercial.new', 'Nova oportunidade: aprovado técnico sem matrícula', null, '/os/comercial');
      perform rtb.notify(v_app.user_id, 'journey.road_pending_enrollment', 'Aprovação técnica: falta a matrícula',
        'Para começar o ciclo, faça sua matrícula na BORA. O projeto não tem cobrança extra além da mensalidade normal.', '/passport/jornada');
      perform rtb.queue_email(v_app.user_id, 'enrollment_guidance', jsonb_build_object('first_name', v_first, 'journey', 'Road to Boston 2028'), 'enrollment_guidance:' || v_dec.id);
    end if;

  elsif p_decision = 'FORWARD_NEXT' then
    update rtb.journey_enrollments set status = 'CANCELLED', ended_at = now(), end_reason = 'superseded:' || v_dec.id
    where application_id = v_app.id and journey = 'ROAD_TO_BOSTON' and status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED');
    get diagnostics v_cancelled = row_count;
    v_enroll_status := case when v_member then 'OFFERED' else 'PENDING_ENROLLMENT' end;
    insert into rtb.journey_enrollments (user_id, application_id, cycle_id, journey, status, decision_id)
    values (v_app.user_id, v_app.id, v_app.cycle_id, 'BORA_NEXT', v_enroll_status, v_dec.id)
    returning id into v_enroll_id;
    v_reassess_on := coalesce(p_next_step_on, ((now() at time zone 'America/Sao_Paulo')::date + v_reassess_days));
    insert into rtb.reassessments (user_id, application_id, decision_id, scheduled_for, reason, created_by)
    values (v_app.user_id, v_app.id, v_dec.id, v_reassess_on, 'Reavaliação da coordenação técnica', v_uid);
    update rtb.athlete_states set
      access_status = case when v_member then 'ACTIVE_MEMBER' else 'PENDING_ENROLLMENT' end,
      journey_status = case when v_cancelled > 0 then 'NONE' else journey_status end,
      updated_at = now()
    where user_id = v_app.user_id;
    if v_member then
      perform rtb.notify(v_app.user_id, 'journey.next_offered', 'Convite da coordenação técnica: BORA NEXT',
        'Seu caminho de desenvolvimento foi definido. Aceite no Passport para começar, sem cobrança adicional.', '/passport/jornada');
      perform rtb.queue_email(v_app.user_id, 'next_invite', jsonb_build_object('first_name', v_first), 'next_invite:' || v_dec.id);
    else
      insert into rtb.commercial_opportunities (user_id, application_id, origin)
      values (v_app.user_id, v_app.id, 'NEXT_FORWARDED_NON_MEMBER') on conflict do nothing;
      perform rtb.notify_role('commercial', 'commercial.new', 'Nova oportunidade: BORA NEXT recomendado, sem matrícula', null, '/os/comercial');
      perform rtb.notify(v_app.user_id, 'journey.next_pending_enrollment', 'Recomendação da coordenação técnica',
        'Para seguir pelo BORA NEXT, o próximo passo é a matrícula normal na BORA.', '/passport/jornada');
      perform rtb.queue_email(v_app.user_id, 'enrollment_guidance', jsonb_build_object('first_name', v_first, 'journey', 'BORA NEXT'), 'enrollment_guidance:' || v_dec.id);
    end if;

  elsif p_decision = 'NOT_APPROVED' then
    update rtb.journey_enrollments set status = 'CANCELLED', ended_at = now(), end_reason = 'superseded:' || v_dec.id
    where application_id = v_app.id and journey = 'ROAD_TO_BOSTON' and status in ('OFFERED', 'PENDING_ENROLLMENT', 'ACTIVE', 'PAUSED');
    get diagnostics v_cancelled = row_count;
    if v_cancelled > 0 then
      update rtb.athlete_states set journey_status = 'NONE',
        access_status = case when v_member then 'ACTIVE_MEMBER' else 'CANDIDATE_ONLY' end, updated_at = now()
      where user_id = v_app.user_id;
    end if;
    perform rtb.notify(v_app.user_id, 'decision.not_approved', 'Parecer técnico da sua candidatura',
      coalesce(nullif(btrim(p_message_to_athlete), ''), 'A coordenação técnica registrou o parecer. Veja os próximos passos no Passport.'), '/passport/candidatura');
    perform rtb.queue_email(v_app.user_id, 'technical_decision', jsonb_build_object('first_name', v_first), 'technical_decision:' || v_dec.id);

  elsif p_decision = 'REQUEST_INFO' then
    insert into rtb.info_requests (application_id, user_id, decision_id, requested_by, message)
    values (v_app.id, v_app.user_id, v_dec.id, v_uid, btrim(p_message_to_athlete));
    perform rtb.notify(v_app.user_id, 'info.requested', 'A coordenação pediu mais informações', btrim(p_message_to_athlete), '/passport/candidatura');
    perform rtb.queue_email(v_app.user_id, 'document_requested', jsonb_build_object('first_name', v_first), 'document_requested:' || v_dec.id);

  elsif p_decision = 'KEEP_MONITORING' then
    v_reassess_on := coalesce(p_next_step_on, ((now() at time zone 'America/Sao_Paulo')::date + v_reassess_days));
    update rtb.reassessments set status = 'CANCELLED' where application_id = v_app.id and status = 'SCHEDULED';
    insert into rtb.reassessments (user_id, application_id, decision_id, scheduled_for, reason, created_by)
    values (v_app.user_id, v_app.id, v_dec.id, v_reassess_on, left(btrim(p_next_step), 500), v_uid);
    perform rtb.notify(v_app.user_id, 'reassessment.scheduled', 'Acompanhamento e reavaliação',
      'A coordenação técnica vai acompanhar sua evolução. Próxima reavaliação prevista: ' || to_char(v_reassess_on, 'DD/MM/YYYY') || '.',
      '/passport/candidatura');
    perform rtb.queue_email(v_app.user_id, 'reassessment_scheduled',
      jsonb_build_object('first_name', v_first, 'date', to_char(v_reassess_on, 'DD/MM/YYYY')), 'reassessment_scheduled:' || v_dec.id);
  end if;

  update rtb.applications set
    status = v_to,
    reviewer_id = v_uid,
    athlete_message = coalesce(nullif(btrim(p_message_to_athlete), ''), athlete_message),
    first_contact_at = coalesce(first_contact_at, now()),
    next_reassessment_on = coalesce(v_reassess_on, next_reassessment_on)
  where id = v_app.id;

  insert into rtb.application_events (application_id, user_id, type, from_status, to_status, actor_id, visibility, payload)
  values (v_app.id, v_app.user_id, 'decision.' || lower(p_decision), v_app.status, v_to, v_uid, 'athlete',
    jsonb_build_object('decision_id', v_dec.id, 'decision', p_decision, 'enrollment_status', v_enroll_status));
  perform rtb.append_audit_event('decision.recorded', 'applications', v_app.id::text,
    jsonb_build_object('decision', p_decision, 'from', v_app.status, 'to', v_to, 'decision_id', v_dec.id, 'supersedes', v_prev.id));

  return jsonb_build_object('decision_id', v_dec.id, 'to_status', v_to, 'enrollment_id', v_enroll_id,
    'enrollment_status', v_enroll_status, 'replayed', false);
end $$;

-- Aceite do convite (NEXT) pelo próprio atleta. Exige matrícula ativa verificada.
create or replace function rtb.accept_journey(p_enrollment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_e rtb.journey_enrollments%rowtype; v_state rtb.athlete_states%rowtype;
begin
  select * into v_e from rtb.journey_enrollments where id = p_enrollment_id and user_id = v_uid for update;
  if not found then raise exception 'enrollment_not_found'; end if;
  if v_e.status = 'ACTIVE' then return jsonb_build_object('status', 'ACTIVE', 'replayed', true); end if;
  if v_e.status <> 'OFFERED' then raise exception 'not_offered'; end if;
  select * into v_state from rtb.athlete_states where user_id = v_uid for update;
  if v_state.membership_verified <> 'ATIVO_CONFIRMADO' then raise exception 'active_membership_required'; end if;
  update rtb.journey_enrollments set status = 'ACTIVE', accepted_at = now(), activated_at = now() where id = v_e.id;
  update rtb.athlete_states set access_status = 'ACTIVE_MEMBER', journey_status = v_e.journey, updated_at = now() where user_id = v_uid;
  insert into rtb.application_events (application_id, user_id, type, actor_id, visibility, payload)
  values (v_e.application_id, v_uid, 'journey.accepted', v_uid, 'athlete', jsonb_build_object('journey', v_e.journey));
  perform rtb.stamp(v_uid, case when v_e.journey = 'BORA_NEXT' then 'bora-next' else 'road-to-boston' end, 'enrollment:' || v_e.id);
  perform rtb.notify(v_uid, 'journey.active', case when v_e.journey = 'BORA_NEXT' then 'Bem-vindo ao BORA NEXT' else 'Bem-vindo ao Road to Boston 2028' end,
    'Suas metas aparecem no Passport assim que seu treinador as cadastrar.', '/passport/jornada');
  perform rtb.queue_email(v_uid, 'cycle_joined', jsonb_build_object('first_name', rtb.first_name(v_uid),
    'journey', case when v_e.journey = 'BORA_NEXT' then 'BORA NEXT' else 'Road to Boston 2028' end), 'cycle_joined:' || v_e.id);
  perform rtb.append_audit_event('journey.accepted', 'journey_enrollments', v_e.id::text, jsonb_build_object('journey', v_e.journey));
  return jsonb_build_object('status', 'ACTIVE', 'replayed', false);
end $$;

create or replace function rtb.decline_journey(p_enrollment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_e rtb.journey_enrollments%rowtype;
begin
  select * into v_e from rtb.journey_enrollments where id = p_enrollment_id and user_id = v_uid for update;
  if not found then raise exception 'enrollment_not_found'; end if;
  if v_e.status not in ('OFFERED', 'PENDING_ENROLLMENT') then raise exception 'invalid_state'; end if;
  update rtb.journey_enrollments set status = 'CANCELLED', ended_at = now(), end_reason = 'declined_by_athlete' where id = v_e.id;
  insert into rtb.application_events (application_id, user_id, type, actor_id, visibility, payload)
  values (v_e.application_id, v_uid, 'journey.declined', v_uid, 'athlete', jsonb_build_object('journey', v_e.journey, 'reason', left(p_reason, 300)));
  perform rtb.append_audit_event('journey.declined', 'journey_enrollments', v_e.id::text, '{}'::jsonb);
end $$;

-- Verificação de vínculo (humana). Muda acesso e jornadas sem apagar histórico.
create or replace function rtb.verify_member_link(
  p_user_id uuid, p_status text, p_source text, p_note text, p_external_member_id text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_any_role(array['membership_verifier', 'super_admin']);
  v_state rtb.athlete_states%rowtype;
  v_prev text;
  v_e record;
  v_changes int := 0;
begin
  if p_status not in ('PENDENTE', 'ATIVO_CONFIRMADO', 'EX_ALUNO_CONFIRMADO', 'NAO_ALUNO_CONFIRMADO', 'DIVERGENCIA') then
    raise exception 'invalid_membership_status';
  end if;
  if p_source not in ('manual', 'running_sync', 'import') then raise exception 'invalid_source'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required'; end if;
  select * into v_state from rtb.athlete_states where user_id = p_user_id for update;
  if not found then raise exception 'athlete_not_found'; end if;
  if not rtb.has_role('super_admin') and not rtb.role_allows_polo('membership_verifier', v_state.polo) then
    raise exception 'forbidden_scope' using errcode = '42501';
  end if;
  v_prev := v_state.membership_verified;

  insert into rtb.membership_verifications (user_id, status, previous_status, source, external_member_id, note, verified_by)
  values (p_user_id, p_status, v_prev, p_source, nullif(btrim(p_external_member_id), ''), btrim(p_note), v_uid);

  if p_external_member_id is not null and btrim(p_external_member_id) <> '' then
    insert into rtb.external_member_links (user_id, provider, external_member_id, status, created_by)
    values (p_user_id, 'running', btrim(p_external_member_id), 'linked', v_uid)
    on conflict (provider, external_member_id) do update set user_id = excluded.user_id, status = 'linked', updated_at = now();
  end if;

  if p_status = 'ATIVO_CONFIRMADO' then
    update rtb.athlete_states set membership_verified = p_status, access_status = 'ACTIVE_MEMBER', updated_at = now()
    where user_id = p_user_id;
    for v_e in
      select * from rtb.journey_enrollments where user_id = p_user_id and status in ('PENDING_ENROLLMENT', 'PAUSED') for update
    loop
      if v_e.journey = 'ROAD_TO_BOSTON' or (v_e.status = 'PAUSED' and v_e.accepted_at is not null) then
        update rtb.journey_enrollments set status = 'ACTIVE', activated_at = coalesce(activated_at, now()),
          accepted_at = coalesce(accepted_at, now()), end_reason = null where id = v_e.id;
        update rtb.athlete_states set journey_status = v_e.journey, updated_at = now() where user_id = p_user_id;
        perform rtb.stamp(p_user_id, case when v_e.journey = 'BORA_NEXT' then 'bora-next' else 'road-to-boston' end, 'enrollment:' || v_e.id);
        perform rtb.notify(p_user_id, 'journey.active', 'Matrícula confirmada: sua jornada começou', null, '/passport/jornada');
        perform rtb.queue_email(p_user_id, 'cycle_joined', jsonb_build_object('first_name', rtb.first_name(p_user_id),
          'journey', case when v_e.journey = 'BORA_NEXT' then 'BORA NEXT' else 'Road to Boston 2028' end), 'cycle_joined:verify:' || v_e.id);
      else
        update rtb.journey_enrollments set status = 'OFFERED' where id = v_e.id;
        perform rtb.notify(p_user_id, 'journey.next_offered', 'Matrícula confirmada: aceite o BORA NEXT no Passport', null, '/passport/jornada');
      end if;
      v_changes := v_changes + 1;
    end loop;
    update rtb.commercial_opportunities set status = 'WON', converted_at = now()
    where user_id = p_user_id and status in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'ON_HOLD');
    insert into rtb.commercial_activities (opportunity_id, actor_id, kind, note)
    select o.id, v_uid, 'system', 'Matrícula verificada pela equipe de vínculo.'
    from rtb.commercial_opportunities o where o.user_id = p_user_id and o.converted_at > now() - interval '1 minute';
  else
    update rtb.athlete_states set
      membership_verified = p_status,
      access_status = case
        when access_status = 'ACTIVE_MEMBER' then 'SUSPENDED'
        else access_status end,
      journey_status = case when journey_status in ('ROAD_TO_BOSTON', 'BORA_NEXT') then 'PAUSED' else journey_status end,
      updated_at = now()
    where user_id = p_user_id;
    update rtb.journey_enrollments set status = 'PAUSED', end_reason = 'membership_changed'
    where user_id = p_user_id and status = 'ACTIVE';
    get diagnostics v_changes = row_count;
    update rtb.journey_enrollments set status = 'PENDING_ENROLLMENT' where user_id = p_user_id and status = 'OFFERED';
  end if;

  insert into rtb.application_events (application_id, user_id, type, actor_id, visibility, payload)
  values (null, p_user_id, 'membership.verified', v_uid, 'athlete', jsonb_build_object('from', v_prev, 'to', p_status, 'source', p_source));
  perform rtb.notify(p_user_id, 'membership.updated', 'Vínculo com a BORA atualizado', null, '/passport/perfil');
  perform rtb.append_audit_event('membership.verified', 'athlete_states', p_user_id::text,
    jsonb_build_object('from', v_prev, 'to', p_status, 'source', p_source, 'journeys_changed', v_changes));
  return jsonb_build_object('from', v_prev, 'to', p_status, 'journeys_changed', v_changes);
end $$;

create or replace function rtb.set_athlete_polo(p_user_id uuid, p_polo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'technical_director', 'membership_verifier']);
begin
  update rtb.athlete_states set polo = nullif(btrim(p_polo), ''), updated_at = now() where user_id = p_user_id;
  perform rtb.append_audit_event('athlete.polo', 'athlete_states', p_user_id::text, jsonb_build_object('polo', p_polo));
end $$;

create or replace function rtb.set_automations_paused(p_user_id uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'technical_director', 'commercial', 'growth']);
begin
  update rtb.athlete_states set automations_paused = p_paused, updated_at = now() where user_id = p_user_id;
  update rtb.email_outbox o set status = 'suppressed'
  from rtb.message_templates t
  where p_paused and o.user_id = p_user_id and o.status = 'queued' and t.key = o.template_key and t.kind = 'automation';
  perform rtb.append_audit_event('athlete.automations', 'athlete_states', p_user_id::text, jsonb_build_object('paused', p_paused));
end $$;

create or replace function rtb.assign_coach(p_athlete uuid, p_coach uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'technical_director']);
begin
  if p_coach is not null and not exists (
    select 1 from rtb.user_roles r where r.user_id = p_coach and r.role = 'coach' and r.revoked_at is null
  ) then
    raise exception 'not_a_coach';
  end if;
  update rtb.athlete_coach_assignments set ends_at = now() where athlete_id = p_athlete and ends_at is null;
  if p_coach is not null then
    insert into rtb.athlete_coach_assignments (athlete_id, coach_user_id, assigned_by) values (p_athlete, p_coach, v_uid);
  end if;
  perform rtb.append_audit_event('coach.assigned', 'athlete_coach_assignments', p_athlete::text, jsonb_build_object('coach', p_coach));
end $$;

create or replace function rtb.save_training_goal(p_id uuid, p_user_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_id uuid; v_journey text;
begin
  if not rtb.can_coach_athlete(p_user_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select e.journey into v_journey from rtb.journey_enrollments e
  where e.user_id = p_user_id and e.status = 'ACTIVE' order by e.activated_at desc limit 1;
  if v_journey is null then raise exception 'no_active_journey'; end if;
  if p_id is null then
    insert into rtb.training_goals (user_id, journey, title, description, target_distance, target_seconds, due_on, created_by)
    values (p_user_id, v_journey, btrim(p ->> 'title'), nullif(btrim(p ->> 'description'), ''), nullif(p ->> 'target_distance', ''),
      nullif(p ->> 'target_seconds', '')::int, nullif(p ->> 'due_on', '')::date, v_uid)
    returning id into v_id;
  else
    update rtb.training_goals set title = btrim(p ->> 'title'), description = nullif(btrim(p ->> 'description'), ''),
      target_distance = nullif(p ->> 'target_distance', ''), target_seconds = nullif(p ->> 'target_seconds', '')::int,
      due_on = nullif(p ->> 'due_on', '')::date, status = coalesce(nullif(p ->> 'status', ''), status)
    where id = p_id and user_id = p_user_id returning id into v_id;
    if v_id is null then raise exception 'goal_not_found'; end if;
  end if;
  perform rtb.notify(p_user_id, 'goal.updated', 'Seu treinador atualizou suas metas', null, '/passport/indicadores');
  perform rtb.append_audit_event('goal.saved', 'training_goals', v_id::text, '{}'::jsonb);
  return v_id;
end $$;

create or replace function rtb.schedule_reassessment(p_user_id uuid, p_application_id uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_id uuid;
begin
  if not rtb.can_coach_athlete(p_user_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_date < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'date_in_past'; end if;
  insert into rtb.reassessments (user_id, application_id, scheduled_for, reason, created_by)
  values (p_user_id, p_application_id, p_date, nullif(btrim(p_reason), ''), v_uid) returning id into v_id;
  update rtb.applications set next_reassessment_on = p_date where id = p_application_id and user_id = p_user_id;
  perform rtb.notify(p_user_id, 'reassessment.scheduled', 'Reavaliação agendada', 'Data: ' || to_char(p_date, 'DD/MM/YYYY'), '/passport/indicadores');
  perform rtb.queue_email(p_user_id, 'reassessment_scheduled', jsonb_build_object('first_name', rtb.first_name(p_user_id),
    'date', to_char(p_date, 'DD/MM/YYYY')), 'reassessment_scheduled:' || v_id);
  perform rtb.append_audit_event('reassessment.scheduled', 'reassessments', v_id::text, '{}'::jsonb);
  return v_id;
end $$;

-- ───────────────────────── Testes, níveis e carimbos ─────────────────────────

-- Fórmula de Riegel (T2 = T1 × (D2/D1)^k) com expoente versionado em program_settings.ranking.
create or replace function rtb.equivalent_marathon(p_seconds int, p_distance_m int) returns int
language sql stable security definer set search_path = '' as $$
  select round(p_seconds * power(42195.0 / p_distance_m, coalesce((rtb.setting('ranking') ->> 'riegel_exponent')::numeric, 1.06)))::int
$$;

create or replace function rtb.level_for_pct(p_pct numeric) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_pct <= -coalesce((rtb.setting('ranking') ->> 'safe_margin_pct')::numeric, 3) then 'BOSTON_SEGURO'
    when p_pct <= 0 then 'INDICE'
    when p_pct <= coalesce((rtb.setting('ranking') ->> 'on_route_pct')::numeric, 3) then 'NA_ROTA'
    else 'EM_PREPARACAO'
  end
$$;

create or replace function rtb.submit_test_result(p_test_id uuid, p_seconds int, p_document_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_state rtb.athlete_states%rowtype; v_test rtb.tests%rowtype; v_id uuid;
begin
  select * into v_state from rtb.athlete_states where user_id = v_uid;
  if v_state.access_status <> 'ACTIVE_MEMBER' or v_state.journey_status not in ('ROAD_TO_BOSTON', 'BORA_NEXT') then
    raise exception 'active_journey_required';
  end if;
  select * into v_test from rtb.tests where id = p_test_id;
  if not found or v_test.status <> 'open' then raise exception 'test_not_open'; end if;
  if p_document_id is not null and not exists (select 1 from rtb.application_documents d where d.id = p_document_id and d.user_id = v_uid) then
    raise exception 'invalid_document';
  end if;
  insert into rtb.test_results (test_id, user_id, seconds, evidence_document_id)
  values (p_test_id, v_uid, p_seconds, p_document_id)
  on conflict (test_id, user_id) do update set seconds = excluded.seconds, evidence_document_id = excluded.evidence_document_id,
    status = 'SUBMITTED', validated_by = null, validated_at = null
  where rtb.test_results.status <> 'VALIDATED'
  returning id into v_id;
  if v_id is null then raise exception 'result_already_validated'; end if;
  perform rtb.append_audit_event('test.submitted', 'test_results', v_id::text, '{}'::jsonb);
  return v_id;
end $$;

create or replace function rtb.award_badge(p_user_id uuid, p_badge_slug text, p_source_ref text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_badge rtb.badge_definitions%rowtype; v_id uuid;
begin
  if not (rtb.has_role('super_admin') or rtb.can_coach_athlete(p_user_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_badge from rtb.badge_definitions where slug = p_badge_slug and active;
  if not found then raise exception 'badge_not_found'; end if;
  insert into rtb.earned_badges (user_id, badge_id, source_ref, note, awarded_by)
  values (p_user_id, v_badge.id, coalesce(nullif(btrim(p_source_ref), ''), 'manual'), nullif(btrim(p_note), ''), v_uid)
  on conflict (user_id, badge_id, source_ref) do nothing
  returning id into v_id;
  if v_id is not null then
    perform rtb.notify(p_user_id, 'badge.awarded', 'Novo carimbo no seu passaporte: ' || v_badge.name, null, '/passport/conquistas');
    perform rtb.append_audit_event('badge.awarded', 'earned_badges', v_id::text, jsonb_build_object('badge', p_badge_slug));
  end if;
  return v_id;
end $$;

create or replace function rtb.validate_test_result(p_result_id uuid, p_status text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_r rtb.test_results%rowtype;
  v_test rtb.tests%rowtype;
  v_profile rtb.profiles%rowtype;
  v_version uuid := rtb.active_standard_version();
  v_race date;
  v_ref int; v_equiv int; v_pct numeric; v_level text;
begin
  select * into v_r from rtb.test_results where id = p_result_id for update;
  if not found then raise exception 'result_not_found'; end if;
  if not rtb.can_coach_athlete(v_r.user_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('VALIDATED', 'REJECTED') then raise exception 'invalid_status'; end if;
  select * into v_test from rtb.tests where id = v_r.test_id;
  select * into v_profile from rtb.profiles where user_id = v_r.user_id;
  select race_date into v_race from rtb.standard_versions where id = v_version;
  if p_status = 'VALIDATED' and v_test.distance_m is not null and v_profile.reference_category in ('M', 'F', 'X') then
    v_ref := rtb.lookup_standard(v_version, v_profile.reference_category, rtb.age_on(v_profile.birth_date, v_race));
    v_equiv := rtb.equivalent_marathon(v_r.seconds, v_test.distance_m);
    if v_ref is not null then
      v_pct := round(((v_equiv - v_ref)::numeric / v_ref) * 100, 2);
      v_level := rtb.level_for_pct(v_pct);
    end if;
  end if;
  update rtb.test_results set status = p_status, validated_by = v_uid, validated_at = now(), review_note = nullif(btrim(p_note), ''),
    equivalent_marathon_seconds = v_equiv, reference_seconds = v_ref, normalized_pct = v_pct, level = v_level,
    formula_version = 'riegel:' || coalesce(rtb.setting('ranking') ->> 'riegel_exponent', '1.06')
  where id = v_r.id;
  if p_status = 'VALIDATED' and v_test.badge_slug is not null then
    perform rtb.award_badge(v_r.user_id, v_test.badge_slug, 'test:' || v_test.id, null);
  end if;
  perform rtb.notify(v_r.user_id, 'test.reviewed', case when p_status = 'VALIDATED' then 'Resultado validado: ' || v_test.name else 'Resultado não validado: ' || v_test.name end,
    nullif(btrim(p_note), ''), '/passport/testes');
  perform rtb.append_audit_event('test.validated', 'test_results', v_r.id::text, jsonb_build_object('status', p_status, 'level', v_level));
  return jsonb_build_object('status', p_status, 'normalized_pct', v_pct, 'level', v_level);
end $$;

-- ───────────────────────── Comercial ─────────────────────────

create or replace function rtb.update_opportunity(
  p_id uuid, p_status text, p_owner uuid, p_next_action text, p_next_action_on date, p_note text, p_lost_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['commercial', 'super_admin']); v_o rtb.commercial_opportunities%rowtype;
begin
  select * into v_o from rtb.commercial_opportunities where id = p_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if p_status not in ('OPEN', 'CONTACTED', 'NEGOTIATING', 'WON', 'LOST', 'ON_HOLD') then raise exception 'invalid_status'; end if;
  if p_status = 'WON' and not exists (
    select 1 from rtb.athlete_states s where s.user_id = v_o.user_id and s.membership_verified = 'ATIVO_CONFIRMADO'
  ) then
    raise exception 'won_requires_verified_enrollment' using hint = 'A conversão só conta com a matrícula verificada pela equipe de vínculo.';
  end if;
  update rtb.commercial_opportunities set status = p_status, owner_id = p_owner, next_action = nullif(btrim(p_next_action), ''),
    next_action_on = p_next_action_on, lost_reason = case when p_status = 'LOST' then nullif(btrim(p_lost_reason), '') end,
    converted_at = case when p_status = 'WON' then coalesce(converted_at, now()) else null end
  where id = p_id;
  insert into rtb.commercial_activities (opportunity_id, actor_id, kind, note)
  values (p_id, v_uid, case when p_status <> v_o.status then 'status_change' else 'note' end,
    coalesce(nullif(btrim(p_note), ''), case when p_status <> v_o.status then v_o.status || ' → ' || p_status end));
  perform rtb.append_audit_event('commercial.updated', 'commercial_opportunities', p_id::text, jsonb_build_object('status', p_status));
end $$;

-- ───────────────────────── Benefícios ─────────────────────────

-- Elegibilidade de um benefício para um atleta. Devolve o motivo quando não pode.
create or replace function rtb.benefit_eligibility(p_benefit_id uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_b rtb.benefits%rowtype;
  v_state rtb.athlete_states%rowtype;
  v_profile rtb.profiles%rowtype;
  v_used int;
  v_open int;
begin
  select * into v_b from rtb.benefits where id = p_benefit_id;
  if not found or v_b.status <> 'ACTIVE' then return jsonb_build_object('eligible', false, 'reason', 'not_active'); end if;
  if exists (select 1 from rtb.partners pa where pa.id = v_b.partner_id and pa.status <> 'ACTIVE') then
    return jsonb_build_object('eligible', false, 'reason', 'not_active');
  end if;
  if v_b.starts_at is not null and now() < v_b.starts_at then return jsonb_build_object('eligible', false, 'reason', 'not_started'); end if;
  if v_b.ends_at is not null and now() > v_b.ends_at then return jsonb_build_object('eligible', false, 'reason', 'ended'); end if;
  select * into v_state from rtb.athlete_states where user_id = p_user;
  select * into v_profile from rtb.profiles where user_id = p_user and deleted_at is null;
  if v_profile.user_id is null then return jsonb_build_object('eligible', false, 'reason', 'profile_required'); end if;
  if v_b.requires_active_member and v_state.access_status is distinct from 'ACTIVE_MEMBER' then
    return jsonb_build_object('eligible', false, 'reason', 'requires_active_member');
  end if;
  if v_b.journey_scope = 'ROAD' and v_state.journey_status is distinct from 'ROAD_TO_BOSTON'
     or v_b.journey_scope = 'NEXT' and v_state.journey_status is distinct from 'BORA_NEXT'
     or v_b.journey_scope = 'BOTH' and v_state.journey_status not in ('ROAD_TO_BOSTON', 'BORA_NEXT') then
    return jsonb_build_object('eligible', false, 'reason', 'journey_mismatch');
  end if;
  if cardinality(v_b.ufs) > 0 and (v_profile.uf is null or not v_profile.uf = any (v_b.ufs))
     or cardinality(v_b.cities) > 0 and (v_profile.city is null or not lower(v_profile.city) = any (select lower(c) from unnest(v_b.cities) c))
     or cardinality(v_b.polos) > 0 and (v_state.polo is null or not v_state.polo = any (v_b.polos)) then
    return jsonb_build_object('eligible', false, 'reason', 'location_mismatch');
  end if;
  select count(*) filter (where status in ('RESERVED', 'ISSUED', 'REDEEMED')),
         count(*) filter (where status in ('RESERVED', 'ISSUED'))
    into v_used, v_open
  from rtb.benefit_redemptions where benefit_id = v_b.id and user_id = p_user;
  if v_open > 0 then return jsonb_build_object('eligible', false, 'reason', 'pending_redemption'); end if;
  if v_used >= v_b.per_member_limit then return jsonb_build_object('eligible', false, 'reason', 'limit_reached'); end if;
  if v_b.remaining_quantity is not null and v_b.remaining_quantity <= 0 then
    return jsonb_build_object('eligible', false, 'reason', 'sold_out');
  end if;
  return jsonb_build_object('eligible', true, 'reason', null);
end $$;

-- Vitrine do atleta: só campos públicos, nunca segredos. Bloqueados aparecem com o motivo.
create or replace function rtb.my_benefit_catalog() returns table (
  id uuid, slug text, title text, summary text, category text, partner_name text, partner_slug text,
  partner_logo_path text, image_path text, mode text, journey_scope text, requires_active_member boolean,
  starts_at timestamptz, ends_at timestamptz, remaining_quantity int, total_quantity int, eligible boolean,
  lock_reason text, is_demo boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid();
begin
  return query
  select b.id, b.slug, b.title, b.summary, b.category, pa.name, pa.slug,
    case when pa.brand_authorized then pa.logo_path end, b.image_path, b.mode, b.journey_scope, b.requires_active_member,
    b.starts_at, b.ends_at, b.remaining_quantity, b.total_quantity,
    (e.r ->> 'eligible')::boolean, e.r ->> 'reason', b.is_demo
  from rtb.benefits b
  join rtb.partners pa on pa.id = b.partner_id and pa.status = 'ACTIVE'
  cross join lateral (select rtb.benefit_eligibility(b.id, v_uid) as r) e
  where b.status = 'ACTIVE' and b.visibility <> 'HIDDEN'
    and (b.visibility = 'VISIBLE_LOCKED' or (e.r ->> 'eligible')::boolean or (e.r ->> 'reason') in ('pending_redemption', 'limit_reached', 'sold_out'))
  order by (e.r ->> 'eligible')::boolean desc, b.created_at desc;
end $$;

create or replace function rtb.my_benefit_detail(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid(); v_b rtb.benefits%rowtype; v_pa rtb.partners%rowtype;
begin
  select * into v_b from rtb.benefits where slug = p_slug and status = 'ACTIVE' and visibility <> 'HIDDEN';
  if not found then return null; end if;
  select * into v_pa from rtb.partners where id = v_b.partner_id and status = 'ACTIVE';
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_b.id, 'slug', v_b.slug, 'title', v_b.title, 'summary', v_b.summary, 'description', v_b.description,
    'rules', v_b.rules, 'category', v_b.category, 'audience_note', v_b.audience_note, 'mode', v_b.mode,
    'journey_scope', v_b.journey_scope, 'requires_active_member', v_b.requires_active_member,
    'starts_at', v_b.starts_at, 'ends_at', v_b.ends_at, 'remaining_quantity', v_b.remaining_quantity,
    'total_quantity', v_b.total_quantity, 'per_member_limit', v_b.per_member_limit, 'image_path', v_b.image_path,
    'redemption_instructions', v_b.redemption_instructions, 'terms', v_b.terms, 'cancellation_policy', v_b.cancellation_policy,
    'code_ttl_hours', v_b.code_ttl_hours, 'is_demo', v_b.is_demo, 'is_health_related', v_b.is_health_related,
    'partner', jsonb_build_object('name', v_pa.name, 'slug', v_pa.slug, 'description', v_pa.description,
      'website_url', v_pa.website_url, 'logo_path', case when v_pa.brand_authorized then v_pa.logo_path end),
    'eligibility', rtb.benefit_eligibility(v_b.id, v_uid)
  );
end $$;

-- Resgates do próprio atleta, com os campos públicos do benefício e os segredos que só ele pode ver.
create or replace function rtb.my_redemptions() returns table (
  id uuid, status text, created_at timestamptz, issued_at timestamptz, expires_at timestamptz, redeemed_at timestamptz,
  cancel_reason text, title text, mode text, redemption_instructions text, is_demo boolean,
  display_code text, qr_token text, external_url text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_uid();
begin
  return query
  select r.id, r.status, r.created_at, r.issued_at, r.expires_at, r.redeemed_at, r.cancel_reason,
         b.title, b.mode, b.redemption_instructions, b.is_demo,
         case when r.status = 'ISSUED' then s.display_code end,
         case when r.status = 'ISSUED' then s.qr_token end,
         case when r.status = 'ISSUED' then s.external_url end
  from rtb.benefit_redemptions r
  join rtb.benefits b on b.id = r.benefit_id
  left join rtb.redemption_secrets s on s.redemption_id = r.id
  where r.user_id = v_uid
  order by r.created_at desc;
end $$;

create or replace function rtb.track_benefit_view(p_benefit_id uuid) returns void
language sql security definer set search_path = '' as $$
  update rtb.benefits set views_count = views_count + 1 where id = p_benefit_id and status = 'ACTIVE';
$$;

-- Resgate atômico: trava o benefício (FOR UPDATE), confere tudo no servidor, baixa estoque e emite código único.
create or replace function rtb.claim_benefit(p_benefit_id uuid, p_idempotency_key text, p_accept_terms boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_b rtb.benefits%rowtype;
  v_s rtb.benefit_secrets%rowtype;
  v_existing rtb.benefit_redemptions%rowtype;
  v_elig jsonb;
  v_seq int;
  v_red rtb.benefit_redemptions%rowtype;
  v_code text;
  v_token text;
  v_url text;
  v_status text;
  v_pool_id uuid;
  v_expires timestamptz;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,80}$' then raise exception 'idempotency_key_required'; end if;
  select * into v_existing from rtb.benefit_redemptions where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
    return jsonb_build_object('redemption_id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;
  if not coalesce(p_accept_terms, false) then raise exception 'terms_required'; end if;
  if not rtb.hit_rate_limit('claim:' || v_uid, 20, 3600) then raise exception 'rate_limited'; end if;

  -- Ponto de serialização: dois resgates simultâneos da última unidade esperam aqui; só um passa.
  select * into v_b from rtb.benefits where id = p_benefit_id for update;
  if not found then raise exception 'benefit_not_found'; end if;

  v_elig := rtb.benefit_eligibility(v_b.id, v_uid);
  if not (v_elig ->> 'eligible')::boolean then
    raise exception 'not_eligible:%', v_elig ->> 'reason';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_seq from rtb.benefit_redemptions where benefit_id = v_b.id and user_id = v_uid;
  select * into v_s from rtb.benefit_secrets where benefit_id = v_b.id;
  v_expires := now() + make_interval(hours => v_b.code_ttl_hours);

  if v_b.mode = 'ONE_TIME_CODE' then
    select id, code into v_pool_id, v_code from rtb.benefit_codes
    where benefit_id = v_b.id and status = 'AVAILABLE' order by created_at limit 1 for update skip locked;
    if v_pool_id is null then
      if v_b.generate_codes then
        v_code := 'BORA-' || rtb.random_code(8);
      else
        raise exception 'not_eligible:sold_out';
      end if;
    end if;
    v_status := 'ISSUED';
  elsif v_b.mode = 'QR_VALIDATION' then
    v_code := rtb.random_code(8);
    v_token := encode(extensions.gen_random_bytes(20), 'hex');
    v_status := 'ISSUED';
  elsif v_b.mode = 'COUPON' then
    if v_s.coupon_code is null then raise exception 'benefit_misconfigured'; end if;
    v_code := v_s.coupon_code;
    v_status := 'ISSUED';
  elsif v_b.mode = 'EXTERNAL_URL' then
    if v_s.external_url is null then raise exception 'benefit_misconfigured'; end if;
    v_url := v_s.external_url;
    v_status := 'ISSUED';
  else
    v_status := 'RESERVED';
  end if;

  if v_b.remaining_quantity is not null then
    update rtb.benefits set remaining_quantity = remaining_quantity - 1 where id = v_b.id;
  end if;

  insert into rtb.benefit_redemptions (benefit_id, partner_id, user_id, sequence, status, issued_at, expires_at, idempotency_key)
  values (v_b.id, v_b.partner_id, v_uid, v_seq, v_status, case when v_status = 'ISSUED' then now() end,
    case when v_status = 'ISSUED' then v_expires end, p_idempotency_key)
  returning * into v_red;

  if v_pool_id is not null then
    update rtb.benefit_codes set status = 'ASSIGNED', redemption_id = v_red.id where id = v_pool_id;
  end if;
  insert into rtb.redemption_secrets (redemption_id, user_id, benefit_id, display_code, qr_token, external_url)
  values (v_red.id, v_uid, v_b.id, v_code, v_token, v_url);

  insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id)
  values (v_red.id, v_b.id, v_b.partner_id, v_uid, case when v_status = 'ISSUED' then 'issued' else 'reserved' end, v_uid);
  perform rtb.notify(v_uid, 'benefit.issued',
    case when v_status = 'ISSUED' then 'Benefício emitido: ' || v_b.title else 'Pedido de benefício enviado: ' || v_b.title end,
    case when v_status = 'ISSUED' then 'Seu código está em Resgates.' else 'A equipe BORA vai aprovar e você recebe o código aqui.' end,
    '/passport/resgates');
  if v_status = 'ISSUED' then
    perform rtb.queue_email(v_uid, 'benefit_issued', jsonb_build_object('first_name', rtb.first_name(v_uid), 'benefit', v_b.title,
      'expires_at', to_char(v_expires at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')), 'benefit_issued:' || v_red.id);
  end if;
  perform rtb.append_audit_event('benefit.claimed', 'benefit_redemptions', v_red.id::text,
    jsonb_build_object('benefit', v_b.id, 'status', v_status, 'sequence', v_seq));
  return jsonb_build_object('redemption_id', v_red.id, 'status', v_status, 'expires_at', v_red.expires_at, 'replayed', false);
end $$;

-- Validação no parceiro: uma única vez. Repetir com a mesma chave devolve o mesmo resultado (idempotente).
create or replace function rtb.validate_redemption(p_token text, p_code text, p_benefit_id uuid, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := rtb.require_uid();
  v_sec rtb.redemption_secrets%rowtype;
  v_red rtb.benefit_redemptions%rowtype;
  v_b rtb.benefits%rowtype;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,80}$' then raise exception 'idempotency_key_required'; end if;
  if not rtb.hit_rate_limit('validate:' || v_uid, 120, 3600) then raise exception 'rate_limited'; end if;
  if p_token is not null and p_token <> '' then
    select * into v_sec from rtb.redemption_secrets where qr_token = lower(btrim(p_token));
  elsif p_code is not null and p_benefit_id is not null then
    select * into v_sec from rtb.redemption_secrets where benefit_id = p_benefit_id and display_code = upper(btrim(p_code)) and qr_token is not null;
    if v_sec.redemption_id is null then
      select s.* into v_sec from rtb.redemption_secrets s join rtb.benefits b on b.id = s.benefit_id
      where s.benefit_id = p_benefit_id and s.display_code = btrim(p_code) and b.mode = 'ONE_TIME_CODE';
    end if;
  end if;
  if v_sec.redemption_id is null then raise exception 'redemption_not_found'; end if;

  select * into v_red from rtb.benefit_redemptions where id = v_sec.redemption_id for update;
  select * into v_b from rtb.benefits where id = v_red.benefit_id;
  if not (rtb.has_role('super_admin') or exists (
    select 1 from rtb.user_roles r where r.user_id = v_uid and r.role = 'partner_operator' and r.partner_id = v_red.partner_id and r.revoked_at is null
  )) then
    raise exception 'forbidden_partner' using errcode = '42501';
  end if;

  if v_red.status = 'REDEEMED' then
    if v_red.validation_idempotency_key = p_idempotency_key then
      return jsonb_build_object('status', 'REDEEMED', 'redeemed_at', v_red.redeemed_at, 'benefit', v_b.title, 'replayed', true);
    end if;
    insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id, payload)
    values (v_red.id, v_red.benefit_id, v_red.partner_id, v_red.user_id, 'validation_failed', v_uid, jsonb_build_object('reason', 'already_redeemed'));
    return jsonb_build_object('status', 'REJECTED', 'reason', 'already_redeemed', 'redeemed_at', v_red.redeemed_at, 'benefit', v_b.title);
  end if;
  if v_red.status = 'ISSUED' and v_red.expires_at is not null and v_red.expires_at < now() then
    update rtb.benefit_redemptions set status = 'EXPIRED' where id = v_red.id;
    insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id)
    values (v_red.id, v_red.benefit_id, v_red.partner_id, v_red.user_id, 'expired', v_uid);
    return jsonb_build_object('status', 'REJECTED', 'reason', 'expired', 'benefit', v_b.title);
  end if;
  if v_red.status <> 'ISSUED' then
    return jsonb_build_object('status', 'REJECTED', 'reason', lower(v_red.status), 'benefit', v_b.title);
  end if;

  update rtb.benefit_redemptions set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid,
    validation_idempotency_key = p_idempotency_key
  where id = v_red.id;
  insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id)
  values (v_red.id, v_red.benefit_id, v_red.partner_id, v_red.user_id, 'redeemed', v_uid);
  perform rtb.notify(v_red.user_id, 'benefit.redeemed', 'Benefício utilizado: ' || v_b.title, null, '/passport/resgates');
  perform rtb.queue_email(v_red.user_id, 'benefit_redeemed', jsonb_build_object('first_name', rtb.first_name(v_red.user_id), 'benefit', v_b.title),
    'benefit_redeemed:' || v_red.id);
  perform rtb.append_audit_event('benefit.redeemed', 'benefit_redemptions', v_red.id::text, jsonb_build_object('partner', v_red.partner_id));
  -- Dado mínimo ao parceiro: primeiro nome e inicial.
  return jsonb_build_object('status', 'REDEEMED', 'redeemed_at', now(), 'benefit', v_b.title, 'replayed', false,
    'member', (select coalesce(nullif(p.preferred_name, ''), split_part(p.full_name, ' ', 1)) || ' ' ||
      left(coalesce(nullif(split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1)), ''), ''), 1) || '.'
      from rtb.profiles p where p.user_id = v_red.user_id));
end $$;

create or replace function rtb.approve_manual_redemption(p_redemption_id uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth']); v_red rtb.benefit_redemptions%rowtype; v_b rtb.benefits%rowtype;
begin
  select * into v_red from rtb.benefit_redemptions where id = p_redemption_id for update;
  if not found or v_red.status <> 'RESERVED' then raise exception 'invalid_state'; end if;
  select * into v_b from rtb.benefits where id = v_red.benefit_id;
  update rtb.benefit_redemptions set status = 'ISSUED', issued_at = now(), expires_at = now() + make_interval(hours => v_b.code_ttl_hours)
  where id = v_red.id;
  update rtb.redemption_secrets set display_code = coalesce(nullif(btrim(p_code), ''), 'BORA-' || rtb.random_code(8)),
    qr_token = coalesce(qr_token, encode(extensions.gen_random_bytes(20), 'hex'))
  where redemption_id = v_red.id;
  insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id)
  values (v_red.id, v_red.benefit_id, v_red.partner_id, v_red.user_id, 'approved', v_uid);
  perform rtb.notify(v_red.user_id, 'benefit.issued', 'Benefício aprovado: ' || v_b.title, 'Seu código está em Resgates.', '/passport/resgates');
  perform rtb.queue_email(v_red.user_id, 'benefit_issued', jsonb_build_object('first_name', rtb.first_name(v_red.user_id), 'benefit', v_b.title,
    'expires_at', to_char((now() + make_interval(hours => v_b.code_ttl_hours)) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')), 'benefit_issued:' || v_red.id);
  perform rtb.append_audit_event('benefit.approved', 'benefit_redemptions', v_red.id::text, '{}'::jsonb);
end $$;

create or replace function rtb.cancel_redemption(p_redemption_id uuid, p_reason text, p_return_stock boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth']); v_red rtb.benefit_redemptions%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  select * into v_red from rtb.benefit_redemptions where id = p_redemption_id for update;
  if not found or v_red.status not in ('RESERVED', 'ISSUED') then raise exception 'invalid_state'; end if;
  update rtb.benefit_redemptions set status = 'CANCELLED', cancelled_at = now(), cancel_reason = btrim(p_reason),
    stock_returned = coalesce(p_return_stock, false)
  where id = v_red.id;
  if coalesce(p_return_stock, false) then
    update rtb.benefits set remaining_quantity = least(remaining_quantity + 1, total_quantity)
    where id = v_red.benefit_id and remaining_quantity is not null;
  end if;
  update rtb.benefit_codes set status = 'VOID' where redemption_id = v_red.id;
  insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type, actor_id, payload)
  values (v_red.id, v_red.benefit_id, v_red.partner_id, v_red.user_id, 'cancelled', v_uid, jsonb_build_object('reason', left(p_reason, 300)));
  perform rtb.notify(v_red.user_id, 'benefit.cancelled', 'Resgate cancelado', btrim(p_reason), '/passport/resgates');
  perform rtb.append_audit_event('benefit.cancelled', 'benefit_redemptions', v_red.id::text, jsonb_build_object('stock_returned', p_return_stock));
end $$;

create or replace function rtb.load_benefit_codes(p_benefit_id uuid, p_codes text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth']); v_n int;
begin
  insert into rtb.benefit_codes (benefit_id, code)
  select p_benefit_id, btrim(c) from unnest(p_codes) c where length(btrim(c)) between 4 and 60
  on conflict (benefit_id, code) do nothing;
  get diagnostics v_n = row_count;
  perform rtb.append_audit_event('benefit.codes_loaded', 'benefits', p_benefit_id::text, jsonb_build_object('count', v_n));
  return v_n;
end $$;

create or replace function rtb.duplicate_benefit(p_benefit_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth']); v_b rtb.benefits%rowtype; v_id uuid;
begin
  select * into v_b from rtb.benefits where id = p_benefit_id;
  if not found then raise exception 'benefit_not_found'; end if;
  insert into rtb.benefits (
    partner_id, slug, title, summary, description, rules, category, audience_note, journey_scope, requires_active_member,
    cities, ufs, polos, starts_at, ends_at, total_quantity, remaining_quantity, per_member_limit, restock_on_expiry, image_path,
    redemption_instructions, mode, generate_codes, code_ttl_hours, terms, cancellation_policy, visibility, status,
    is_health_related, is_demo, created_by
  ) values (
    v_b.partner_id, left(v_b.slug, 60) || '-copia-' || lower(rtb.random_code(4)), v_b.title || ' (cópia)', v_b.summary, v_b.description,
    v_b.rules, v_b.category, v_b.audience_note, v_b.journey_scope, v_b.requires_active_member, v_b.cities, v_b.ufs, v_b.polos,
    v_b.starts_at, v_b.ends_at, v_b.total_quantity, v_b.total_quantity, v_b.per_member_limit, v_b.restock_on_expiry, v_b.image_path,
    v_b.redemption_instructions, v_b.mode, v_b.generate_codes, v_b.code_ttl_hours, v_b.terms, v_b.cancellation_policy,
    v_b.visibility, 'DRAFT', v_b.is_health_related, v_b.is_demo, v_uid
  ) returning id into v_id;
  insert into rtb.benefit_secrets (benefit_id, coupon_code, external_url)
  select v_id, s.coupon_code, s.external_url from rtb.benefit_secrets s where s.benefit_id = v_b.id;
  return v_id;
end $$;

-- ───────────────────────── Rotinas (cron, service_role) ─────────────────────────

-- SLA do "Quase lá": avisa a coordenação quando está perto de vencer e quando venceu (uma vez cada).
create or replace function rtb.sla_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_warn int := 0; v_over int := 0; v_eligible int := 0; v_notnow int := 0; v_a record;
begin
  for v_a in
    select a.* from rtb.applications a
    where a.status in ('PRELIM_ALMOST', 'UNDER_REVIEW') and a.first_contact_at is null and a.sla_due_at is not null
  loop
    if now() > v_a.sla_due_at and not exists (select 1 from rtb.application_events e where e.application_id = v_a.id and e.type = 'sla.overdue') then
      insert into rtb.application_events (application_id, user_id, type, visibility) values (v_a.id, v_a.user_id, 'sla.overdue', 'internal');
      perform rtb.notify_role('technical_director', 'sla.overdue', 'SLA vencido: candidatura sem contato', null, '/os/candidatos/' || v_a.id);
      v_over := v_over + 1;
    elsif now() > v_a.sla_due_at - interval '24 hours' and now() <= v_a.sla_due_at
      and not exists (select 1 from rtb.application_events e where e.application_id = v_a.id and e.type = 'sla.warning') then
      insert into rtb.application_events (application_id, user_id, type, visibility) values (v_a.id, v_a.user_id, 'sla.warning', 'internal');
      perform rtb.notify_role('technical_director', 'sla.warning', 'SLA vence em menos de 24 h', null, '/os/candidatos/' || v_a.id);
      v_warn := v_warn + 1;
    end if;
  end loop;
  -- Elegível preliminar sem decisão: lembrete à coordenação em D+2 e D+7.
  for v_a in
    select a.* from rtb.applications a where a.status = 'PRELIM_ELIGIBLE' and a.submitted_at is not null
  loop
    if now() > v_a.submitted_at + interval '2 days' and not exists (select 1 from rtb.application_events e where e.application_id = v_a.id and e.type = 'cadence.eligible_d2') then
      insert into rtb.application_events (application_id, user_id, type, visibility) values (v_a.id, v_a.user_id, 'cadence.eligible_d2', 'internal');
      perform rtb.notify_role('technical_director', 'cadence.eligible', 'Elegível preliminar aguardando parecer (D+2)', null, '/os/candidatos/' || v_a.id);
      v_eligible := v_eligible + 1;
    elsif now() > v_a.submitted_at + interval '7 days' and not exists (select 1 from rtb.application_events e where e.application_id = v_a.id and e.type = 'cadence.eligible_d7') then
      insert into rtb.application_events (application_id, user_id, type, visibility) values (v_a.id, v_a.user_id, 'cadence.eligible_d7', 'internal');
      perform rtb.notify_role('technical_director', 'cadence.eligible', 'Elegível preliminar aguardando parecer (D+7)', null, '/os/candidatos/' || v_a.id);
      v_eligible := v_eligible + 1;
    end if;
  end loop;
  -- "Agora não": acompanhamento a cada 30 dias (lembrete interno; o contato é humano).
  for v_a in
    select a.* from rtb.applications a where a.status = 'PRELIM_NOT_NOW' and a.submitted_at is not null
      and not exists (select 1 from rtb.application_events e where e.application_id = a.id and e.type = 'cadence.not_now_30d'
                        and e.created_at > now() - interval '30 days')
      and now() > a.submitted_at + interval '30 days'
  loop
    insert into rtb.application_events (application_id, user_id, type, visibility) values (v_a.id, v_a.user_id, 'cadence.not_now_30d', 'internal');
    perform rtb.notify_role('technical_director', 'cadence.not_now', 'Acompanhamento de 30 dias ("Agora não")', null, '/os/candidatos/' || v_a.id);
    v_notnow := v_notnow + 1;
  end loop;
  return jsonb_build_object('sla_warning', v_warn, 'sla_overdue', v_over, 'eligible_reminders', v_eligible, 'not_now_followups', v_notnow);
end $$;

create or replace function rtb.expire_redemptions() returns int
language plpgsql security definer set search_path = '' as $$
declare v_r record; v_n int := 0;
begin
  for v_r in
    select r.*, b.restock_on_expiry from rtb.benefit_redemptions r join rtb.benefits b on b.id = r.benefit_id
    where r.status = 'ISSUED' and r.expires_at < now()
    for update of r skip locked
  loop
    update rtb.benefit_redemptions set status = 'EXPIRED', stock_returned = v_r.restock_on_expiry where id = v_r.id;
    if v_r.restock_on_expiry then
      update rtb.benefits set remaining_quantity = least(remaining_quantity + 1, total_quantity) where id = v_r.benefit_id and remaining_quantity is not null;
    end if;
    insert into rtb.redemption_events (redemption_id, benefit_id, partner_id, user_id, type) values (v_r.id, v_r.benefit_id, v_r.partner_id, v_r.user_id, 'expired');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Fila de e-mails: reserva um lote (SKIP LOCKED: dois workers nunca pegam o mesmo e-mail).
create or replace function rtb.outbox_claim(p_limit int) returns setof rtb.email_outbox
language sql security definer set search_path = '' as $$
  update rtb.email_outbox o set status = 'sending', locked_at = now(), attempts = attempts + 1
  where o.id in (
    select id from rtb.email_outbox
    where (status = 'queued' and next_attempt_at <= now()) or (status = 'sending' and locked_at < now() - interval '10 minutes')
    order by next_attempt_at limit p_limit for update skip locked
  )
  returning o.*;
$$;

-- Resultado do envio. Só vira "accepted" com o id devolvido pelo provedor; falha volta para a fila com espera.
create or replace function rtb.outbox_result(p_id uuid, p_ok boolean, p_provider text, p_provider_id text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_o rtb.email_outbox%rowtype;
begin
  select * into v_o from rtb.email_outbox where id = p_id for update;
  if not found then return; end if;
  if p_ok and p_provider_id is not null then
    update rtb.email_outbox set status = 'accepted', provider = p_provider, provider_message_id = p_provider_id, accepted_at = now(),
      last_error = null, locked_at = null where id = p_id;
  elsif v_o.attempts >= 5 then
    update rtb.email_outbox set status = 'failed', last_error = left(p_error, 500), locked_at = null where id = p_id;
  else
    update rtb.email_outbox set status = 'queued', last_error = left(p_error, 500), locked_at = null,
      next_attempt_at = now() + make_interval(mins => (power(2, v_o.attempts) * 5)::int) where id = p_id;
  end if;
end $$;

create or replace function rtb.outbox_provider_event(p_provider text, p_event_id text, p_provider_message_id text, p_type text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from rtb.email_outbox where provider_message_id = p_provider_message_id;
  insert into rtb.email_delivery_events (outbox_id, provider, provider_event_id, event_type, payload)
  values (v_id, p_provider, p_event_id, p_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider_event_id) do nothing;
  if v_id is null then return; end if;
  if p_type = 'email.delivered' then
    update rtb.email_outbox set status = 'delivered', delivered_at = now() where id = v_id and status in ('accepted', 'sending');
  elsif p_type in ('email.bounced', 'email.complained') then
    update rtb.email_outbox set status = 'bounced', last_error = p_type where id = v_id;
  end if;
end $$;

-- ───────────────────────── Administração ─────────────────────────

-- Acha a conta pelo e-mail para atribuir papel. Só a chave de serviço executa (o servidor confere super_admin antes).
create or replace function rtb.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1
$$;

create or replace function rtb.grant_role(p_user uuid, p_role text, p_scope_polo text, p_partner uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin']); v_id uuid;
begin
  insert into rtb.user_roles (user_id, role, scope_polo, partner_id, granted_by, note)
  values (p_user, p_role, nullif(btrim(p_scope_polo), ''), p_partner, v_uid, nullif(btrim(p_note), ''))
  returning id into v_id;
  perform rtb.append_audit_event('role.granted', 'user_roles', v_id::text, jsonb_build_object('user', p_user, 'role', p_role, 'polo', p_scope_polo, 'partner', p_partner));
  return v_id;
end $$;

create or replace function rtb.revoke_role(p_role_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin']); v_r rtb.user_roles%rowtype;
begin
  select * into v_r from rtb.user_roles where id = p_role_id for update;
  if not found or v_r.revoked_at is not null then raise exception 'role_not_active'; end if;
  if v_r.user_id = v_uid and v_r.role = 'super_admin' and
     (select count(*) from rtb.user_roles where role = 'super_admin' and revoked_at is null) <= 1 then
    raise exception 'last_super_admin';
  end if;
  update rtb.user_roles set revoked_at = now(), revoked_by = v_uid, note = coalesce(nullif(btrim(p_note), ''), note) where id = p_role_id;
  perform rtb.append_audit_event('role.revoked', 'user_roles', p_role_id::text, jsonb_build_object('user', v_r.user_id, 'role', v_r.role));
end $$;

create or replace function rtb.publish_standard_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin']); v_n int;
begin
  select count(*) into v_n from rtb.qualification_standards where version_id = p_version_id;
  if v_n < 11 then raise exception 'standards_incomplete'; end if;
  update rtb.standard_versions set status = 'archived' where status = 'active' and id <> p_version_id;
  update rtb.standard_versions set status = 'active', published_by = v_uid, published_at = now() where id = p_version_id and status = 'draft';
  if not found then raise exception 'version_not_draft'; end if;
  perform rtb.append_audit_event('standards.published', 'standard_versions', p_version_id::text, jsonb_build_object('rows', v_n));
end $$;

create or replace function rtb.handle_data_request(p_id uuid, p_status text, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin']); v_r rtb.data_requests%rowtype;
begin
  select * into v_r from rtb.data_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  update rtb.data_requests set status = p_status, response = nullif(btrim(p_response), ''), handled_by = v_uid, handled_at = now() where id = p_id;
  perform rtb.notify(v_r.user_id, 'lgpd.updated', 'Seu pedido de privacidade foi atualizado', nullif(btrim(p_response), ''), '/passport/configuracoes');
  perform rtb.append_audit_event('lgpd.handled', 'data_requests', p_id::text, jsonb_build_object('status', p_status));
end $$;

-- Exclusão (LGPD): anonimiza o perfil e mantém o histórico técnico e de resgates sem identificação direta.
create or replace function rtb.anonymize_athlete(p_user uuid, p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin']);
begin
  update rtb.profiles set full_name = 'Atleta removido', preferred_name = null, email = 'removido+' || p_user || '@invalid.local',
    phone_e164 = null, cep = null, city = null, avatar_path = null, public_profile = false, ranking_opt_in = false,
    origin_coach = null, category_note = null, deleted_at = now()
  where user_id = p_user;
  delete from rtb.application_health where user_id = p_user;
  update rtb.membership_claims set coach_name = null, support_point = null where user_id = p_user;
  update rtb.email_outbox set status = 'cancelled' where user_id = p_user and status in ('queued', 'sending');
  if p_request_id is not null then
    update rtb.data_requests set status = 'DONE', handled_by = v_uid, handled_at = now(), response = 'Dados pessoais anonimizados.' where id = p_request_id;
  end if;
  perform rtb.append_audit_event('lgpd.anonymized', 'profiles', p_user::text, '{}'::jsonb);
end $$;

-- Equipe por papel (só nome de exibição e id; sem e-mail). Para atribuir treinador e dono de oportunidade.
create or replace function rtb.staff_by_role(p_role text) returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rtb.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select distinct r.user_id, coalesce(sd.display_name, 'Equipe BORA')
  from rtb.user_roles r left join rtb.staff_directory sd on sd.user_id = r.user_id
  where r.role = p_role and r.revoked_at is null
  order by 2;
end $$;

-- ───────────────────────── Indicadores do OS (agregados, sem linhas individuais) ─────────────────────────

create or replace function rtb.os_overview(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth', 'technical_director', 'commercial']);
begin
  return jsonb_build_object(
    'observed', true,
    'visitors_consented', (select count(distinct anon_id) from rtb.analytics_events where name = 'page.view' and created_at between p_from and p_to),
    'simulations', (select count(*) from rtb.index_simulations where created_at between p_from and p_to),
    'signups', (select count(*) from rtb.profiles where created_at between p_from and p_to and deleted_at is null),
    'applications', (select count(*) from rtb.applications where submitted_at between p_from and p_to),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from rtb.applications where submitted_at between p_from and p_to group by status) s),
    'by_prelim', (select coalesce(jsonb_object_agg(prelim_result, n), '{}'::jsonb) from (
        select prelim_result, count(*) n from rtb.applications where submitted_at between p_from and p_to and prelim_result is not null group by prelim_result) s),
    'sla_pending', (select count(*) from rtb.applications where status in ('PRELIM_ALMOST', 'UNDER_REVIEW') and first_contact_at is null and sla_due_at >= now()),
    'sla_overdue', (select count(*) from rtb.applications where status in ('PRELIM_ALMOST', 'UNDER_REVIEW') and first_contact_at is null and sla_due_at < now()),
    'tech_approved', (select count(*) from rtb.technical_decisions where decision = 'APPROVE_ROAD' and created_at between p_from and p_to),
    'next_forwarded', (select count(*) from rtb.technical_decisions where decision = 'FORWARD_NEXT' and created_at between p_from and p_to),
    'journeys_active', (select coalesce(jsonb_object_agg(journey, n), '{}'::jsonb) from (
        select journey, count(*) n from rtb.journey_enrollments where status = 'ACTIVE' group by journey) s),
    'new_enrollments_verified', (select count(*) from rtb.membership_verifications where status = 'ATIVO_CONFIRMADO'
        and previous_status is distinct from 'ATIVO_CONFIRMADO' and created_at between p_from and p_to),
    'members_engaged', (select count(*) from rtb.athlete_states where membership_verified = 'ATIVO_CONFIRMADO'),
    'commercial', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from rtb.commercial_opportunities group by status) s),
    'redemptions', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from rtb.benefit_redemptions where created_at between p_from and p_to group by status) s),
    'benefit_views', (select coalesce(sum(views_count), 0) from rtb.benefits),
    'revenue', null,
    'revenue_note', 'Sem dados financeiros reais conectados: receita não é estimada.'
  );
end $$;

create or replace function rtb.os_funnel(p_from timestamptz, p_to timestamptz, p_dimension text) returns table (
  label text, simulations bigint, signups bigint, applications bigint, eligible bigint, almost bigint, approved bigint, next_forwarded bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := rtb.require_any_role(array['super_admin', 'growth', 'technical_director']);
begin
  if p_dimension not in ('campaign', 'source', 'uf', 'target_race', 'membership', 'polo') then
    raise exception 'invalid_dimension';
  end if;
  return query
  with people as (
    select p.user_id,
      case p_dimension
        when 'campaign' then coalesce((select u.campaign from rtb.utm_attributions u where u.user_id = p.user_id order by u.created_at limit 1), '(direto)')
        when 'source' then coalesce((select u.source from rtb.utm_attributions u where u.user_id = p.user_id order by u.created_at limit 1), '(direto)')
        when 'uf' then coalesce(p.uf, '(sem UF)')
        when 'target_race' then coalesce((select r.name from rtb.applications a join rtb.target_races r on r.id = a.target_race_id where a.user_id = p.user_id limit 1), '(nenhuma)')
        when 'membership' then coalesce(s.membership_declared, 'NAO_INFORMADO')
        when 'polo' then coalesce(s.polo, '(sem polo)')
      end as dim
    from rtb.profiles p left join rtb.athlete_states s on s.user_id = p.user_id
    where p.deleted_at is null and p.created_at between p_from and p_to
  )
  select pe.dim,
    (select count(*) from rtb.index_simulations si where si.user_id in (select pp.user_id from people pp where pp.dim = pe.dim)),
    count(distinct pe.user_id),
    count(distinct a.id) filter (where a.submitted_at is not null),
    count(distinct a.id) filter (where a.prelim_result = 'ELIGIBLE'),
    count(distinct a.id) filter (where a.prelim_result = 'ALMOST'),
    count(distinct d.application_id) filter (where d.decision = 'APPROVE_ROAD'),
    count(distinct d.application_id) filter (where d.decision = 'FORWARD_NEXT')
  from people pe
  left join rtb.applications a on a.user_id = pe.user_id
  left join rtb.technical_decisions d on d.application_id = a.id
  group by pe.dim
  order by count(distinct pe.user_id) desc;
end $$;

commit;
