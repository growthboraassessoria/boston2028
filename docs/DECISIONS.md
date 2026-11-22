# Decisões · BORA Road to Boston 2028

Cada decisão tem data, motivo e estado: **aprovada** (veio da especificação do Alex), **tomada na implementação** (escolha técnica, reversível) ou **pendente** (depende do Alex, do Lucas ou de terceiros).

## Produto e regras

| # | Data | Decisão | Estado | Motivo |
| --- | --- | --- | --- | --- |
| 1 | 20/11/2026 | Dois caminhos (Road to Boston e BORA NEXT), nenhuma assinatura nova; aluno ativo confirmado não paga adicional; NEXT não é plano separado | aprovada | Especificação, seção 1 |
| 2 | 20/11/2026 | NEXT só existe depois de decisão humana registrada por quem tem o papel `technical_director` no banco | aprovada | Regra absoluta da seção 7; garantida por função + gatilho (`journey_enrollments.decision_id` obrigatório e conferido) |
| 3 | 20/11/2026 | `super_admin` **não** registra decisão técnica (só `technical_director`) | tomada na implementação | Separar governança de decisão técnica. O admin pode atribuir o papel, e isso fica na auditoria |
| 4 | 20/11/2026 | Encaminhar ao NEXT leva a candidatura para `REASSESSMENT_PENDING`, cria a jornada NEXT e agenda reavaliação (padrão de 90 dias) | tomada na implementação | Os estados da especificação não têm "NEXT"; reavaliação é o que acontece a seguir |
| 5 | 20/11/2026 | Road aprovado para aluno ativo confirmado entra **ativo** direto; NEXT exige **aceite** do atleta | tomada na implementação | Quem se candidatou ao Road já consentiu; o NEXT é um caminho diferente do pedido |
| 6 | 20/11/2026 | "Agora não" (lesão) não pode ir direto para aprovação nem NEXT: primeiro "Manter em acompanhamento" | tomada na implementação | "Sem promessa de treinamento" durante o tratamento |
| 7 | 20/11/2026 | Menor de 18 anos no dia da prova → "Agora não"; para-atleta e casos especiais → revisão humana | tomada na implementação | Regra da B.A.A. (18 anos no dia) e seção 2-D |
| 8 | 20/11/2026 | Janela de "marca recente" = 18 meses | **pendente (Lucas)** | A especificação diz "recente" sem prazo; fica em `program_settings` como proposta |
| 9 | 20/11/2026 | SLA de 3 dias úteis: vence às 23:59 (Brasília) do 3º dia útil; pontos facultativos contam como não úteis; a primeira decisão também conta como primeiro retorno | tomada na implementação | Meta operacional da especificação; editável |
| 10 | 20/11/2026 | Comercial só marca "ganho" com matrícula verificada; a verificação marca "ganho" sozinha | tomada na implementação | "Não marca receita só porque o usuário foi aprovado" |
| 11 | 20/11/2026 | Fórmula do ranking (Riegel 1,06; ±3%) e o mural público ficam desligados | **pendente (Lucas)** | Seção 10: formalizar com o Lucas antes de ligar |
| 12 | 20/11/2026 | Datas de provas, testes e prazos entram como "a confirmar" | **pendente (coordenação)** | Nunca apresentar cronograma provisório como confirmado |
| 33 | 20/11/2026 | CEP obrigatório no cadastro e no perfil, conferido na tela, no servidor e no banco (`save_my_profile` recusa com `cep_required`). A busca, feita pelo servidor, preenche cidade e UF, que podem ser corrigidas: ViaCEP, depois BrasilAPI, depois OpenCEP; "não achei" também passa para a próxima fonte. Sem resposta de nenhuma, o cadastro segue com cidade e UF à mão | aprovada | Pedido do Alex em 20/11: "CEP é obrigatório e quero a API do CEP rodando". As bases discordam (o 99999-999 não está no ViaCEP e está na BrasilAPI), e uma fonte fora do ar não pode travar o cadastro |

## Dados, privacidade e segurança

| # | Data | Decisão | Estado | Motivo |
| --- | --- | --- | --- | --- |
| 13 | 20/11/2026 | Índices B.A.A. 2027/2028 versionados no banco com fonte e data da consulta (baa.org, 20/11/2026); tabela publicada é imutável | tomada na implementação | Seção 2-B |
| 14 | 20/11/2026 | CPF não é coletado | **substituída pela 36** | "Somente se realmente necessário" |
| 15 | 20/11/2026 | Saúde = só Sim/Não, em tabela separada; leem só o dono e a coordenação técnica (nem super_admin) | tomada na implementação | Segregação de dado de saúde |
| 16 | 20/11/2026 | Cupom e link do parceiro em tabela separada (`benefit_secrets`), que o atleta nunca lê; código e QR em `redemption_secrets`, que só o dono lê | tomada na implementação | "Nunca revelar código antes do resgate válido" |
| 17 | 20/11/2026 | O QR do resgate é um link para a tela de validação do parceiro, com um token opaco; o QR do passaporte é `/v/<token>`, que só a equipe resolve | tomada na implementação | QR sem dado pessoal; o parceiro lê com a câmera do celular |
| 18 | 20/11/2026 | E-mail: fila no banco; "accepted" só com o id devolvido pelo Resend; "delivered" só com o webhook assinado; sem chave, fica "queued" | tomada na implementação | "Nunca indicar enviado antes da confirmação do provedor" |
| 19 | 20/11/2026 | Running: porta + adaptador desligado (flag `running_integration`), sem nenhuma API presumida | tomada na implementação | Não existe API confirmada |
| 20 | 20/11/2026 | Service worker guarda só arquivos públicos; Passport, OS, API e login nunca entram no cache | tomada na implementação | Seção 8 |
| 21 | 20/11/2026 | Zoom por pinça liberado; inputs com 16px ou mais | aprovada | Seção 8 (diferente de outros projetos da BORA, que travaram o zoom) |

