-- BORA Road to Boston 2028 · 8/8 · dados de referência (valem em produção; nada de demonstração aqui)
-- Fonte dos índices: https://www.baa.org/races/boston-marathon/qualify/ (consultada em 20/11/2026).
-- Datas de provas, testes e prazos entram como "a confirmar": nunca como confirmadas sem fonte.

begin;

-- ───────────────────────── Índices oficiais 2027 & 2028 ─────────────────────────
with v as (
  insert into rtb.standard_versions (label, applies_to_years, race_date, min_age, source_url, source_title, consulted_at, notes, status)
  values (
    'B.A.A. · Índices 2027 & 2028', array[2027, 2028], date '2028-04-17', 18,
    'https://www.baa.org/races/boston-marathon/qualify/',
    'Boston Athletic Association · Qualify (2027 & 2028 Boston Marathon Qualifying Standards)',
    timestamptz '2026-11-20 15:40:00-03',
    'Mesmos índices de 2026 para 2027 e 2028 (anúncio B.A.A. de 22/07/2026). Idade no dia da prova: 17/04/2028. '
    || 'Janela de qualificação de 2028 aberta em 19/09/2026, até a semana de inscrição de setembro de 2027. '
    || 'Atingir o índice não garante inscrição: em 2027 o corte foi de 5min17s abaixo do índice. '
    || 'Só maratona certificada, tempo líquido (chip). Ajustes de declive (net-downhill) podem mudar para 2028. '
    || 'Para-atletas: regras próprias da B.A.A., sempre com encaminhamento humano.',
    'draft'
  )
  returning id
)
insert into rtb.qualification_standards (version_id, category, age_min, age_max, standard_seconds)
select v.id, x.category, x.age_min, x.age_max, x.seconds
from v, (values
  ('M', 18, 34, 10500), ('F', 18, 34, 12300), ('X', 18, 34, 12300),
  ('M', 35, 39, 10800), ('F', 35, 39, 12600), ('X', 35, 39, 12600),
  ('M', 40, 44, 11100), ('F', 40, 44, 12900), ('X', 40, 44, 12900),
  ('M', 45, 49, 11700), ('F', 45, 49, 13500), ('X', 45, 49, 13500),
  ('M', 50, 54, 12000), ('F', 50, 54, 13800), ('X', 50, 54, 13800),
  ('M', 55, 59, 12600), ('F', 55, 59, 14400), ('X', 55, 59, 14400),
  ('M', 60, 64, 13800), ('F', 60, 64, 15600), ('X', 60, 64, 15600),
  ('M', 65, 69, 14700), ('F', 65, 69, 16500), ('X', 65, 69, 16500),
  ('M', 70, 74, 15600), ('F', 70, 74, 17400), ('X', 70, 74, 17400),
  ('M', 75, 79, 16500), ('F', 75, 79, 18300), ('X', 75, 79, 18300),
  ('M', 80, null, 17400), ('F', 80, null, 19200), ('X', 80, null, 19200)
) as x(category, age_min, age_max, seconds);

update rtb.standard_versions set status = 'active', published_at = now() where label = 'B.A.A. · Índices 2027 & 2028' and status = 'draft';

-- ───────────────────────── Ciclo, provas alvo e testes ─────────────────────────
insert into rtb.program_cycles (slug, name, boston_year, status, is_current)
values ('rtb-2028', 'Road to Boston 2028', 2028, 'open', true)
on conflict (slug) do nothing;

insert into rtb.target_races (slug, name, city, country, status, sort_order, notes) values
  ('lima-2027', 'Maratona de Lima 2027', 'Lima', 'PE', 'provisional', 1,
   'Nome oficial, data e prazo de inscrição a confirmar na fonte oficial da prova. Conferir regra de 16 semanas.'),
  ('rio-2027', 'Maratona do Rio 2027', 'Rio de Janeiro', 'BR', 'provisional', 2,
   'Nome oficial, data e prazo de inscrição a confirmar na fonte oficial da prova. Conferir regra de 16 semanas.'),
  ('porto-alegre-2027', 'Maratona de Porto Alegre 2027', 'Porto Alegre', 'BR', 'provisional', 3,
   'Nome oficial, data e prazo de inscrição a confirmar na fonte oficial da prova. Conferir regra de 16 semanas.')
on conflict (slug) do nothing;

