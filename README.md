# BORA Road to Boston 2028

Landing pública com o Boston Index Lab, o **Boston Passport** (PWA do atleta) e o **BORA OS** do projeto (equipe). É uma iniciativa independente da BORA, não afiliada nem endossada pela Boston Athletic Association.

- Produto: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Decisões: [docs/DECISIONS.md](docs/DECISIONS.md)
- Arquitetura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Dados: [docs/ERD.md](docs/ERD.md)

## Rodar localmente

Precisa de Node 24. Não precisa de Docker: o Postgres 17 vem embutido no projeto.

```bash
npm install
node node_modules/@embedded-postgres/darwin-arm64/scripts/hydrate-symlinks.js   # só na 1ª vez (o npm 11 pede aprovação de scripts)
npm run db:start      # sobe o Postgres local (porta 54329) e cria rtb_dev com o seed de demonstração
cp .env.example .env.local   # e ajuste: DATABASE_URL=postgres://postgres@127.0.0.1:54329/rtb_dev, DATABASE_SSL=disable,
                             # AUTH_DRIVER=local, STORAGE_DRIVER=local, LOCAL_AUTH_SECRET=<32+ caracteres aleatórios>
npm run dev           # http://localhost:3530
```

Outros comandos do banco: `npm run db:reset` (recria do zero), `npm run db:stop`, `npm run db:types` (gera `src/types/database.types.ts`).

### Contas de demonstração (só no banco local)

No login local, o código de 6 números aparece na tela. Qualquer e-mail novo cria uma conta de atleta.

| Conta | Papel |
| --- | --- |
| `admin@rtb.local` | super_admin |
| `coordenacao@rtb.local` | technical_director (o papel do Lucas) |
| `treinador@rtb.local` | coach |
| `comercial@rtb.local` | commercial |
| `vinculo@rtb.local` | membership_verifier |
| `growth@rtb.local` | growth |
| `parceiro@rtb.local` | partner_operator (Loja de Tênis Exemplo) |

Atletas do seed:
- `ana.elegivel@rtb.local`: elegível preliminar, aluna verificada;
- `bruno.quase@rtb.local`: Quase lá, não aluno;
- `carla.quase2@rtb.local`: Quase lá, aluna;
- `diego.lesao@rtb.local`: Agora não;
- `elisa.road@rtb.local`: Road ativo;
- `fabio.next@rtb.local`: convite do NEXT;
- `gabi.naoaluna@rtb.local`: aprovada, aguardando matrícula;
- `hugo.info@rtb.local`: pedido de informação.

## Banco

- **Migrations:** `supabase/migrations/20261120180000…0700_*.sql`. Tudo fica no schema `rtb`, e a migração é aditiva: não toca em nada fora do `rtb`.
  - `…0000` fundação;
  - `…0100` candidatura e jornadas;
  - `…0200` benefícios;
  - `…0300` funções de negócio;
  - `…0400` RLS e permissões;
  - `…0500` views;
  - `…0600` storage;
  - `…0700` dados oficiais e de referência.
- **Seed** (`supabase/seed.sql`): só para demonstração local. Recusa rodar se houver perfil real.
- **Stub local** (`supabase/local/supabase_stub.sql`): recria papéis, `auth.uid()` e storage do Supabase no Postgres local. **Nunca aplicar num projeto Supabase.**

### Aplicar num projeto Supabase (quando o Alex escolher o projeto)

> Recomendação: um **projeto dedicado** ao Road to Boston. O Auth do projeto da LP/OS (`zivjyyapvbbaxkegzqys`) está fechado para cadastro público por segurança do BORA OS. Nesse projeto, **nunca** rodar `supabase config push` nem `db push`.

1. Criar o projeto e vincular: `supabase link --project-ref <ref>` (dentro desta pasta).
2. Aplicar as migrations: `supabase db push` (projeto dedicado) **ou** colar os 8 arquivos, em ordem, no SQL Editor. **Não** rodar o `seed.sql`.
3. Criar o usuário do app no Postgres. A senha fica fora do git:
   ```sql
   create role rtb_app login noinherit password '<senha forte>';
   grant anon, authenticated, service_role to rtb_app;
   ```
   `DATABASE_URL` = pooler em modo transação (porta 6543), com o usuário `rtb_app.<ref>`.
