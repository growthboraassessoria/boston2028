// Print do Passport fechado num usuário novo (sem lembrança de abertura), nos dois motores.
import { webkit, chromium } from "@playwright/test";
const [,, base = "http://localhost:3530"] = process.argv;
for (const [name, engine] of [["webkit", webkit], ["chromium", chromium]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const email = `cover-${name}-${Date.now()}@teste.local`;
  await page.goto(`${base}/login?next=/cadastro`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Receber código" }).click();
  const code = (await page.getByTestId("dev-code").textContent()).match(/\d{6}/)[0];
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/cadastro/);
  await page.fill("#fullName", "Teste Capa Silva");
  await page.fill("#birthDate", "1988-03-02");
  await page.fill("#phone", `(31) 9${String(Date.now()).slice(-8)}`);
  await page.fill("#cep", "30130-010");
  await page.locator("#cep-hint").filter({ hasText: /Achamos|Não achamos|não respondeu/ }).waitFor();
  await page.fill("#city", "Belo Horizonte");
  await page.selectOption("#uf", "MG");
  await page.getByText("Feminino").click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("Não", { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.locator("label[for=acceptTerms]").click();
  await page.getByRole("button", { name: "Emitir meu Boston Passport" }).click();
  await page.waitForURL(/passport/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `.data/shots/cover-${name}.png` });
  await page.getByRole("button", { name: "Abrir meu passaporte" }).last().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `.data/shots/cover-${name}-mid.png` });
  await browser.close();
}
console.log("ok");
