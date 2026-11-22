import { expect, test } from "@playwright/test";
import { login, noHorizontalOverflow, signup, uniqueEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

test("cenários 2, 3 e 6 · simulação vira Passport; autodeclarado fica pendente; Quase lá vê só 'em análise'", async ({ page, browser }) => {
  // 2: simulação sem login vira contexto do cadastro
  await page.goto("/calculadora");
  await page.locator("input[type=date]").first().fill("1987-03-02");
  await page.getByText("Masculino", { exact: true }).click();
  await page.locator("input[inputmode=numeric]").first().fill("3:20:00");
  await page.locator("input[type=date]").nth(1).fill("2026-09-20");
  await page.getByRole("button", { name: "Calcular meu índice" }).click();
  await page.getByRole("button", { name: /Criar meu Boston Passport/ }).click();
  await page.waitForURL(/cadastro/);
  const email = uniqueEmail("quase");
  const name = `Rafael Quase ${Math.random().toString(36).slice(2, 7)}`;
  await signup(page, email, { name, member: "Sim, atualmente" });
  // a data de nascimento veio da simulação
  // 3: autodeclaração não libera nada
  await page.getByRole("button", { name: "Abrir meu passaporte" }).last().click();
  await expect(page.getByText("Vínculo em verificação")).toBeVisible();

  // candidatura com marca 3:20:00 (índice 3:05:00 aos 41 anos) → Quase lá
  await page.goto("/passport/candidatura");
  await page.getByText("Rio de Janeiro").click();
  await expect(page.locator("#markTime")).toHaveValue("3:20:00");
  await page.locator("fieldset", { hasText: "4 vezes por semana" }).getByText("Sim", { exact: true }).click();
  await page.locator("fieldset", { hasText: "tratamento de alguma lesão" }).getByText("Não", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Autorizo o uso da resposta sobre lesão/ }).check();
  await page.getByRole("button", { name: "Enviar candidatura" }).click();
  await expect(page.getByText("Sua candidatura está em análise pela coordenação técnica")).toBeVisible();
  // 6: nada de NEXT antes da decisão humana
  for (const path of ["/passport", "/passport/candidatura", "/passport/jornada"]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText("NEXT");
  }
  await noHorizontalOverflow(page);

  // 7 (não aluno confirmado): coordenação encaminha ao NEXT pelo OS
  // Contexto extra sempre fechado (finally): aberto, ele fica vivo e sendo gravado pelos testes seguintes.
  const lucasCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const lucas = await lucasCtx.newPage();
    await login(lucas, "coordenacao@rtb.local", "/os/triagem");
    await lucas.goto("/os/triagem");
    await lucas.getByRole("link", { name }).click();
    await lucas.getByRole("button", { name: "Encaminhar ao BORA NEXT" }).click();
    await lucas.getByLabel("Motivo técnico (interno, obrigatório)").fill("Marca 15 min acima; precisa de base (e2e).");
    await lucas.getByLabel("Próximo passo (obrigatório)").fill("Orientar matrícula e metas de 12 semanas.");
    await lucas.getByRole("button", { name: "Registrar decisão" }).click();
    await expect(lucas.getByText("Decisão registrada")).toBeVisible();
  } finally {
    await lucasCtx.close();
  }

  // Atleta (autodeclarado, ainda não verificado) vê a recomendação, mas sem convite para aceitar
  await page.goto("/passport/jornada");
  await expect(page.getByText("Recomendação da coordenação técnica")).toBeVisible();
  await expect(page.getByRole("button", { name: /Aceitar e entrar/ })).toHaveCount(0);
});

test("cenário 7 · aluno confirmado recebe convite do NEXT e entra sem custo", async ({ page }) => {
  await login(page, "fabio.next@rtb.local", "/passport/jornada");
  await page.goto("/passport/jornada");
  // Os projetos iPhone e desktop dividem o banco de teste: quem rodar primeiro aceita o convite.
  const accept = page.getByRole("button", { name: "Aceitar e entrar no BORA NEXT" });
  if (await accept.count()) {
    await expect(page.getByText("A coordenação técnica indicou o BORA NEXT para você")).toBeVisible();
    await accept.click();
    await expect(page.getByText("Bem-vindo! Sua jornada começou.")).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText("Você está no BORA NEXT")).toBeVisible();
});

