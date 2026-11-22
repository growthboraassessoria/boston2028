// Confere o movimento (GSAP) num navegador de verdade, contra o servidor de desenvolvimento:
// computador com rolagem suave (o Chromium sai sem a marca de automação para ela ligar), iPhone sem rolagem suave,
// "reduzir movimento" e a troca de etapa do cadastro. Capturas em .data/shots/motion-*.png.
// Uso: node scripts/smoke-motion.mjs [http://localhost:3530]
import { chromium, webkit, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3530";
const out = ".data/shots";
mkdirSync(out, { recursive: true });
const results = [];
const check = (ok, label, extra = "") => results.push({ ok: !!ok, label, extra });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const watchErrors = (page, bag) => {
  page.on("pageerror", (e) => bag.push(String(e)));
  page.on("console", (m) => m.type() === "error" && bag.push(m.text()));
};
const contentY = (page) => page.evaluate(() => {
  const t = getComputedStyle(document.querySelector("#smooth-content")).transform;
  return t === "none" ? 0 : Number(t.split(",")[5]?.replace(")", "") ?? 0);
});

// ── 1. Computador com rolagem suave ──────────────────────────────────────────────
{
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  watchErrors(page, errors);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await wait(350);
  await page.screenshot({ path: `${out}/motion-desktop-abertura-0350ms.png` });
  await wait(2600);
  await page.screenshot({ path: `${out}/motion-desktop-abertura-fim.png` });

  const s = await page.evaluate(() => ({
    smoother: document.documentElement.classList.contains("has-smoother"),
    fixed: getComputedStyle(document.querySelector("#smooth-wrapper")).position,
    h1Opacity: getComputedStyle(document.querySelector("h1")).opacity,
    h1Restored: document.querySelector("h1").innerHTML.includes("<br>"),
    bib: document.querySelector("[data-count-from]")?.textContent,
  }));
  check(s.smoother && s.fixed === "fixed", "computador: rolagem suave ligada", `wrapper=${s.fixed}`);
  check(s.h1Opacity === "1" && s.h1Restored, "computador: título da abertura completo e original depois da animação");
  check(s.bib === "2028", "computador: número de peito terminou em 2028", s.bib);

  // Roda do mouse: a página desliza (a posição do conteúdo muda aos poucos) e assenta no lugar certo.
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 1400);
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(Math.round(await contentY(page)));
    await wait(60);
  }
  await wait(1600);
  const settled = await page.evaluate(() => window.scrollY);
  const finalY = Math.round(await contentY(page));
  const distinct = new Set(samples).size;
  check(distinct >= 4 && Math.abs(finalY + settled) <= 2, "computador: rolagem suave desliza e assenta", `amostras=${samples.join(",")} fim=${finalY} scrollY=${settled}`);

  // Teclado: o Tab leva até o elemento focado, mesmo com a rolagem suave.
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(1500);
  let tabOk = true;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    await wait(120);
  }
  await wait(1300);
  const focus = await page.evaluate(() => {
    const r = document.activeElement?.getBoundingClientRect();
    return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim().slice(0, 30) } : null;
  });
  tabOk = !!focus && focus.top >= 0 && focus.bottom <= focus.h;
  check(tabOk, "computador: Tab deixa o foco visível", JSON.stringify(focus));

  // Seções reveladas ao rolar até o fim.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2800);
  const bottom = await page.evaluate(() => ({
    cta: getComputedStyle(document.querySelector("#cta-final")).opacity,
    line: getComputedStyle(document.querySelector("[data-timeline-line]")).transform,
  }));
  check(bottom.cta === "1", "computador: chamada final apareceu ao rolar", `opacidade=${bottom.cta}`);
  // Escala vertical real da linha (4º valor da matriz). O GSAP omite scale(1) no estilo, então lê o calculado.
  const scaleY = bottom.line === "none" ? 1 : Number(bottom.line.match(/matrix\(([^)]+)\)/)?.[1].split(",")[3]);
  check(Math.abs(scaleY - 1) < 0.01, "computador: linha do calendário completa", `escala=${scaleY}`);
  await page.screenshot({ path: `${out}/motion-desktop-fim-da-pagina.png` });

  // Troca de página no meio da rolagem: a página nova começa no topo, sem "rolar" até lá.
  await page.evaluate(() => window.scrollTo(0, 2200));
  await wait(1500);
  await page.locator("header nav >> text=Critérios").click();
  await page.waitForURL(/criterios/);
  await wait(120);
  const nav = await page.evaluate(() => ({ y: window.scrollY, wrap: document.querySelector("#smooth-wrapper").scrollTop }));
  const navY = Math.round(await contentY(page));
  check(nav.y === 0 && nav.wrap === 0 && Math.abs(navY) <= 2, "computador: página nova abre no topo, sem rolar", `scrollY=${nav.y} quadro=${nav.wrap} conteúdo=${navY}`);
  await wait(2200);
  const crit = await page.evaluate(() => getComputedStyle(document.querySelector("#criterios")).opacity);
  check(crit === "1", "computador: título da página nova entrou", `opacidade=${crit}`);
  await page.screenshot({ path: `${out}/motion-desktop-criterios.png` });

  check(errors.length === 0, "computador: sem erros no console", errors.slice(0, 3).join(" | "));
  await browser.close();
}

