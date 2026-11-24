-- BORA Road to Boston 2028 · 10 · Plano Elite e datas das provas alvo (24/11/2026)
-- 1) Custo: o Road to Boston é feito no Plano Elite da BORA (Lucas, 24/11). O BORA NEXT segue na mensalidade normal, sem plano separado.
--    Muda o texto da regra comercial, o e-mail de matrícula e os dois avisos da aprovação no Road (função da decisão técnica).
-- 2) Provas alvo com data, informadas pela coordenação técnica (Lucas, 24/11): Lima 23/05/2027, Rio 30/05/2027, Porto Alegre 06/06/2027.
-- Migração aditiva: só atualiza linhas e substitui uma função do schema rtb (mesma assinatura; os grants continuam).

begin;

-- ── Provas alvo ───────────────────────────────────────────────────────────────
update rtb.target_races set race_date = date '2027-05-23', race_date_confirmed = true, status = 'confirmed',
  notes = 'Data informada pela coordenação técnica em 24/11/2026. Conferir o prazo de inscrição na fonte oficial da prova.'
where slug = 'lima-2027';
update rtb.target_races set race_date = date '2027-05-30', race_date_confirmed = true, status = 'confirmed',
  notes = 'Data informada pela coordenação técnica em 24/11/2026. Conferir o prazo de inscrição na fonte oficial da prova.'
where slug = 'rio-2027';
update rtb.target_races set race_date = date '2027-06-06', race_date_confirmed = true, status = 'confirmed',
  notes = 'Data informada pela coordenação técnica em 24/11/2026. Conferir o prazo de inscrição na fonte oficial da prova.'
where slug = 'porto-alegre-2027';

-- ── Calendário público ────────────────────────────────────────────────────────
update rtb.site_content set value = jsonb_set(value, '{items}', '[
     {"key": "campanha", "label": "Campanha e candidaturas", "when": "Novembro de 2026", "status": "em_andamento"},
     {"key": "apresentacao", "label": "Apresentação do projeto", "when": "Dezembro de 2026", "status": "previsto"},
     {"key": "ciclo", "label": "Início do ciclo", "when": "Janeiro de 2027", "status": "previsto"},
     {"key": "teste-3k", "label": "Teste 3 km", "when": "Janeiro de 2027", "status": "previsto"},
     {"key": "teste-5k", "label": "Teste 5 km", "when": "Fevereiro de 2027", "status": "previsto"},
     {"key": "teste-10k", "label": "Teste 10 km", "when": "Março de 2027", "status": "previsto"},
     {"key": "teste-21k", "label": "Teste 21 km", "when": "Abril de 2027", "status": "previsto"},
     {"key": "bora-42k", "label": "Treino/teste BORA 42K", "when": "Maio de 2027", "status": "a_definir"},
     {"key": "prova-lima", "label": "Prova alvo: Maratona de Lima", "when": "23 de maio de 2027", "status": "confirmado"},
     {"key": "prova-rio", "label": "Prova alvo: Maratona do Rio", "when": "30 de maio de 2027", "status": "confirmado"},
     {"key": "prova-poa", "label": "Prova alvo: Maratona de Porto Alegre", "when": "6 de junho de 2027", "status": "confirmado"},
     {"key": "inscricao-baa", "label": "Semana de inscrição Boston 2028 (B.A.A.)", "when": "Setembro de 2027", "status": "oficial_baa"},
     {"key": "boston", "label": "Boston Marathon 2028", "when": "17 de abril de 2028", "status": "oficial_baa"}
   ]'::jsonb), updated_at = now()
where key = 'calendar';

-- ── Regra comercial ───────────────────────────────────────────────────────────
update rtb.program_settings set
  value = '{"member_extra_fee": 0, "next_is_separate_plan": false, "road_requires_elite_plan": true}'::jsonb,
  description = 'O Road to Boston é feito no Plano Elite da BORA (valores e condições com a equipe). O BORA NEXT segue na mensalidade normal, sem plano separado. Candidatura e Boston Passport são gratuitos.',
  updated_at = now()
where key = 'commercial';

-- ── E-mail de matrícula (serve para Road e NEXT) ───────────────────────────────
update rtb.message_templates set
  body = 'Olá, {{first_name}}.\n\nPara seguir em {{journey}}, o próximo passo é a sua matrícula na BORA. O Road to Boston é feito no Plano Elite; o BORA NEXT, na mensalidade normal. A equipe entra em contato com valores e condições.\n\nAssim que a matrícula for confirmada pela equipe, sua jornada é liberada no Passport.',
  updated_at = now()
where key = 'enrollment_guidance';

-- ── Avisos da aprovação no Road (função da decisão técnica) ─────────────────────
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
        'O treino do Road to Boston é feito no Plano Elite da BORA. A equipe confirma com você o seu plano antes do início do ciclo.', '/passport/jornada');
      perform rtb.queue_email(v_app.user_id, 'cycle_joined', jsonb_build_object('first_name', v_first, 'journey', 'Road to Boston 2028'), 'cycle_joined:' || v_dec.id);
    else
      insert into rtb.commercial_opportunities (user_id, application_id, origin)
      values (v_app.user_id, v_app.id, 'ROAD_APPROVED_NON_MEMBER') on conflict do nothing;
      perform rtb.notify_role('commercial', 'commercial.new', 'Nova oportunidade: aprovado técnico sem matrícula', null, '/os/comercial');
      perform rtb.notify(v_app.user_id, 'journey.road_pending_enrollment', 'Aprovação técnica: falta a matrícula',
        'Para começar o ciclo, faça sua matrícula na BORA no Plano Elite. A equipe entra em contato com valores e condições.', '/passport/jornada');
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

commit;
