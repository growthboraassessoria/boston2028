-- ⚠️ DADOS DE DEMONSTRAÇÃO · SÓ DESENVOLVIMENTO LOCAL
-- Todas as contas usam @rtb.local (domínio inexistente). Parceiros e benefícios são fictícios e marcados is_demo.
-- Os atletas passam pelas funções reais (cadastro, candidatura, decisão técnica, vínculo), como em produção.
-- Recusa rodar se encontrar dado que não seja de demonstração.

do $$
begin
  if exists (select 1 from rtb.profiles where email::text not like '%@rtb.local') then
    raise exception 'seed recusado: há perfis reais neste banco';
  end if;
end $$;

-- Equipe (um papel por conta). Login local: e-mail + código mostrado na tela.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-a000-000000000001', 'admin@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000002', 'coordenacao@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000003', 'treinador@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000004', 'comercial@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000005', 'vinculo@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000006', 'growth@rtb.local', now()),
  ('00000000-0000-4000-a000-000000000007', 'parceiro@rtb.local', now())
on conflict do nothing;

insert into rtb.staff_directory (user_id, display_name, title, polo) values
  ('00000000-0000-4000-a000-000000000001', 'Admin (demo)', 'Administração', null),
  ('00000000-0000-4000-a000-000000000002', 'Coordenação técnica (demo)', 'Coordenador técnico', null),
  ('00000000-0000-4000-a000-000000000003', 'Treinador (demo)', 'Treinador', 'DF'),
  ('00000000-0000-4000-a000-000000000004', 'Comercial (demo)', 'Comercial', null),
  ('00000000-0000-4000-a000-000000000005', 'Vínculo (demo)', 'Verificação de matrícula', null),
  ('00000000-0000-4000-a000-000000000006', 'Growth (demo)', 'Growth', null),
  ('00000000-0000-4000-a000-000000000007', 'Parceiro (demo)', 'Operador de parceiro', null)
on conflict do nothing;

insert into rtb.partners (id, slug, name, description, category, status, is_demo, brand_authorized) values
  ('00000000-0000-4000-b000-000000000001', 'loja-tenis-exemplo', 'Loja de Tênis Exemplo (demonstração)', 'Parceiro fictício para testes.', 'equipment', 'ACTIVE', true, false),
  ('00000000-0000-4000-b000-000000000002', 'fisio-exemplo', 'Fisioterapia Exemplo (demonstração)', 'Parceiro fictício para testes.', 'health_assessment', 'ACTIVE', true, false),
  ('00000000-0000-4000-b000-000000000003', 'avaliacao-exemplo', 'Avaliação Esportiva Exemplo (demonstração)', 'Parceiro fictício para testes.', 'health_assessment', 'ACTIVE', true, false)
on conflict do nothing;

insert into rtb.user_roles (user_id, role, partner_id, note) values
  ('00000000-0000-4000-a000-000000000001', 'super_admin', null, 'seed demo'),
  ('00000000-0000-4000-a000-000000000002', 'technical_director', null, 'seed demo (no real: atribuir à conta do Lucas)'),
  ('00000000-0000-4000-a000-000000000003', 'coach', null, 'seed demo'),
  ('00000000-0000-4000-a000-000000000004', 'commercial', null, 'seed demo'),
  ('00000000-0000-4000-a000-000000000005', 'membership_verifier', null, 'seed demo'),
  ('00000000-0000-4000-a000-000000000006', 'growth', null, 'seed demo'),
  ('00000000-0000-4000-a000-000000000007', 'partner_operator', '00000000-0000-4000-b000-000000000001', 'seed demo')
on conflict do nothing;

insert into rtb.benefits (id, partner_id, slug, title, summary, description, rules, category, journey_scope, requires_active_member,
  total_quantity, remaining_quantity, per_member_limit, mode, status, visibility, is_demo, redemption_instructions, terms, code_ttl_hours) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-b000-000000000001', 'demo-tenis-10', '10% em tênis de corrida (demonstração)',
   'Desconto fictício para testar o resgate com QR.', 'Benefício de demonstração. Não é real.', 'Um uso por pessoa. Válido por 30 dias após o resgate.',
   'equipment', 'ANY', true, 25, 25, 1, 'QR_VALIDATION', 'ACTIVE', 'VISIBLE', true,
   'Mostre o QR no caixa do parceiro.', 'Demonstração sem valor comercial.', 720),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-000000000002', 'demo-avaliacao-fisio', 'Avaliação de fisioterapia (demonstração)',
   'Avaliação fictícia, só para aprovados no Road to Boston.', 'Benefício de demonstração. Não é real.', 'Exclusivo Road to Boston. Uma avaliação por pessoa.',
   'health_assessment', 'ROAD', true, 5, 5, 1, 'ONE_TIME_CODE', 'ACTIVE', 'VISIBLE_LOCKED', true,
   'Agende pelo telefone do parceiro informando o código.', 'Demonstração sem valor comercial.', 720),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-b000-000000000003', 'demo-avaliacao-esportiva', 'Consulta de avaliação esportiva (demonstração)',
   'Resgate com aprovação da equipe BORA.', 'Benefício de demonstração. Não é real.', 'Aprovação manual pela equipe.',
   'health_assessment', 'BOTH', true, 10, 10, 1, 'MANUAL_APPROVAL', 'ACTIVE', 'VISIBLE', true,
   'A equipe aprova e o código aparece em Resgates.', 'Demonstração sem valor comercial.', 720)
on conflict do nothing;

insert into rtb.campaigns (slug, name, utm_campaign, active) values ('rtb-lancamento-demo', 'Lançamento RTB (demo)', 'rtb_lancamento', true) on conflict do nothing;