// ── 2. iPhone: animações sem rolagem suave ───────────────────────────────────────
{
  const browser = await webkit.launch();
  const page = await (await browser.newContext({ ...devices["iPhone 14"] })).newPage();
  const errors = [];
  watchErrors(page, errors);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await wait(400);
  await page.screenshot({ path: `${out}/motion-iphone-abertura-0400ms.png` });
  await wait(2600);
  const m = await page.evaluate(() => ({ smoother: document.documentElement.classList.contains("has-smoother"), h1: getComputedStyle(document.querySelector("h1")).opacity }));
  check(!m.smoother && m.h1 === "1", "iPhone: sem rolagem suave, abertura completa");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2500);
  const cta = await page.evaluate(() => getComputedStyle(document.querySelector("#cta-final")).opacity);
  check(cta === "1", "iPhone: chamada final apareceu ao rolar", `opacidade=${cta}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, "iPhone: sem rolagem lateral", `sobra=${overflow}`);
  check(errors.length === 0, "iPhone: sem erros no console", errors.slice(0, 3).join(" | "));
  await browser.close();
}

// ── 3. "Reduzir movimento": tudo parado e visível ────────────────────────────────
{
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })).newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await wait(150);
  const r = await page.evaluate(() => ({
    smoother: document.documentElement.classList.contains("has-smoother"),
    h1: getComputedStyle(document.querySelector("h1")).opacity,
    split: !!document.querySelector("h1 div"),
  }));
  check(!r.smoother && r.h1 === "1" && !r.split, "movimento reduzido: sem rolagem suave e título parado e visível");
  await browser.close();
}

// ── 4. Cadastro: a etapa nova entra deslizando ───────────────────────────────────
{
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${base}/login?next=%2Fcadastro`);
  await page.fill("#email", `smoke-motion-${Date.now()}@teste.local`);
  await page.getByRole("button", { name: "Receber código" }).click();
  const code = (await page.getByTestId("dev-code").textContent()).match(/\d{6}/)[0];
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/cadastro/);
  await page.fill("#fullName", "Teste Movimento Silva");
  await page.fill("#birthDate", "1990-06-10");
  await page.fill("#phone", `(61) 9${String(Date.now()).slice(-8)}`);
  await page.fill("#cep", "70150-900");
  await page.locator("#cep-hint").filter({ hasText: /Achamos|Não achamos|não respondeu/ }).waitFor();
  await page.getByText("Masculino", { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await wait(90);
  const mid = await page.evaluate(() => getComputedStyle(document.querySelector("[data-step] > *")).opacity);
  await wait(900);
  const end = await page.evaluate(() => getComputedStyle(document.querySelector("[data-step] > *")).opacity);
  check(Number(mid) < 1 && end === "1", "cadastro: etapa 2 entra deslizando", `opacidade ${mid} → ${end}`);
  await page.screenshot({ path: `${out}/motion-cadastro-etapa2.png` });
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "ok    " : "FALHOU"} ${r.label}${r.extra ? ` · ${r.extra}` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
