// Confere as páginas do atleta no Passport em 390×844: status 200, sem erro no console, sem rolagem horizontal.
// Só navega (não clica em nada que grave no banco). Prints em .data/shots/passport-<página>.png
// (o primeiro e-mail usa esse nome; os demais ganham o sufixo -<nome>).
// Uso: node scripts/check-passport-pages.mjs [emails separados por vírgula] [base]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const users = (process.argv[2] ?? "elisa.road@rtb.local,bruno.quase@rtb.local").split(",").map((s) => s.trim()).filter(Boolean);
const base = process.argv[3] ?? "http://localhost:3530";
const out = ".data/shots";
const PAGES = ["perfil", "configuracoes", "notificacoes", "conquistas", "testes", "indicadores"];
mkdirSync(out, { recursive: true });

async function login(page, email) {
  await page.goto(`${base}/login?next=/passport`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Receber código" }).click();
  const code = (await page.getByTestId("dev-code").textContent())?.match(/\d{6}/)?.[0];
  if (!code) throw new Error(`sem código de desenvolvimento para ${email}`);
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/passport"), { timeout: 30_000 });
}

let failures = 0;
const browser = await chromium.launch();
for (const [i, email] of users.entries()) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text()}`); });
  await login(page, email);
  const tag = email.split("@")[0].split(".")[0];
  for (const p of PAGES) {
    errors.length = 0;
    const res = await page.goto(`${base}/passport/${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const h1 = (await page.locator("main h1").first().textContent())?.trim();
    await page.screenshot({ path: `${out}/passport-${p}${i === 0 ? "" : `-${tag}`}.png`, fullPage: true });
    const landed = new URL(page.url()).pathname === `/passport/${p}`;
    const ok = landed && res?.status() === 200 && overflow <= 0 && errors.length === 0;
    if (!ok) failures++;
    console.log(JSON.stringify({ ok, user: tag, page: p, status: res?.status(), landed, h1, overflow, errors: errors.slice(0, 5) }));
  }
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
