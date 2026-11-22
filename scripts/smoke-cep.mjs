// Confere a busca de CEP DE VERDADE (ViaCEP → BrasilAPI → OpenCEP, pelo servidor) no ambiente de desenvolvimento:
// login local → /cadastro → digita CEPs públicos → cidade e UF preenchidas sozinhas.
// Uso: node scripts/smoke-cep.mjs [http://localhost:3530]   (precisa de internet; cria uma conta smoke-cep-…@teste.local)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3530";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/login?next=%2Fcadastro`);
await page.fill("#email", `smoke-cep-${Date.now()}@teste.local`);
await page.getByRole("button", { name: "Receber código" }).click();
const code = (await page.getByTestId("dev-code").textContent()).match(/\d{6}/)[0];
await page.fill("#code", code);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/cadastro/);

const done = /Achamos|Não achamos|não respondeu|Muitas buscas/;
let ok = true;
// 99999-999 não está no ViaCEP, mas está na BrasilAPI: mostra a reserva funcionando.
for (const [cep, city, uf] of [["01310100", "São Paulo", "SP"], ["70150900", "Brasília", "DF"], ["99999999", "Sarandi", "PR"]]) {
  await page.fill("#cep", "");
  const t0 = Date.now();
  await page.locator("#cep").pressSequentially(cep);
  await page.locator("#cep-hint").filter({ hasText: done }).waitFor({ timeout: 15_000 });
  const hint = await page.locator("#cep-hint").textContent();
  const got = `${await page.inputValue("#city")}/${await page.inputValue("#uf")}`;
  const pass = got === `${city}/${uf}`;
  ok &&= pass;
  console.log(`${pass ? "ok    " : "FALHOU"} ${cep} → ${got} em ${Date.now() - t0} ms · ${hint}`);
}

await page.fill("#cep", "00000-000");
await page.locator("#cep-hint").filter({ hasText: done }).waitFor({ timeout: 15_000 });
const none = await page.locator("#cep-hint").textContent();
const nonePass = none.includes("Não achamos");
ok &&= nonePass;
console.log(`${nonePass ? "ok    " : "FALHOU"} 00000000 → ${none}`);

if (errors.length) console.log("Erros na página:", errors);
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
