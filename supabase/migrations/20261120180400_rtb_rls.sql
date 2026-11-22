-- BORA Road to Boston 2028 · 5/8 · RLS em TODAS as tabelas, grants mínimos e auditoria de cadastros
-- Regra: atleta só vê o que é dele; equipe vê por papel (e por atribuição/escopo); escrita sensível só por função.
-- O servidor executa as consultas como o próprio usuário (role authenticated + claims verificados), então o RLS sempre vale.

begin;

-- ───────────────────────── RLS ligado em tudo ─────────────────────────
-- Sem FORCE: o dono das tabelas (quem roda as migrations) é também o dono das funções SECURITY DEFINER,
-- que fazem as próprias checagens de auth.uid() e papel. anon e authenticated ficam sempre sob RLS.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'rtb' loop
    execute format('alter table rtb.%I enable row level security', t.tablename);
  end loop;
end $$;

-- service_role (servidor/cron) e o dono das funções ignoram o RLS; anon e authenticated nunca.
revoke all on all tables in schema rtb from anon, authenticated;
revoke all on all sequences in schema rtb from anon, authenticated;
grant all on all tables in schema rtb to service_role;
grant usage, select on all sequences in schema rtb to service_role;

-- Leitura (o RLS filtra as linhas). Tabelas sem política para o papel = nada visível.
grant select on all tables in schema rtb to authenticated;
revoke select on rtb.rate_limits, rtb.analytics_events from authenticated;

-- Escrita direta só onde o formulário do OS edita cadastro (com auditoria por gatilho).
grant insert, update on rtb.program_settings, rtb.feature_flags, rtb.target_races, rtb.business_holidays,
  rtb.site_content, rtb.media_assets, rtb.campaigns, rtb.referral_sources, rtb.message_templates, rtb.tests,
  rtb.badge_definitions, rtb.partners, rtb.partner_brand_permissions, rtb.benefits, rtb.benefit_secrets,
  rtb.staff_directory, rtb.program_cycles, rtb.standard_versions, rtb.qualification_standards to authenticated;
grant delete on rtb.business_holidays, rtb.qualification_standards, rtb.partner_brand_permissions to authenticated;

-- ───────────────────────── Helpers de política ─────────────────────────
-- (select …) em volta das funções faz o Postgres avaliar uma vez por consulta (initPlan).

-- Configuração e conteúdo
create policy cfg_read on rtb.program_cycles for select to authenticated using (true);
create policy cfg_write on rtb.program_cycles for all to authenticated
  using ((select rtb.has_role('super_admin'))) with check ((select rtb.has_role('super_admin')));

create policy settings_read on rtb.program_settings for select to authenticated using ((select rtb.is_staff()));
create policy settings_write on rtb.program_settings for all to authenticated
  using ((select rtb.has_role('super_admin')) or ((select rtb.has_role('technical_director')) and split_part(key, '.', 1) in ('internal_rule', 'ranking', 'next', 'sla')))
  with check ((select rtb.has_role('super_admin')) or ((select rtb.has_role('technical_director')) and split_part(key, '.', 1) in ('internal_rule', 'ranking', 'next', 'sla')));

create policy flags_read on rtb.feature_flags for select to authenticated using ((select rtb.is_staff()));
create policy flags_write on rtb.feature_flags for all to authenticated
  using ((select rtb.has_role('super_admin'))) with check ((select rtb.has_role('super_admin')));

create policy std_versions_read on rtb.standard_versions for select to authenticated using (true);
create policy std_versions_write on rtb.standard_versions for insert to authenticated
  with check ((select rtb.has_role('super_admin')) and status = 'draft');
create policy std_versions_update on rtb.standard_versions for update to authenticated
  using ((select rtb.has_role('super_admin')) and status = 'draft') with check ((select rtb.has_role('super_admin')) and status = 'draft');
create policy std_read on rtb.qualification_standards for select to authenticated using (true);
create policy std_write on rtb.qualification_standards for all to authenticated
  using ((select rtb.has_role('super_admin'))) with check ((select rtb.has_role('super_admin')));

create policy races_read on rtb.target_races for select to authenticated using (true);
create policy races_write on rtb.target_races for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director']))) with check ((select rtb.has_any_role(array['super_admin', 'technical_director'])));