insert into rtb.badge_definitions (slug, name, description, kind, icon) values
  ('passaporte-emitido', 'Passaporte emitido', 'Seu Boston Passport foi emitido. A jornada começa aqui.', 'stamp', 'passport'),
  ('candidatura-enviada', 'Candidatura enviada', 'Você enviou a candidatura ao Road to Boston 2028.', 'stamp', 'send'),
  ('road-to-boston', 'Road to Boston 2028', 'Aprovação técnica e entrada no ciclo Road to Boston 2028.', 'seal', 'seal'),
  ('bora-next', 'BORA NEXT', 'Entrada no BORA NEXT, o caminho de desenvolvimento da BORA.', 'seal', 'seal'),
  ('teste-3k', 'Teste 3 km', 'Teste mensal de 3 km validado pela equipe técnica.', 'stamp', 'stopwatch'),
  ('teste-5k', 'Teste 5 km', 'Teste mensal de 5 km validado pela equipe técnica.', 'stamp', 'stopwatch'),
  ('teste-10k', 'Teste 10 km', 'Teste mensal de 10 km validado pela equipe técnica.', 'stamp', 'stopwatch'),
  ('teste-21k', 'Teste 21 km', 'Teste de meia maratona validado pela equipe técnica.', 'stamp', 'stopwatch'),
  ('bora-42k', 'BORA 42K', 'Treino/teste BORA 42K (formato a definir pela coordenação).', 'milestone', 'flag')
on conflict (slug) do nothing;

insert into rtb.tests (cycle_id, slug, name, distance_m, planned_month, format_note, badge_slug, status)
select c.id, x.slug, x.name, x.distance_m, x.planned_month, x.note, x.badge, 'planned'
from rtb.program_cycles c, (values
  ('jan-3k', 'Teste de janeiro · 3 km', 3000, date '2027-01-01', 'Mês previsto no plano original. Data a confirmar.', 'teste-3k'),
  ('fev-5k', 'Teste de fevereiro · 5 km', 5000, date '2027-02-01', 'Mês previsto no plano original. Data a confirmar.', 'teste-5k'),
  ('mar-10k', 'Teste de março · 10 km', 10000, date '2027-03-01', 'Mês previsto no plano original. Data a confirmar.', 'teste-10k'),
  ('abr-21k', 'Teste de abril · 21 km', 21097, date '2027-04-01', 'Mês previsto no plano original. Data a confirmar.', 'teste-21k'),
  ('mai-42k', 'Maio · treino/teste BORA 42K', 42195, date '2027-05-01', 'Formato a definir pela coordenação técnica.', 'bora-42k')
) as x(slug, name, distance_m, planned_month, note, badge)
where c.slug = 'rtb-2028'
on conflict (cycle_id, slug) do nothing;

-- ───────────────────────── Regras configuráveis ─────────────────────────
insert into rtb.program_settings (key, value, status, description) values
  ('internal_rule', '{"marathon_margin_seconds": 900, "half_margin_seconds": 300, "min_weekly_sessions": 4}', 'approved',
   'Régua interna BORA (não é a qualificação oficial): maratona até 15 min acima do índice ou meia ×2 até 5 min acima; mínimo de 4 treinos por semana.'),
  ('internal_rule.recency', '{"recent_mark_months": 18}', 'proposed',
   'Janela de "marca recente" usada na triagem. Proposta do sistema: 18 meses. Confirmar com o Lucas.'),
  ('sla', '{"almost_business_days": 3, "skip_optional_holidays": true, "timezone": "America/Sao_Paulo"}', 'approved',
   'Contato com "Quase lá" em até 3 dias úteis. Pontos facultativos contam como dia não útil (proposta).'),
  ('next', '{"reassessment_days": 90}', 'proposed',
   'Reavaliação sugerida do BORA NEXT (proposta de 90 dias). O treinador pode definir outra data.'),
  ('ranking', '{"riegel_exponent": 1.06, "on_route_pct": 3, "safe_margin_pct": 3, "rounding_decimals": 2}', 'pending',
   'Ranking normalizado (% em relação ao índice da categoria/idade) e fórmula de Riegel. Fronteiras e expoente pendentes de aprovação do Lucas; ranking público desligado.'),
  ('privacy', '{"health_retention_months": 24, "policy_version": "2026-11-20-rascunho"}', 'proposed',
   'Retenção da resposta de saúde (Sim/Não) e versão dos termos. Textos sujeitos a revisão jurídica.'),
  ('commercial', '{"member_extra_fee": 0, "next_is_separate_plan": false}', 'approved',
   'Aluno BORA ativo confirmado não paga adicional; BORA NEXT não é plano separado; ofertas complementares são opcionais.')
on conflict (key) do nothing;