-- Atletas de demonstração, cada um num estado da jornada.
do $$
declare
  v_race uuid := (select id from rtb.target_races where slug = 'rio-2027');
  v_lucas constant uuid := '00000000-0000-4000-a000-000000000002';
  v_verif constant uuid := '00000000-0000-4000-a000-000000000005';
  v_coach constant uuid := '00000000-0000-4000-a000-000000000003';
  r record;
  v_uid uuid;
  v_app jsonb;
  v_enroll uuid;
  v_n int := 0;
begin
  for r in select * from (values
    ('ana.elegivel@rtb.local',   'Ana Paula Moreira',   '1991-03-14', 'F', 'SIM_ATUAL', 12300 + 600, false, true,  'ELIGIBLE_VERIFIED'),
    ('bruno.quase@rtb.local',    'Bruno Henrique Lima', '1986-11-02', 'M', 'NAO',       11100 + 1140, false, true, 'ALMOST'),
    ('carla.quase2@rtb.local',   'Carla Nunes Rocha',   '1979-07-21', 'F', 'SIM_ATUAL', 13500 + 1500, false, true, 'ALMOST_MEMBER'),
    ('diego.lesao@rtb.local',    'Diego Souza Prado',   '1994-01-30', 'M', 'SIM_ATUAL', 10500 + 200, true,  true,  'NOT_NOW'),
    ('elisa.road@rtb.local',     'Elisa Martins Paiva', '1983-05-09', 'F', 'SIM_ATUAL', 12900 - 120, false, true,  'ROAD_MEMBER'),
    ('fabio.next@rtb.local',     'Fábio Teixeira Melo', '1975-09-17', 'M', 'SIM_ATUAL', 11700 + 1700, false, true, 'NEXT_OFFERED'),
    ('gabi.naoaluna@rtb.local',  'Gabriela Antunes',    '1998-12-05', 'F', 'NAO',       12300 + 400, false, true,  'ROAD_PENDING'),
    ('hugo.info@rtb.local',      'Hugo Vieira Campos',  '1989-02-11', 'M', 'EX_ALUNO',  10800 + 1000, false, false, 'NEEDS_INFO')
  ) as t(email, name, birth, cat, member, seconds, injury, sessions, scenario)
  loop
    v_n := v_n + 1;
    insert into auth.users (email, email_confirmed_at) values (r.email, now()) returning id into v_uid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform rtb.save_my_profile(jsonb_build_object('full_name', r.name, 'birth_date', r.birth, 'reference_category', r.cat,
      'phone_e164', '+55619900000' || lpad(v_n::text, 2, '0'), 'city', 'Brasília', 'uf', 'DF', 'cep', '70000000'));
    perform rtb.save_membership_claim(r.member, case when r.member = 'SIM_ATUAL' then 'Treinador (demo)' end, case when r.member = 'SIM_ATUAL' then 'Parque da Cidade' end, false);
    perform rtb.record_consents('[{"purpose":"terms","granted":true},{"purpose":"privacy","granted":true},{"purpose":"health_data","granted":true}]'::jsonb, 'demo');
    v_app := rtb.submit_application(jsonb_build_object('target_choice', 'RACE', 'target_race_id', v_race, 'has_mark', true,
      'mark_distance', 'MARATHON', 'mark_seconds', r.seconds, 'mark_date', (current_date - 70)::text, 'mark_race_name', 'Maratona exemplo',
      'sessions_4plus', r.sessions, 'injury_in_treatment', r.injury), 'seeddemo' || replace(v_uid::text, '-', ''));

    if r.member = 'SIM_ATUAL' and r.scenario in ('ELIGIBLE_VERIFIED', 'ALMOST_MEMBER', 'ROAD_MEMBER', 'NEXT_OFFERED') then
      perform set_config('request.jwt.claims', json_build_object('sub', v_verif, 'role', 'authenticated')::text, true);
      perform rtb.verify_member_link(v_uid, 'ATIVO_CONFIRMADO', 'manual', 'Seed: conferido na planilha da unidade (demo)', null);
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_lucas, 'role', 'authenticated')::text, true);
    if r.scenario = 'ROAD_MEMBER' then
      perform rtb.record_technical_decision((v_app ->> 'application_id')::uuid, 'APPROVE_ROAD', 'Marca dentro do índice e rotina consistente (demo).',
        'Primeira conversa com o treinador na próxima semana.', null, 'Bem-vinda ao ciclo! Vamos com calma no primeiro mês.', 'seeddecision' || v_n || 'aaaaaaaaaaaa');
      perform rtb.assign_coach(v_uid, v_coach);
    elsif r.scenario = 'NEXT_OFFERED' then
      perform rtb.record_technical_decision((v_app ->> 'application_id')::uuid, 'FORWARD_NEXT', 'Marca 28 min acima do índice; potencial com base aeróbica (demo).',
        'Montar metas de 12 semanas com o treinador.', null, null, 'seeddecision' || v_n || 'aaaaaaaaaaaa');
    elsif r.scenario = 'ROAD_PENDING' then
      perform rtb.record_technical_decision((v_app ->> 'application_id')::uuid, 'APPROVE_ROAD', 'Elegível e sem restrições (demo).',
        'Comercial orienta a matrícula.', null, null, 'seeddecision' || v_n || 'aaaaaaaaaaaa');
    elsif r.scenario = 'NEEDS_INFO' then
      perform rtb.record_technical_decision((v_app ->> 'application_id')::uuid, 'REQUEST_INFO', 'Confirmar a frequência de treinos (demo).',
        'Aguardar resposta do atleta.', null, 'Quantos treinos por semana você fez nos últimos 2 meses?', 'seeddecision' || v_n || 'aaaaaaaaaaaa');
    end if;
  end loop;
end $$;

select 'seed de demonstração aplicado' as ok;
