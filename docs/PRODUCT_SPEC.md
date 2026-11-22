# Especificação do produto (como foi construído)

Fonte: "Prompt master de implementação · BORA Road to Boston 2028", v1.0 de 20/11/2026. Documentos de origem do Lucas Resende (Proposta v2 de 23/10/2026 e "Caminho do Lead" de 10/11/2026) não estão em `docs/references/`. As regras abaixo vêm da especificação.

Legenda: ✅ implementado e testado · 🟡 implementado, depende de configuração externa · ⏳ pendente de decisão · ⬜ fora desta entrega

## 1. Posicionamento
- ✅ Iniciativa independente da BORA. Aviso de não afiliação no rodapé, na capa interna do passaporte e nos e-mails.
- ✅ Nenhuma marca da B.A.A., unicórnio ou adidas. A marca própria é tipográfica ("Road to Boston 2028"), com o escudo BORA.
- ⏳ Textos legais e de marca são rascunho e precisam de revisão jurídica; o site fica fora do Google até `SITE_INDEXABLE=1`.

## 2. Fontes de verdade
- ✅ Índices B.A.A. 2027/2028 versionados com fonte (baa.org), data da consulta (20/11/2026), faixas M/F/X e idade no dia 17/04/2028. Tabela publicada é imutável.
- ✅ Régua interna: maratona até +15 min ou meia × 2 até +5 min; mínimo de 4 treinos por semana; sem lesão em tratamento; prova alvo entre Lima, Rio e Porto Alegre. É preliminar e sempre revisada por uma pessoa.
- ⏳ Janela de "marca recente" (proposta: 18 meses), fórmula do ranking, reavaliação de 90 dias e datas de provas e testes: configuráveis e marcados como proposta ou "a confirmar".

## 3. Rotas
- ✅ Públicas: `/`, `/projeto`, `/criterios`, `/calculadora`, `/calendario`, `/faq`, `/login`, `/cadastro`, `/privacidade`, `/termos`.
- ✅ Passport: `/passport` e as subpáginas candidatura, jornada, perfil, indicadores, testes, conquistas, beneficios (e `[slug]`), resgates, notificacoes e configuracoes.
- ✅ OS: `/os` e as subpáginas candidatos (e `[id]`), triagem, alunos, comercial, jornadas, testes, rankings, beneficios (`novo` e `[id]`), parceiros, resgates (e `validar`), comunicacoes, analytics, configuracoes e auditoria.
- ✅ Extras: `/v/[token]` (QR interno do passaporte), `/offline`, `/api/cron/*`, `/api/webhooks/resend`.

## 4–5. Visual, landing e Index Lab
- ✅ Azul-noite, verde BORA como único sinal e amarelo só em sinalização. Grafismos autorais: altimetria abstrata, marcas de km, número de peito inventado, carimbos e padrão de segurança próprio.
- ✅ O Index Lab funciona sem login, com índice, diferença, ritmo necessário, leitura simulada da régua, avisos ("não garante inscrição"; "a meia é só régua da BORA"), validações e casos especiais encaminhados à revisão humana.
- ✅ "Criar meu Boston Passport" leva a simulação junto: o cookie anônimo é ligado à conta depois do login e o formulário vem pré-preenchido.
- 🟡 Fotografia real: há espaço para foto licenciada (`media_assets` com licença e aprovação). Sem foto cadastrada, entram os grafismos.

## 6. Cadastro e vínculo
- ✅ Cadastro em 3 etapas: você, vínculo BORA e privacidade. Inclui WhatsApp em E.164, CEP obrigatório com busca automática do endereço (ViaCEP, BrasilAPI e OpenCEP, pelo servidor; cidade e UF corrigíveis), consentimentos separados e origem do professor ou código.
- ✅ "Você já é aluno BORA?" (Sim, atualmente / Não / Já fui aluno). A autodeclaração fica separada da verificação e nunca libera nada.
- ✅ A verificação manual no OS registra quem fez, a origem, a data e uma nota.
- 🟡 Conector Running: tabelas e adaptador prontos, desligados por flag. Não existe API presumida.

