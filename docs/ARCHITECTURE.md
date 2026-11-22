# Arquitetura · BORA Road to Boston 2028

## Visão geral

```mermaid
flowchart LR
  subgraph Navegador
    L[Landing + Boston Index Lab<br/>páginas estáticas]
    P[Boston Passport<br/>PWA /passport]
    O[BORA OS<br/>/os]
  end
  subgraph Next.js 16 · Vercel
    PX[proxy.ts<br/>CSP com nonce · renova sessão · no-store]
    SA[Server Actions e Route Handlers<br/>zod + requireUser / requireStaff]
    DB[(lib/db<br/>transação por usuário:<br/>set local role + claims)]
    EM[lib/email/outbox<br/>Resend]
    CR[/api/cron/* · /api/webhooks/resend/]
  end
  subgraph Supabase
    AU[Auth<br/>código por e-mail]
    PG[(Postgres · schema rtb<br/>RLS em todas as tabelas<br/>funções SECURITY DEFINER)]
    ST[(Storage<br/>rtb-public / rtb-private)]
  end
  L -->|simulação anônima| SA
  P --> PX --> SA
  O --> PX
  SA --> DB --> PG
  SA --> AU
  SA --> ST
  EM -->|accepted só com id| PG
  CR --> PG
```

## Camadas

| Camada | Onde | O que faz |
| --- | --- | --- |
| Rotas públicas | `src/app/(public)` | Landing, critérios, calculadora, calendário, FAQ, privacidade e termos. Estáticas com revalidação de 5 min; leem só views públicas (`rtb.v_public_*`) como `anon`. |
| Passport | `src/app/passport` | Casca de app iOS (abas, áreas seguras), passaporte 3D, candidatura, jornada, evolução, benefícios, resgates, perfil, configurações. Sempre dinâmico e sem cache. |
| OS | `src/app/os` | Equipe: visão geral, triagem e SLA, candidatos e ficha 360, vínculo, comercial, jornadas, testes, rankings, benefícios, parceiros, resgates e validação, comunicações, analytics, configurações e auditoria. Menu filtrado pelo papel, e cada página confere o papel no servidor. |
| Ações | `src/lib/actions/*` | Server Actions: validam com zod, conferem sessão e papel, executam como o próprio usuário. |
| Dados | `src/lib/db` | `asAnon`, `asUser`, `asService`: cada chamada abre uma transação, assume o papel (`anon` / `authenticated` / `service_role`) e grava as claims verificadas. O RLS decide o resto. |
| Domínio | `src/lib/domain` | Regras puras: tempo e ritmo, idade no dia da prova, índice, régua interna (espelho exato da função SQL, com teste de paridade), status que o atleta vê. |
| Banco | `supabase/migrations` | Schema `rtb`, RLS, funções de negócio, views, storage e dados oficiais. |

## Segurança (resumo)

1. **RLS em todas as tabelas do `rtb`.** O atleta lê só o que é dele. A equipe lê conforme o papel (`can_see_athlete`): o treinador vê só os atribuídos e o comercial só quem tem oportunidade. A saúde fica só com o dono e a coordenação técnica.
2. **Escritas sensíveis só por função** `SECURITY DEFINER` com `search_path` vazio, que confere `auth.uid()` e o papel, registra auditoria e aceita chave de idempotência. Exemplos: candidatura, decisão técnica, vínculo, aceite de jornada, resgate e validação.
3. **Garantias no próprio banco** (valem até para a chave de serviço):
   - Jornada sem decisão técnica é impossível, por FK e gatilho.
   - Tabela de índices publicada é imutável.
   - Auditoria, decisões e eventos são imutáveis; só saem em cascata quando o usuário é excluído (LGPD).
   - Estoque nunca fica negativo.
   - A mesma pessoa não resgata além do limite: o benefício é travado com `FOR UPDATE` e há `unique (benefit, user, sequence)`.
4. **Papéis vêm do banco** (`rtb.user_roles`), nunca de claim do cliente nem de nome ou e-mail.
5. **Chave de serviço** só no servidor, sem prefixo `NEXT_PUBLIC`. É usada para simulação anônima (com limite por IP), rotinas, fila de e-mail, upload já validado e a consulta mínima do QR interno, depois de conferir o papel.
6. **Proxy:** CSP com nonce e `no-store` nas áreas com dado pessoal. As páginas públicas têm CSP estática sem scripts externos. Também há HSTS, `X-Frame-Options: DENY` e `nosniff`.
7. **Arquivos:** o tipo real é conferido pelos primeiros bytes. O caminho fica escopado por usuário (`users/<uid>/…`) e o bucket é privado, com URL assinada de 10 minutos.
8. **Limites de tentativa** ficam no banco (`rtb.hit_rate_limit`) e valem entre instâncias serverless: código de login, verificação, simulação, candidatura, resgate e validação.

## Ambientes

| Ambiente | Banco | Login | Arquivos | E-mail |
| --- | --- | --- | --- | --- |
| Desenvolvimento | Postgres local embutido, banco `rtb_dev` com seed de demonstração | local (código na tela) | `.data/storage` | fila (sem envio) |
| Testes automatizados | `rtb_test_*` (por arquivo) e `rtb_e2e` (build de produção local) | local | `.data/storage` | fila |
| Preview / Produção (Vercel) | projeto Supabase escolhido pelo Alex | Supabase Auth | Supabase Storage | Resend (quando configurado) |

O motor local de login e de arquivos é recusado quando a variável `VERCEL` existe.

## Rotinas

| Rota | Agenda (vercel.json) | O que faz |
| --- | --- | --- |
| `/api/cron/sla` | diária 11:00 UTC | SLA do "Quase lá" (aviso a 24 h e atraso, uma vez cada), lembretes de elegível sem parecer (D+2 e D+7), acompanhamento de 30 dias do "Agora não", vencimento de códigos |
| `/api/cron/outbox` | diária 11:30 UTC | Reenvio da fila de e-mail (o envio imediato já acontece logo depois de cada ação) |
| `/api/webhooks/resend` | evento | Confirma entrega/devolução (assinatura Svix, janela de 5 min) |

O plano Hobby da Vercel permite só cron diário. No Pro, dá para rodar o SLA de hora em hora.