create policy holidays_read on rtb.business_holidays for select to authenticated using (true);
create policy holidays_write on rtb.business_holidays for all to authenticated
  using ((select rtb.has_role('super_admin'))) with check ((select rtb.has_role('super_admin')));

create policy content_read on rtb.site_content for select to authenticated using (status = 'published' or (select rtb.is_staff()));
create policy content_write on rtb.site_content for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));

create policy media_read on rtb.media_assets for select to authenticated using (approved or (select rtb.has_any_role(array['super_admin', 'growth'])));
create policy media_write on rtb.media_assets for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));

create policy campaigns_rw on rtb.campaigns for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy referral_rw on rtb.referral_sources for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy utm_read on rtb.utm_attributions for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'growth'])));

-- Identidade
create policy profiles_read on rtb.profiles for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));

create policy staff_dir_read on rtb.staff_directory for select to authenticated using (active or (select rtb.has_role('super_admin')));
create policy staff_dir_write on rtb.staff_directory for all to authenticated
  using ((select rtb.has_role('super_admin'))) with check ((select rtb.has_role('super_admin')));

create policy roles_read on rtb.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_role('super_admin')));

create policy states_read on rtb.athlete_states for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));

-- Vínculo
create policy claims_read on rtb.membership_claims for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));
create policy verifications_read on rtb.membership_verifications for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director'])) or
         ((select rtb.has_role('membership_verifier')) and rtb.can_see_athlete(user_id)));
create policy ext_links_read on rtb.external_member_links for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'membership_verifier'])));
create policy sync_runs_read on rtb.sync_runs for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'membership_verifier'])));

-- LGPD
create policy consents_read on rtb.consents for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_role('super_admin')));
create policy data_requests_read on rtb.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_role('super_admin')));

-- Auditoria: só super_admin lê. Ninguém edita (gatilho bloqueia até o dono).
create policy audit_read on rtb.audit_logs for select to authenticated using ((select rtb.has_role('super_admin')));

-- Simulações
create policy simulations_read on rtb.index_simulations for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'growth', 'technical_director'])));

-- Candidatura
create policy applications_read on rtb.applications for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));
create policy marks_read on rtb.performance_marks for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'technical_director'])) or rtb.is_assigned_coach(user_id));
-- Saúde: dono e coordenação técnica. Nem comercial, nem verificador, nem super_admin.
create policy health_read on rtb.application_health for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_role('technical_director')));
create policy answers_read on rtb.application_answers for select to authenticated
  using (exists (select 1 from rtb.applications a where a.id = application_id and (a.user_id = (select auth.uid()) or rtb.can_see_athlete(a.user_id))));
create policy documents_read on rtb.application_documents for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'technical_director'])) or rtb.is_assigned_coach(user_id));

create policy reviews_read on rtb.technical_reviews for select to authenticated
  using (exists (select 1 from rtb.applications a where a.id = application_id and rtb.can_coach_athlete(a.user_id)));
create policy decisions_read on rtb.technical_decisions for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director'])) or rtb.is_assigned_coach(user_id));
create policy info_requests_read on rtb.info_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'technical_director'])) or rtb.is_assigned_coach(user_id));
create policy contacts_read on rtb.contact_attempts for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director'])) or rtb.is_assigned_coach(user_id)
         or ((select rtb.has_role('commercial')) and rtb.can_see_athlete(user_id)));
create policy events_read on rtb.application_events for select to authenticated
  using ((user_id = (select auth.uid()) and visibility = 'athlete') or rtb.can_see_athlete(user_id));

-- Jornadas
create policy journeys_read on rtb.journey_enrollments for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));
create policy coach_assign_read on rtb.athlete_coach_assignments for select to authenticated
  using (athlete_id = (select auth.uid()) or coach_user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'technical_director'])));
-- Metas exclusivas: o próprio atleta só vê com matrícula ativa confirmada.
create policy goals_read on rtb.training_goals for select to authenticated
  using (
    (user_id = (select auth.uid()) and exists (
      select 1 from rtb.athlete_states s where s.user_id = (select auth.uid()) and s.access_status = 'ACTIVE_MEMBER'))
    or rtb.can_coach_athlete(user_id) or (select rtb.has_role('super_admin'))
  );