insert into rtb.feature_flags (key, enabled, description) values
  ('running_integration', false, 'Conector com a Running (não existe API confirmada; o adaptador fica desligado).'),
  ('ranking_public', false, 'Mural e ranking público (depende da aprovação da fórmula pelo Lucas e do opt-in do atleta).'),
  ('analytics', false, 'Analytics próprio com consentimento (sem PII e sem dado clínico).'),
  ('benefits_catalog', true, 'Vitrine de benefícios no Passport (mostra só benefícios ativos e cadastrados).'),
  ('public_testimonials', false, 'Depoimentos na landing (somente autorizados por escrito).'),
  ('late_entries', true, 'Aceitar candidatura depois do prazo, sempre marcada como entrada tardia para aprovação humana.')
on conflict (key) do nothing;

-- Feriados nacionais e pontos facultativos (2026–2027) para o cálculo de dias úteis. Editável no OS.
insert into rtb.business_holidays (day, label, kind) values
  ('2026-01-01', 'Confraternização Universal', 'national'),
  ('2026-02-16', 'Carnaval', 'optional'), ('2026-02-17', 'Carnaval', 'optional'),
  ('2026-04-03', 'Paixão de Cristo', 'national'), ('2026-04-21', 'Tiradentes', 'national'),
  ('2026-05-01', 'Dia do Trabalho', 'national'), ('2026-06-04', 'Corpus Christi', 'optional'),
  ('2026-09-07', 'Independência do Brasil', 'national'), ('2026-10-12', 'Nossa Senhora Aparecida', 'national'),
  ('2026-11-02', 'Finados', 'national'), ('2026-11-15', 'Proclamação da República', 'national'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'national'), ('2026-12-25', 'Natal', 'national'),
  ('2027-01-01', 'Confraternização Universal', 'national'),
  ('2027-02-08', 'Carnaval', 'optional'), ('2027-02-09', 'Carnaval', 'optional'),
  ('2027-03-26', 'Paixão de Cristo', 'national'), ('2027-04-21', 'Tiradentes', 'national'),
  ('2027-05-01', 'Dia do Trabalho', 'national'), ('2027-05-27', 'Corpus Christi', 'optional'),
  ('2027-09-07', 'Independência do Brasil', 'national'), ('2027-10-12', 'Nossa Senhora Aparecida', 'national'),
  ('2027-11-02', 'Finados', 'national'), ('2027-11-15', 'Proclamação da República', 'national'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'national'), ('2027-12-25', 'Natal', 'national')
on conflict (day) do nothing;

