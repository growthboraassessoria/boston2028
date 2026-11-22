import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { cpfFromBase } from "../../src/lib/cpf";

// Banco do e2e (o mesmo do playwright.e2e.config.ts): o login acha o CPF da conta de demonstração pelo e-mail.
const sql = postgres("postgres://postgres@127.0.0.1:54329/rtb_e2e", { max: 2, onnotice: () => {} });
export const DEMO_PASSWORD = "Boston2028";
const cpfByEmail = new Map<string, string>();

export async function cpfOf(email: string): Promise<string> {
  const known = cpfByEmail.get(email);
  if (known) return known;
  const [r] = await sql`select li.cpf from rtb.login_identities li join auth.users u on u.id = li.user_id where u.email = ${email}`;
  if (!r) throw new Error(`sem CPF de login para ${email}`);
  return r.cpf as string;
}

export async function login(page: Page, email: string, next = "/passport", password = DEMO_PASSWORD) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#cpf").fill(await cpfOf(email));
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

let cpfSeq = 0;
/** CPF válido e único por execução (base aleatória + sequência). */
export function uniqueCpf() {
  cpfSeq += 1;
  return cpfFromBase(String(200_000_000 + ((Date.now() % 700_000) * 100 + cpfSeq) % 700_000_000));
}

/** Cria o acesso (CPF + e-mail + senha) e para no formulário do Passport. */
export async function createAccount(page: Page, email: string, next?: string) {
  const cpf = uniqueCpf();
  await page.goto(next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro");
  await page.locator("#cpf").fill(cpf);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.locator("#confirm").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Criar conta e continuar" }).click();
  await page.waitForURL(/cadastro/);
  await expect(page.locator("#fullName")).toBeVisible();
  cpfByEmail.set(email, cpf);
  return cpf;
}

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@rtb.local`;
}

export async function signup(page: Page, email: string, o: { name?: string; member?: "Sim, atualmente" | "Não" | "Já fui aluno" } = {}) {
  await createAccount(page, email);
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
