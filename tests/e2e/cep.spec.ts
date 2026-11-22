import { expect, test } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

// Roda com CEP_DRIVER=fixture (CEPs fixos, sem rede). A busca de verdade: scripts/smoke-cep.mjs.
test("cadastro: CEP obrigatório e busca que preenche cidade e UF", async ({ page }) => {
  await login(page, uniqueEmail("cep"), "/cadastro");
  await page.waitForURL(/cadastro/);
  await expect(page.locator("label[for=cep]")).not.toContainText("opcional");
  await expect(page.locator("#cep-hint")).toHaveText("Com o CEP, a cidade e a UF se preenchem sozinhas.");

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator("#cep-err")).toHaveText("Informe o CEP.");

  // Completar os 8 números já dispara a busca (sem precisar sair do campo).
  await page.locator("#cep").pressSequentially("01310100");
  await expect(page.locator("#cep")).toHaveValue("01310-100");
  await expect(page.locator("#cep-hint")).toHaveText("Achamos: Avenida Paulista, Bela Vista · São Paulo/SP. Confira a cidade e a UF.");
  await expect(page.locator("#city")).toHaveValue("São Paulo");
  await expect(page.locator("#uf")).toHaveValue("SP");

  // CEP que não existe: avisa e não apaga a cidade já preenchida.
  await page.locator("#cep").fill("00000-000");
  await expect(page.locator("#cep-hint")).toContainText("Não achamos esse CEP");
  await expect(page.locator("#city")).toHaveValue("São Paulo");

  // Fontes fora do ar: avisa e deixa preencher à mão.
  await page.locator("#cep").fill("99999-990");
  await expect(page.locator("#cep-hint")).toContainText("não respondeu");
});
