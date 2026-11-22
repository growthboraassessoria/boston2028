import { expect, test } from "@playwright/test";

// Movimento (GSAP): é só enfeite. Aqui se garante que nada fica escondido nem quebrado, com e sem "reduzir movimento".
// A rolagem suave fica desligada em navegador automatizado; ela é conferida em scripts/smoke-motion.mjs.
test("movimento: a abertura termina completa e o título volta ao HTML original", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText(/Road to/);
  await expect(h1).toHaveCSS("opacity", "1", { timeout: 8_000 });
  await expect.poll(() => h1.evaluate((el) => el.innerHTML.includes("<br>")), { timeout: 8_000 }).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator("#cta-final")).toHaveCSS("opacity", "1", { timeout: 8_000 });
});

test.describe("movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });

  test("nada se mexe nem fica escondido", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("opacity", "1");
    expect(await page.locator("h1 div").count(), "título sem quebra em linhas").toBe(0);
    expect(await page.evaluate(() => document.documentElement.classList.contains("has-smoother"))).toBe(false);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator("#cta-final")).toHaveCSS("opacity", "1");
  });
});
