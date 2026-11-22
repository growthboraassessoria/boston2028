import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, next = "/passport") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Receber código" }).click();
  const text = await page.getByTestId("dev-code").textContent();
  await page.locator("#code").fill(text!.match(/\d{6}/)![0]);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@rtb.local`;
}

export async function signup(page: Page, email: string, o: { name?: string; member?: "Sim, atualmente" | "Não" | "Já fui aluno" } = {}) {
  await login(page, email, "/cadastro");
  await page.waitForURL(/cadastro/);
  await page.locator("#fullName").fill(o.name ?? "Atleta Teste Ponta");
  if (!(await page.locator("#birthDate").inputValue())) await page.locator("#birthDate").fill("1990-06-10");
  await page.locator("#phone").fill(`(61) 9${String(Date.now()).slice(-8)}`);
  // CEP obrigatório; espera a busca terminar para ela não sobrescrever a cidade no meio do preenchimento.
  await page.locator("#cep").fill("70150-900");
  await expect(page.locator("#cep-hint")).toContainText(/Achamos|Não achamos|não respondeu/);
  await page.locator("#city").fill("Brasília");
  await page.locator("#uf").selectOption("DF");
  if (!(await page.getByRole("radio", { name: "Masculino" }).isChecked())) await page.getByText("Masculino", { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText(o.member ?? "Não", { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("checkbox", { name: /Li e aceito os termos/ }).check();
  await page.getByRole("button", { name: "Emitir meu Boston Passport" }).click();
  await page.waitForURL(/\/passport/);
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "rolagem horizontal").toBeLessThanOrEqual(0);
}