-- ───────────────────────── Modelos de e-mail (pt-BR) ─────────────────────────
-- Variáveis entre {{chaves}}. O corpo é texto simples com parágrafos; o servidor escapa tudo e aplica o layout BORA.
insert into rtb.message_templates (key, kind, subject, preheader, body, cta_label, cta_path) values
  ('account_created', 'transactional', 'Seu Boston Passport foi emitido',
   'Passaporte {{passport_number}}: sua jornada fica guardada aqui.',
   'Seu Boston Passport ({{passport_number}}) está pronto.\n\nEle guarda suas simulações, sua candidatura e cada etapa da jornada, mesmo antes de qualquer aprovação.\n\nO Road to Boston 2028 é uma iniciativa independente da BORA.',
   'Abrir meu passaporte', '/passport'),
  ('application_submitted', 'transactional', 'Recebemos sua candidatura ao Road to Boston 2028',
   'A coordenação técnica vai analisar. Você acompanha tudo no Passport.',
   'Olá, {{first_name}}.\n\nSua candidatura foi recebida. A coordenação técnica da BORA analisa cada caso pessoalmente; o resultado preliminar não é uma aprovação.\n\nVocê acompanha cada etapa no seu Passport.',
   'Ver minha candidatura', '/passport/candidatura'),
  ('application_under_review', 'transactional', 'Sua candidatura está em análise',
   'A coordenação técnica está avaliando seu caso.',
   'Olá, {{first_name}}.\n\nSua candidatura está em análise pela coordenação técnica. Assim que houver um parecer, você recebe aqui e no Passport.',
   'Acompanhar', '/passport/candidatura'),
  ('document_requested', 'transactional', 'A coordenação pediu mais informações',
   'Responda pelo Passport para seguirmos com a análise.',
   'Olá, {{first_name}}.\n\nA coordenação técnica precisa de mais informações para concluir a análise da sua candidatura. Responda pelo Passport; se quiser, anexe um comprovante.',
   'Responder agora', '/passport/candidatura'),
  ('technical_decision', 'transactional', 'Parecer técnico da sua candidatura',
   'O parecer da coordenação está no seu Passport.',
   'Olá, {{first_name}}.\n\nA coordenação técnica registrou o parecer da sua candidatura. Veja a mensagem e os próximos passos no Passport.',
   'Ver parecer', '/passport/candidatura'),
  ('next_invite', 'transactional', 'Convite: BORA NEXT',
   'A coordenação técnica definiu seu caminho de desenvolvimento.',
   'Olá, {{first_name}}.\n\nDepois de analisar sua candidatura, a coordenação técnica recomendou o BORA NEXT: um caminho com metas intermediárias e acompanhamento para você evoluir.\n\nComo aluno BORA ativo, você entra sem cobrança adicional. Aceite o convite no Passport.',
   'Ver convite', '/passport/jornada'),
  ('enrollment_guidance', 'transactional', 'Próximo passo: sua matrícula na BORA',
   'Para começar {{journey}}, falta a matrícula.',
   'Olá, {{first_name}}.\n\nPara seguir em {{journey}}, o próximo passo é a matrícula normal na BORA. O projeto não tem cobrança extra além da mensalidade; serviços complementares são opcionais.\n\nAssim que a matrícula for confirmada pela equipe, sua jornada é liberada no Passport.',
   'Ver próximos passos', '/passport/jornada'),
  ('cycle_joined', 'transactional', 'Bem-vindo: {{journey}}',
   'Sua jornada começou.',
   'Olá, {{first_name}}.\n\nSua entrada em {{journey}} está confirmada. Metas, testes e benefícios aparecem no Passport conforme seu treinador e a coordenação liberarem.',
   'Abrir meu passaporte', '/passport/jornada'),
  ('test_scheduled', 'transactional', 'Teste do mês: {{test_name}}',
   'Data e orientações do próximo teste.',
   'Olá, {{first_name}}.\n\nO próximo teste do ciclo é {{test_name}}, em {{date}}. Orientações no Passport.',
   'Ver testes', '/passport/testes'),
  ('reassessment_scheduled', 'transactional', 'Sua reavaliação foi agendada',
   'Data prevista: {{date}}.',
   'Olá, {{first_name}}.\n\nA coordenação técnica agendou sua reavaliação para {{date}}. Até lá, siga o plano com seu treinador.',
   'Ver minha jornada', '/passport/jornada'),
  ('benefit_issued', 'transactional', 'Benefício emitido: {{benefit}}',
   'Seu código está no Passport.',
   'Olá, {{first_name}}.\n\nSeu benefício "{{benefit}}" foi emitido. O código e as instruções estão em Resgates. Validade: {{expires_at}}.',
   'Ver meu código', '/passport/resgates'),
  ('benefit_redeemed', 'transactional', 'Benefício utilizado: {{benefit}}',
   'Registro do uso no parceiro.',
   'Olá, {{first_name}}.\n\nRegistramos o uso do benefício "{{benefit}}". Se não foi você, fale com a BORA.',
   'Ver histórico', '/passport/resgates')
on conflict (key) do nothing;

-- ───────────────────────── Conteúdo público editável ─────────────────────────
insert into rtb.site_content (key, value, status, legal_review) values
  ('calendar', '{"items": [
     {"key": "campanha", "label": "Campanha e candidaturas", "when": "Novembro de 2026", "status": "em_andamento"},
     {"key": "apresentacao", "label": "Apresentação do projeto", "when": "Dezembro de 2026", "status": "previsto"},
     {"key": "ciclo", "label": "Início do ciclo", "when": "Janeiro de 2027", "status": "previsto"},
     {"key": "teste-3k", "label": "Teste 3 km", "when": "Janeiro de 2027", "status": "previsto"},
     {"key": "teste-5k", "label": "Teste 5 km", "when": "Fevereiro de 2027", "status": "previsto"},
     {"key": "teste-10k", "label": "Teste 10 km", "when": "Março de 2027", "status": "previsto"},
     {"key": "teste-21k", "label": "Teste 21 km", "when": "Abril de 2027", "status": "previsto"},
     {"key": "bora-42k", "label": "Treino/teste BORA 42K", "when": "Maio de 2027", "status": "a_definir"},
     {"key": "provas-alvo", "label": "Provas alvo (Lima, Rio, Porto Alegre)", "when": "2027 · datas a confirmar", "status": "a_confirmar"},
     {"key": "inscricao-baa", "label": "Semana de inscrição Boston 2028 (B.A.A.)", "when": "Setembro de 2027", "status": "oficial_baa"},
     {"key": "boston", "label": "Boston Marathon 2028", "when": "17 de abril de 2028", "status": "oficial_baa"}
   ]}', 'published', false),
  ('testimonials', '{"items": []}', 'published', false),
  ('footer.disclaimer', '{"text": "Projeto independente da BORA Assessoria. Não afiliado nem endossado pela Boston Athletic Association."}', 'published', false)
on conflict (key) do nothing;

commit;