## 7. Estados e decisão técnica
- ✅ Três dimensões independentes (vínculo, candidatura, jornada e acesso) com as transições da especificação.
- ✅ Decisões do Lucas com motivo, próximo passo, data e mensagem opcional. São auditadas, idempotentes, reversíveis por nova decisão e nunca apagadas.
- ✅ NEXT só depois de decisão humana. O banco impede jornada sem decisão; o atleta em "Quase lá" vê só "em análise".
- ✅ SLA de 3 dias úteis (feriados editáveis) com aviso e atraso para a coordenação; tentativas de contato registradas.

## 8. Boston Passport
- ✅ Capa com textura, lombada costurada, escudo em relevo e "Road to Boston 2028" em verde metalizado. A abertura 3D gira em torno da lombada (mola de ~0,7 s), com sombra dinâmica e páginas que se revelam.
- ✅ Não repete a abertura sozinho; tem "Fechar" e "Abrir" de novo. O som é opcional e começa desligado; a vibração só acontece onde o aparelho suporta. Com "reduzir movimento", não há 3D.
- ✅ Cinco páginas: identificação (QR interno), jornada, carimbos, evolução e benefícios. A troca de página funciona por gesto, teclado, setas ou abas.
- ✅ Experiência iOS:
  - `viewport-fit=cover`, áreas seguras e zoom liberado;
  - inputs com 16px ou mais e alvos de 44px;
  - barra de abas que some com o teclado.
- ✅ PWA: manifesto, ícones próprios e service worker só com arquivos públicos; página offline.

## 9. Benefícios
- ✅ Cadastro de parceiros com autorização de marca e comprovante.
- ✅ Benefícios com elegibilidade (jornada, vínculo, UF, cidade e polo), período, estoque, limite por pessoa, 5 modalidades, termos e visibilidade (oculto, visível ou visível bloqueado com motivo).
- ✅ Resgate atômico: trava, estoque e limite; código único ou QR opaco; cupom e link só depois do resgate.
- ✅ Validação no parceiro uma única vez, idempotente. Também há aprovação manual, cancelamento com devolução de estoque, lote de códigos e duplicação.
- ✅ Demonstração só no seed local, com parceiros e benefícios marcados "demonstração".

## 10. Gamificação
- ✅ Testes do ciclo (3K, 5K, 10K, 21K e BORA 42K, com datas a confirmar), envio e validação de resultado, nível normalizado (Riegel), carimbos automáticos e manuais.
- ⏳ O ranking público fica desligado até o Lucas aprovar a fórmula. O NEXT nunca é comparado ao Road.

## 11. BORA OS
- ✅ Papéis atribuídos no banco: super_admin, growth, technical_director, coach, commercial, membership_verifier e partner_operator. Há escopo por polo para vínculo e comercial.
- ✅ Visão geral com números observados (sem receita estimada), triagem com SLA, ficha 360 com 10 abas e o resto das telas operacionais.

## 12–14. Banco, integrações e comunicações
- ✅ 8 migrations, RLS em todas as tabelas, funções exigidas (`verify_member_link`, `record_technical_decision`, `claim_benefit`, `validate_redemption`, `award_badge`, `append_audit_event`, `enroll` dentro da decisão e do aceite) e testes SQL de permitido e negado.
- ✅ 12 modelos de e-mail em português, editáveis no OS; fila com novas tentativas e estados honestos.
- 🟡 Envio real pelo Resend: falta a chave e o remetente verificado. Sem eles, os e-mails ficam "na fila — integração pendente".

## 16. Cenários de UX
Os 20 cenários foram cobertos por testes de banco (60 checagens), de unidade, de paridade e de ponta a ponta. Veja a tabela em `README.md › Testes`.
