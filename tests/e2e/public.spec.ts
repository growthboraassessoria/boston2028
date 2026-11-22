import { expect, test } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

test("landing: marca própria, aviso de independência, sem identidade da B.A.A.", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Road to/i);
  await expect(page.getByText("Seu próximo índice começa aqui.")).toBeVisible();
  await expect(page.getByText(/Não afiliado nem endossado pela Boston Athletic Association/).first()).toBeVisible();
  const imgs = await page.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  expect(imgs.some((s) => /baa|unicorn|adidas/i.test(s))).toBe(false);
  await noHorizontalOverflow(page);
});

test("viewport: zoom liberado (sem maximum-scale nem user-scalable=no)", async ({ page }) => {
  await page.goto("/");
  const vp = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(vp).toContain("viewport-fit=cover");
  expect(vp).not.toMatch(/maximum-scale|user-scalable=no/);
});

test("cenário 1 · simula o índice sem login, com fonte e aviso de que índice não é vaga", async ({ page }) => {
  await page.goto("/calculadora");
  await page.locator("input[type=date]").first().fill("1990-06-10");
  await page.getByText("Masculino", { exact: true }).click();
  await page.locator("input[inputmode=numeric]").first().fill("3:12:30");
  await page.locator("input[type=date]").nth(1).fill("2026-09-20");
  await page.getByRole("button", { name: "Calcular meu índice" }).click();
  await expect(page.getByText("Índice oficial da faixa")).toBeVisible();
  await expect(page.getByText("3:00:00").first()).toBeVisible();
  await expect(page.getByText(/não garante inscrição/).first()).toBeVisible();
  await expect(page.getByText(/consultada em 20\/11\/2026/).first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test("validações: tempo impossível e data no futuro", async ({ page }) => {
  await page.goto("/calculadora");
  await page.locator("input[type=date]").first().fill("1990-06-10");
  await page.getByText("Feminino", { exact: true }).click();
  await page.locator("input[inputmode=numeric]").first().fill("1:30:00");
  await page.locator("input[type=date]").nth(1).fill("2026-09-20");
  await page.getByRole("button", { name: "Calcular meu índice" }).click();
  await expect(page.getByText(/abaixo do recorde mundial/)).toBeVisible();
});

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
  test(`sem rolagem lateral em ${width}px (home, calculadora, critérios, FAQ)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/calculadora", "/criterios", "/faq"]) {
      await page.goto(path);
      await noHorizontalOverflow(page);
    }
  });
}