create policy reassessments_read on rtb.reassessments for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_see_athlete(user_id));

-- Testes e gamificação
create policy tests_read on rtb.tests for select to authenticated using (true);
create policy tests_write on rtb.tests for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director']))) with check ((select rtb.has_any_role(array['super_admin', 'technical_director'])));
create policy results_read on rtb.test_results for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_coach_athlete(user_id) or (select rtb.has_role('super_admin')));
create policy badges_read on rtb.badge_definitions for select to authenticated using (true);
create policy badges_write on rtb.badge_definitions for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'technical_director']))) with check ((select rtb.has_any_role(array['super_admin', 'technical_director'])));
create policy earned_read on rtb.earned_badges for select to authenticated
  using (user_id = (select auth.uid()) or rtb.can_coach_athlete(user_id) or (select rtb.has_role('super_admin')));

-- Comercial (sem acesso a saúde nem documentos)
create policy commercial_read on rtb.commercial_opportunities for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'commercial', 'technical_director'])));
create policy commercial_act_read on rtb.commercial_activities for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'commercial'])));
create policy subscriptions_read on rtb.subscription_links for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'commercial', 'membership_verifier'])));

-- Comunicação
create policy templates_read on rtb.message_templates for select to authenticated using ((select rtb.is_staff()));
create policy templates_write on rtb.message_templates for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy notifications_read on rtb.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy outbox_read on rtb.email_outbox for select to authenticated using ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy delivery_read on rtb.email_delivery_events for select to authenticated using ((select rtb.has_any_role(array['super_admin', 'growth'])));

-- Parceiros e benefícios: atleta lê pela vitrine (função), nunca a tabela. Operador do parceiro vê só o dele.
create policy partners_read on rtb.partners for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth'])) or exists (
    select 1 from rtb.user_roles r where r.user_id = (select auth.uid()) and r.role = 'partner_operator' and r.partner_id = partners.id and r.revoked_at is null));
create policy partners_write on rtb.partners for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy brand_perm_rw on rtb.partner_brand_permissions for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy benefits_read on rtb.benefits for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth'])) or exists (
    select 1 from rtb.user_roles r where r.user_id = (select auth.uid()) and r.role = 'partner_operator' and r.partner_id = benefits.partner_id and r.revoked_at is null));
create policy benefits_write on rtb.benefits for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy secrets_rw on rtb.benefit_secrets for all to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth']))) with check ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy codes_read on rtb.benefit_codes for select to authenticated
  using ((select rtb.has_any_role(array['super_admin', 'growth'])));
create policy redemptions_read on rtb.benefit_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'growth'])) or exists (
    select 1 from rtb.user_roles r where r.user_id = (select auth.uid()) and r.role = 'partner_operator' and r.partner_id = benefit_redemptions.partner_id and r.revoked_at is null));
create policy redemption_secrets_read on rtb.redemption_secrets for select to authenticated using (user_id = (select auth.uid()));
create policy redemption_events_read on rtb.redemption_events for select to authenticated
  using (user_id = (select auth.uid()) or (select rtb.has_any_role(array['super_admin', 'growth'])) or exists (
    select 1 from rtb.user_roles r where r.user_id = (select auth.uid()) and r.role = 'partner_operator' and r.partner_id = redemption_events.partner_id and r.revoked_at is null));