4. Auth:
   - **Email** ligado e **Confirm email** ligado.
   - Em **Sign In / Providers**, deixar cadastro aberto.
   - O template **Magic Link** deve conter o código `{{ .Token }}` e o link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/passport`.
   - Site URL = domínio do app.
   - Redirect URLs: `https://<domínio>/auth/confirm` e o domínio de preview.
5. **SMTP próprio (Resend)** em Auth › SMTP Settings. Sem ele, o Supabase só envia para membros da equipe e com limite baixo.
6. Os buckets `rtb-public` e `rtb-private` nascem pela migration `…0600`. Não precisa expor o schema `rtb` na API: o app acessa o banco pelo servidor.
7. Atribuir o primeiro super_admin pelo SQL Editor, depois do primeiro login da pessoa:
   ```sql
   insert into rtb.user_roles (user_id, role, note)
   select id, 'super_admin', 'primeiro admin' from auth.users where email = '<email do Alex>';
   ```
   O papel do **Lucas** (`technical_director`) é dado depois, pelo OS (Configurações › Papéis).

## Variáveis

Veja `.env.example`. Em produção:
- `NEXT_PUBLIC_SITE_URL`;
- `NEXT_PUBLIC_SUPABASE_URL` e a chave pública (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `…ANON_KEY`);
- `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL`, só no servidor;
- `AUTH_DRIVER=supabase` e `STORAGE_DRIVER=supabase`;
- `CRON_SECRET`;
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e `RESEND_WEBHOOK_SECRET`, quando houver.

`SITE_INDEXABLE=1` só depois da revisão jurídica.

**Busca de CEP:** não usa chave. O servidor consulta ViaCEP, depois BrasilAPI e depois OpenCEP (2,5 s por fonte), enviando só os 8 números do CEP. Guarda as respostas por até 24 h em memória e limita a 40 buscas a cada 10 minutos por conta. Se nenhuma fonte responder, o cadastro segue com cidade e UF à mão. `CEP_DRIVER=fixture` (CEPs fixos, sem rede) só vale com o login local e é o que os testes ponta a ponta usam.

## Deploy (Vercel) · checklist

1. Projeto Vercel no time `bora-assessoria`. O `vercel.json` já tem `"framework": "nextjs"` e os dois crons.
2. Variáveis em Production e Preview. Preview deve usar banco de teste, nunca o de produção.
3. `vercel deploy` (preview) → testar login, cadastro, candidatura e Passport → `vercel deploy --prod`.
4. Domínio: CNAME no Cloudflare (proxy desligado). Atualizar Site URL e Redirect URLs no Supabase.
5. Resend:
   - verificar o domínio de envio (SPF, DKIM e DMARC no DNS);
   - criar o webhook `https://<domínio>/api/webhooks/resend` com os eventos `email.delivered`, `email.bounced` e `email.complained`;
   - guardar o segredo em `RESEND_WEBHOOK_SECRET`.
6. Conferir as rotas `/api/cron/sla` e `/api/cron/outbox`: sem `Authorization: Bearer $CRON_SECRET`, respondem 401.

**Rollback:**
- **Código:** `vercel rollback` ou promover o deploy anterior.
- **Banco:** as migrations são aditivas. Para desfazer tudo do projeto, `drop schema rtb cascade` (apaga só o `rtb`), feito depois de um backup.
- **Backup:** o Supabase Pro faz backup diário. Antes de mudanças grandes, rodar `supabase db dump --linked -s rtb -f backup-rtb.sql`.

## Operação

- **Revisão do Lucas:** OS › Triagem e SLA, depois a ficha do candidato. As ações ficam na coluna da direita. Cada uma pede motivo e próximo passo, avisa o atleta e entra na auditoria. "Registrar contato" encerra o SLA.
- **Verificar matrícula:** OS › Vínculo BORA (ou a aba Vínculo da ficha). Escolha o status e a origem da conferência. O sistema recalcula acesso e jornadas sozinho:
  - matrícula confirmada libera a jornada e o convite do NEXT;
  - saída pausa a jornada sem apagar o histórico.