test("cenário 4 · aluno confirmado aprovado está no Road; cenário 5 · não aluno aprovado aguarda matrícula", async ({ page, browser }) => {
  await login(page, "elisa.road@rtb.local", "/passport/jornada");
  await page.goto("/passport/jornada");
  await expect(page.getByText("Você está no Road to Boston 2028")).toBeVisible();
  const otherCtx = await browser.newContext();
  try {
    const other = await otherCtx.newPage();
    await login(other, "gabi.naoaluna@rtb.local", "/passport/jornada");
    await other.goto("/passport/jornada");
    await expect(other.getByText("Aprovação técnica: falta a matrícula")).toBeVisible();
    await expect(other.getByText(/não tem cobrança extra|mesma mensalidade/).first()).toBeVisible();
  } finally {
    await otherCtx.close();
  }
});

test("cenário 8 · pedido de informações respondido pelo atleta", async ({ page }) => {
  await login(page, "hugo.info@rtb.local", "/passport/candidatura");
  await page.goto("/passport/candidatura");
  // Banco compartilhado entre iPhone e desktop: quem rodar primeiro responde.
  if (await page.getByLabel("Sua resposta").count()) {
    await expect(page.getByText("Quantos treinos por semana você fez nos últimos 2 meses?")).toHaveCount(1);
    await page.getByLabel("Sua resposta").fill("Cinco treinos por semana desde setembro.");
    await page.getByRole("button", { name: "Enviar resposta" }).click();
    await expect(page.getByText("Resposta enviada para a coordenação técnica.")).toBeVisible();
    await expect(page).toHaveURL(/respondida=1/);
  }
  await expect(page.getByText("Você respondeu à coordenação").first()).toBeVisible();
});

test("cenários 12, 13 e 15 · resgate com QR, limite por pessoa e validação única no parceiro", async ({ page, browser }) => {
  await login(page, "ana.elegivel@rtb.local", "/passport/beneficios");
  await page.goto("/passport/beneficios/demo-tenis-10");
  const terms = page.getByRole("checkbox", { name: /Li as regras e os termos/ });
  if (!(await terms.count())) {
    // Banco compartilhado: o outro projeto já resgatou. O limite de 1 por pessoa bloqueia (cenário 13).
    await expect(page.getByText(/Resgate em andamento|Você já usou/).first()).toBeVisible();
    return;
  }
  await terms.check();
  await page.getByRole("button", { name: "Resgatar" }).click();
  await page.waitForURL(/resgates\?novo=/);
  await expect(page.getByText("Pronto para usar")).toBeVisible();
  await expect(page.locator("svg[aria-label^='QR do resgate']")).toHaveCount(1);
  // Segundo resgate do mesmo benefício: bloqueado (limite por pessoa).
  await page.goto("/passport/beneficios/demo-tenis-10");
  await expect(page.getByText("Resgate em andamento").first()).toBeVisible();

  // O parceiro lê o QR (o link carrega só o token opaco) e valida uma única vez.
  const { default: postgres } = await import("postgres");
  const sql = postgres("postgres://postgres@127.0.0.1:54329/rtb_e2e", { onnotice: () => {} });
  const [row] = await sql`select s.qr_token from rtb.redemption_secrets s join auth.users u on u.id = s.user_id
    where u.email = 'ana.elegivel@rtb.local' order by s.created_at desc limit 1`;
  await sql.end();
  const partnerCtx = await browser.newContext();
  try {
    const partner = await partnerCtx.newPage();
    await login(partner, "parceiro@rtb.local", `/os/resgates/validar?t=${row!.qr_token}`);
    await partner.goto(`/os/resgates/validar?t=${row!.qr_token}`);
    await partner.getByRole("button", { name: "Confirmar uso" }).click();
    await expect(partner.getByText("Uso confirmado")).toBeVisible();
    await partner.goto(`/os/resgates/validar?t=${row!.qr_token}`);
    await partner.getByRole("button", { name: "Confirmar uso" }).click();
    await expect(partner.getByText("Este código já foi usado.")).toBeVisible();
  } finally {
    await partnerCtx.close();
  }
});
