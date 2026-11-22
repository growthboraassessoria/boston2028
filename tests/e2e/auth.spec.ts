import { expect, test } from "@playwright/test";
import { cpfOf, createAccount, DEMO_PASSWORD, login, uniqueEmail } from "./helpers";

// Login com CPF + senha, cadastro com senha e "esqueci a senha" (CPF + e-mail → código → senha nova).
test("entrar: CPF inválido e senha errada não entram; CPF + senha certos entram", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#cpf").fill("529.982.247-24");
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toContainText("CPF válido");

  await page.locator("#cpf").fill(await cpfOf("elisa.road@rtb.local")); // conta que existe, senha errada
  await page.locator("#password").fill("SenhaErrada1");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("CPF ou senha incorretos.");
  await expect(page).toHaveURL(/\/login/);

  await login(page, "elisa.road@rtb.local");
  await expect(page).toHaveURL(/\/passport/);
});

test("criar conta: senha fraca, senhas diferentes e CPF repetido são recusados", async ({ page }) => {
  const email = uniqueEmail("conta");
  const cpf = await createAccount(page, email);
  // Com a sessão aberta, o cadastro pede os dados do Passport; sai e tenta de novo com o mesmo CPF.
  await page.context().clearCookies();
  await page.goto("/cadastro");
  await page.locator("#cpf").fill(cpf);
  await page.locator("#email").fill(uniqueEmail("outra"));
  await page.locator("#password").fill("curta1");
  await page.locator("#confirm").fill("curta1");
  await page.getByRole("button", { name: "Criar conta e continuar" }).click();
  await expect(page.locator("#password-err")).toContainText("12 caracteres");

  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.locator("#confirm").fill("Boston@2029!");
  await page.getByRole("button", { name: "Criar conta e continuar" }).click();
  await expect(page.locator("#confirm-err")).toHaveText("As duas senhas não são iguais.");

  // Depois de um erro, os campos de senha voltam vazios (o CPF e o e-mail ficam).
  await expect(page.locator("#cpf")).toHaveValue(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.locator("#confirm").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Criar conta e continuar" }).click();
  await expect(page.locator("#cpf-err")).toContainText("Este CPF já tem cadastro");
});

test("esqueci a senha: CPF + e-mail errado não gera código; certo gera, troca a senha e entra", async ({ page }) => {
  const email = uniqueEmail("esqueci");
  const cpf = await createAccount(page, email);
  await page.context().clearCookies();

  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await page.waitForURL(/\/login\/esqueci/);

  // E-mail que não é o da conta: a tela segue igual, mas nenhum código é criado.
  await page.locator("#cpf").fill(cpf);
  await page.locator("#email").fill("nao-e-o-meu@rtb.local");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByText(/Se o CPF e o e-mail forem de uma conta/)).toBeVisible();
  await expect(page.getByTestId("dev-code")).toHaveCount(0);

  await page.goto("/login/esqueci");
  await page.locator("#cpf").fill(cpf);
  await page.locator("#email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Enviar código" }).click();
  const code = (await page.getByTestId("dev-code").textContent())!.match(/\d{6}/)![0];

  await page.locator("#code").fill(code === "000000" ? "111111" : "000000");
  await page.locator("#password").fill("NovaSenha@42");
  await page.locator("#confirm").fill("NovaSenha@42");
  await page.getByRole("button", { name: "Salvar nova senha e entrar" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("Código inválido");

  await page.locator("#code").fill(code);
  await page.locator("#password").fill("NovaSenha@42");
  await page.locator("#confirm").fill("NovaSenha@42");
  await page.getByRole("button", { name: "Salvar nova senha e entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  // A senha antiga parou de valer; a nova entra.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#cpf").fill(cpf);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("CPF ou senha incorretos.");
  await login(page, email, "/passport", "NovaSenha@42");
});