## Arquitetura

| # | Data | Decisão | Estado | Motivo |
| --- | --- | --- | --- | --- |
| 22 | 20/11/2026 | App novo em `projetos/road-to-boston` (porta 3530), com landing, Passport e OS no mesmo app | tomada na implementação | Padrão da pasta e rotas da especificação |
| 23 | 20/11/2026 | Tudo no schema `rtb` (nada no `public`) | tomada na implementação | Funciona num projeto Supabase dedicado ou num existente, sem colidir com tabelas da LP/OS |
| 24 | 20/11/2026 | **Recomendação:** projeto Supabase dedicado (não o zivjyy) | **substituída pela 37** | O Auth do zivjyy está fechado para cadastro público (segurança do BORA OS); o Road precisa de cadastro de atletas por código no e-mail |
| 25 | 20/11/2026 | Dados pelo servidor com conexão Postgres que assume o papel do usuário (`set local role authenticated` + claims da sessão verificada), como o PostgREST faz | tomada na implementação | RLS vale sempre; dá para testar tudo localmente sem Docker; não precisa expor o schema na API |
| 26 | 20/11/2026 | (substituída pela 36) Login: Supabase Auth com código de 6 dígitos (e link) no e-mail; motor "local" (código na tela) só para desenvolvimento e testes, recusado na Vercel | tomada na implementação | Sem SMS obrigatório; testes reproduzíveis |
| 27 | 20/11/2026 | Postgres 17 embutido (pacote `embedded-postgres`) com um "esqueleto" do Supabase para desenvolvimento e testes | tomada na implementação | A máquina não tem Docker |

## Marca

| # | Data | Decisão | Estado | Motivo |
| --- | --- | --- | --- | --- |
| 28 | 20/11/2026 | Verde #CEFF00 (manual V3 da BORA) como único sinal de ação; o laranja provisório da especificação não foi usado | tomada na implementação | Existem tokens oficiais; a especificação manda usar o laranja só na falta deles |
| 29 | 20/11/2026 | Azul-noite e amarelo de sinalização como clima de prova (referências aproximadas, não oficiais) | aprovada | Seção 4 |
| 30 | 20/11/2026 | Fontes livres (Archivo, Inter, JetBrains Mono) até a licença web da Altone ser confirmada | **pendente (licença)** | Pendência antiga da marca |
| 31 | 20/11/2026 | Nenhuma marca da B.A.A., unicórnio, adidas ou foto externa; fotografia só via cadastro com licença | aprovada | Seção 1 |
| 32 | 20/11/2026 | Textos legais e de marca são rascunho; o site fica fora do Google até `SITE_INDEXABLE=1` | **pendente (jurídico)** | "Sujeito a revisão jurídica antes da publicação" |
| 34 | 20/11/2026 | Movimento com GSAP 3.15 no site público, no login e no cadastro (Passport e OS ficam como estavam). Inclui: abertura com título linha a linha; blocos que entram ao rolar; números em estilo cronômetro; linha do calendário acompanhando a rolagem; troca de etapa deslizando; rolagem suave só no computador com mouse. Com "reduzir movimento", tudo fica parado e visível. Sem JavaScript, nada some, porque o CSS tem uma animação de segurança | aprovada | Pedido do Alex em 20/11: "Aplique gsap em toda a página, quero tudo mais fluido"; o alcance foi escolhido por ele (site público e cadastro) |
| 35 | 20/11/2026 | O logo da B.A.A. (unicórnio, enviado como BAALogo-1.png) não entra no site; a prova aparece só pelo nome | aprovada | Decisão do Alex em 20/11, mantendo a regra 31 e o aviso de não afiliação |
| 36 | 21/11/2026 | Login com **CPF + senha**. O atleta cria a senha no cadastro (8 a 72 caracteres, com letras e números). Para recuperar: CPF + e-mail da conta; se baterem, um código de 6 números vai ao e-mail (15 min, 5 tentativas, guardado só como hash) e abre a tela de senha nova. O CPF fica em `rtb.login_identities` (um por conta; só o servidor procura por CPF; o titular vê o próprio). A conta é criada pelo servidor com a chave de serviço; se o e-mail já tem conta BORA, o CPF só é ligado com a senha dessa conta | aprovada | Pedido do Alex em 21/11: "login com CPF + Senha … caso ele esqueça a senha peça CPF e confirmação do e-mail" |
| 37 | 21/11/2026 | Banco de produção: o principal da BORA (`zivjyyapvbbaxkegzqys`), no schema `rtb`, com usuário próprio `rtb_app` no pooler. As 9 migrations foram aplicadas com `supabase db query --linked -f` (pasta da LP), **sem** entrar no histórico de migrations do zivjyy; nunca `db push` nem `config push` lá. O cadastro público do Auth continua fechado | aprovada | O plano grátis recusou um 3º projeto; o Alex escolheu "usar o existente (principal)" em 21/11 |