-- ───────────────────────── Auditoria automática de cadastros editados no OS ─────────────────────────
create trigger audit_program_settings after insert or update or delete on rtb.program_settings for each row execute function rtb.audit_row_change('with_values');
create trigger audit_feature_flags after insert or update or delete on rtb.feature_flags for each row execute function rtb.audit_row_change('with_values');
create trigger audit_target_races after insert or update or delete on rtb.target_races for each row execute function rtb.audit_row_change('with_values');
create trigger audit_program_cycles after insert or update or delete on rtb.program_cycles for each row execute function rtb.audit_row_change('with_values');
create trigger audit_standard_versions after insert or update or delete on rtb.standard_versions for each row execute function rtb.audit_row_change('with_values');
create trigger audit_site_content after insert or update or delete on rtb.site_content for each row execute function rtb.audit_row_change();
create trigger audit_media_assets after insert or update or delete on rtb.media_assets for each row execute function rtb.audit_row_change();
create trigger audit_message_templates after insert or update or delete on rtb.message_templates for each row execute function rtb.audit_row_change();
create trigger audit_partners after insert or update or delete on rtb.partners for each row execute function rtb.audit_row_change();
create trigger audit_brand_permissions after insert or update or delete on rtb.partner_brand_permissions for each row execute function rtb.audit_row_change();
create trigger audit_benefits after insert or update or delete on rtb.benefits for each row execute function rtb.audit_row_change();
create trigger audit_benefit_secrets after insert or update or delete on rtb.benefit_secrets for each row execute function rtb.audit_row_change();
create trigger audit_tests after insert or update or delete on rtb.tests for each row execute function rtb.audit_row_change('with_values');
create trigger audit_staff_directory after insert or update or delete on rtb.staff_directory for each row execute function rtb.audit_row_change();
create trigger audit_business_holidays after insert or update or delete on rtb.business_holidays for each row execute function rtb.audit_row_change('with_values');

-- ───────────────────────── Funções: quem executa o quê ─────────────────────────
revoke execute on all functions in schema rtb from public, anon, authenticated;

-- Helpers usados dentro das políticas (o RLS roda com os privilégios de quem consulta) e leituras neutras do app.
grant execute on function
  rtb.has_role(text), rtb.has_any_role(text[]), rtb.is_staff(), rtb.role_allows_polo(text, text),
  rtb.can_see_athlete(uuid), rtb.is_assigned_coach(uuid), rtb.can_coach_athlete(uuid),
  rtb.current_cycle_id(), rtb.active_standard_version()
to authenticated;

-- Atleta
grant execute on function
  rtb.save_my_profile(jsonb), rtb.save_membership_claim(text, text, text, boolean), rtb.record_consents(jsonb, text),
  rtb.set_my_avatar(text), rtb.request_data(text, text), rtb.mark_notifications_read(uuid[]),
  rtb.submit_application(jsonb, text), rtb.withdraw_application(uuid, text), rtb.respond_info_request(uuid, text, uuid),
  rtb.accept_journey(uuid), rtb.decline_journey(uuid, text), rtb.submit_test_result(uuid, int, uuid),
  rtb.claim_benefit(uuid, text, boolean), rtb.my_benefit_catalog(), rtb.my_benefit_detail(text), rtb.track_benefit_view(uuid),
  rtb.claim_simulations(text), rtb.benefit_eligibility(uuid, uuid),
  rtb.add_my_document(uuid, text, text, text, int, text), rtb.my_redemptions()
to authenticated;

-- Equipe (cada função confere o papel por dentro)
grant execute on function
  rtb.start_review(uuid), rtb.add_review_note(uuid, text), rtb.record_contact_attempt(uuid, text, text, text),
  rtb.record_technical_decision(uuid, text, text, text, date, text, text),
  rtb.verify_member_link(uuid, text, text, text, text), rtb.set_athlete_polo(uuid, text), rtb.set_automations_paused(uuid, boolean),
  rtb.assign_coach(uuid, uuid), rtb.save_training_goal(uuid, uuid, jsonb), rtb.schedule_reassessment(uuid, uuid, date, text),
  rtb.validate_test_result(uuid, text, text), rtb.award_badge(uuid, text, text, text),
  rtb.update_opportunity(uuid, text, uuid, text, date, text, text),
  rtb.validate_redemption(text, text, uuid, text), rtb.approve_manual_redemption(uuid, text), rtb.cancel_redemption(uuid, text, boolean),
  rtb.load_benefit_codes(uuid, text[]), rtb.duplicate_benefit(uuid),
  rtb.grant_role(uuid, text, text, uuid, text), rtb.revoke_role(uuid, text), rtb.publish_standard_version(uuid),
  rtb.handle_data_request(uuid, text, text), rtb.anonymize_athlete(uuid, uuid),
  rtb.os_overview(timestamptz, timestamptz), rtb.os_funnel(timestamptz, timestamptz, text),
  rtb.staff_by_role(text)
to authenticated;

-- Rotinas do servidor (cron, fila de e-mail, simulação anônima, limite por IP)
grant execute on all functions in schema rtb to service_role;

commit;