- **Parceiros e benefícios:**
  1. OS › Parceiros: cadastrar e registrar a autorização de marca com comprovante.
  2. OS › Benefícios › Novo: começa como rascunho.
  3. Conferir a prévia e Ativar.
  4. No modo "código único", carregar o lote do parceiro.
- **Validação no parceiro:** o atleta mostra o QR. O operador do parceiro lê com a câmera do celular, o que abre OS › Validar, e confirma. Uma vez só.
- **Running (futuro):** com a documentação da API, implementar o adaptador e ligar a flag `running_integration`. Até lá, a conciliação é manual e o campo "ID na Running" fica na verificação.

## Movimento (GSAP)

O site público, o login e o cadastro usam GSAP 3.15. O Passport e o OS continuam como estavam (decisão 34).

O motor é um só: `src/components/motion/MotionRoot.tsx`. Os componentes continuam no servidor e só ganham marcações:
- `data-hero` · `data-hero-split` · `data-hero-item`: abertura da página;
- `data-split`: títulos que sobem linha a linha;
- `data-reveal` e `data-stagger`: blocos que entram ao rolar;
- `data-scramble`: números em estilo cronômetro;
- `data-timeline`: linha do calendário;
- `data-float`: brilhos de fundo;
- `data-magnetic`: botões principais.

A lista completa está no topo do arquivo.

**Regras:**
- **"Reduzir movimento":** tudo fica parado e visível.
- **Sem JavaScript:** nada some. O CSS só esconde a abertura quando há script, e uma animação de segurança mostra tudo em 2,2 s.
- **Rolagem suave (ScrollSmoother):** só no computador com mouse e fora de navegador automatizado.
  - O cabeçalho fica fora do quadro da rolagem.
  - Ao trocar de página, a nova começa no topo sem "rolar" até lá.
- **Títulos quebrados em linhas:** voltam ao HTML original quando a animação termina.

## Testes

```bash
npm run lint && npm run typecheck
npm run test:unit                                  # regras de domínio (tempo, idade, índice, régua, status do atleta, e-mail)
npm run test:db                                    # RLS, estados, decisões, NEXT, benefícios, concorrência, SLA, auditoria, paridade TS×SQL
npx playwright test -c playwright.e2e.config.ts    # ponta a ponta em build de produção local (iPhone/WebKit e desktop/Chromium)
npm run build
node scripts/smoke-cep.mjs                         # busca de CEP de verdade no servidor de desenvolvimento (precisa de internet)
node scripts/smoke-motion.mjs                      # movimento em navegador real: rolagem suave, teclado, troca de página, iPhone, movimento reduzido
```

| Cenário da especificação | Onde é testado |
| --- | --- |
| 1, 2 · simular sem login; manter a simulação no cadastro | e2e `public`, `journey` |
| 3 · autodeclarado sem acesso extra | db `application-flow`, e2e `journey` |
| 4, 5 · aprovado aluno × não aluno | db `application-flow`, e2e `journey` |
| 6 · Quase lá sem NEXT | db `application-flow`, unit `domain`, e2e `journey` |
| 7 · NEXT com aceite / após matrícula | db `application-flow`, e2e `journey` |
| 8, 9 · pedido de informação; acompanhamento | db `application-flow`, e2e `journey` |
| 10 · Agora não por lesão | db `application-flow`, unit `domain` |
| 11 · idempotência | db `application-flow`, `benefits` |
| 12, 13, 14, 15 · resgate, negativas, concorrência, validação única | db `benefits`, e2e `journey` |
| 16 · mudança de vínculo | db `application-flow` |
| 17 · falha de integração sem falso sucesso | db `integrity` (fila de e-mail), rotas de cron/webhook |
| 18, 19 · iPhone (16px, abas, passaporte) e movimento reduzido | e2e `security-ios` |
| 20 · acesso a terceiros e ao OS negado | db `rls`, e2e `security-ios` |
