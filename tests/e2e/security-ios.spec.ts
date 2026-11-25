import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, signup, uniqueEmail } from "./helpers";

test("cenário 20 · sem login vai para o login; atleta não entra no OS nem na ficha de terceiros", async ({ page }) => {
  await page.goto("/passport");
  await expect(page).toHaveURL(/\/login\?next=%2Fpassport/);
  await signup(page, uniqueEmail("intruso"));
  await page.goto("/os");
  await expect(page).toHaveURL(/sem-acesso/);
  await page.goto("/os/candidatos/00000000-0000-4000-8000-000000000999");
  await expect(page).toHaveURL(/sem-acesso/);
});

test("rotinas e webhook recusam chamadas sem segredo/assinatura", async ({ request }) => {
  expect((await request.get("/api/cron/sla")).status()).toBe(401);
  expect((await request.get("/api/cron/outbox")).status()).toBe(401);
  expect([401, 503]).toContain((await request.post("/api/webhooks/resend", { data: { type: "email.delivered" } })).status());
  const ok = await request.get("/api/cron/sla", { headers: { authorization: "Bearer e2e-cron-secret-0123456789" } });
  expect(ok.status()).toBe(200);
});

test("cenário 18 · inputs com 16px ou mais (sem zoom no iPhone) e passaporte abre e fecha", async ({ page }) => {
  await signup(page, uniqueEmail("ios"));
  await page.goto("/passport/candidatura");
  const sizes = await page.locator("input:not([type=radio]):not([type=checkbox]):not([type=hidden]), select, textarea")
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
  await page.goto("/passport");
  await page.getByRole("button", { name: "Abrir meu passaporte" }).last().click();
  await expect(page.getByRole("heading", { name: "Identificação" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1000) < 640) {
    // Celular: páginas empilhadas numa rolagem só; o atalho leva à página e fica destacado.
    await expect(page.getByRole("region", { name: "Sua situação" })).toBeVisible();
    await page.getByRole("navigation", { name: "Páginas do passaporte" }).getByRole("button", { name: /Jornada/ }).click();
    await expect(page.getByRole("heading", { name: "Minha jornada" })).toBeInViewport();
    await expect(page.locator("[data-chip][aria-current=true]")).toContainText("Jornada");
    await expect(page.getByRole("heading", { name: "Benefícios" })).toBeAttached(); // as 5 páginas estão na tela, sem setas
    await noHorizontalOverflow(page);
  } else {
    await page.getByRole("button", { name: "Próxima página" }).click();
    await expect(page.getByRole("heading", { name: "Minha jornada" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("button", { name: "Abrir meu passaporte" }).first()).toBeVisible();
});

test.describe("cenário 19 · movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });
  test("o passaporte abre sem giro 3D e o conteúdo fica acessível", async ({ page }) => {
    await signup(page, uniqueEmail("reduz"));
    await page.getByRole("button", { name: "Abrir meu passaporte" }).last().click();
    await expect(page.getByRole("heading", { name: "Identificação" })).toBeVisible();
    if ((page.viewportSize()?.width ?? 1000) < 640) {
      // Celular: não existe livro 3D (as páginas são empilhadas).
      expect(await page.locator(".preserve-3d").count()).toBe(0);
    } else {
      const transform = await page.locator("[aria-label='Abrir meu passaporte']").first().evaluate((el) => getComputedStyle(el.parentElement!).transform);
      expect(transform === "none" || !transform.includes("matrix3d")).toBe(true);
    }
  });
});

test("tab bar não cobre o campo focado (teclado)", async ({ page }) => {
  await signup(page, uniqueEmail("teclado"));
  await page.goto("/passport/candidatura");
  const field = page.locator("#availability");
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  const box = await field.boundingBox();
  const bar = await page.getByRole("navigation", { name: "Seções do Passport" }).boundingBox();
  expect(box && bar ? box.y + box.height <= bar.y + 1 || box.y >= bar.y + bar.height : true).toBe(true);
});
