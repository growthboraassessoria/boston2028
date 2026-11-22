// Confere as páginas de administração do OS no servidor de desenvolvimento (login local com código na tela).
// Uso: node scripts/check-os-pages.mjs [baseUrl]
//   STATE_DIR=<pasta>  guarda a sessão de cada conta e reaproveita (o login tem limite de tentativas).
// Não clica em nada destrutivo: só abre a confirmação de revogar papel e fecha. Nada é salvo nos formulários.
import { mkdirSync, existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3530";
const out = ".data/shots";
const stateDir = process.env.STATE_DIR ?? ".data/auth";
mkdirSync(out, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const browser = await chromium.launch();
const report = { pages: [], checks: [], errors: [] };

async function session(email, viewport = { width: 1440, height: 900 }) {
  const statePath = `${stateDir}/check-os-${email.split("@")[0]}.json`;
  const ctx = await browser.newContext({ viewport, storageState: existsSync(statePath) ? statePath : undefined });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`); });
  await page.goto(`${base}/os`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.goto(`${base}/login?next=/os`, { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.getByRole("button", { name: "Receber código" }).click();
    const code = (await page.getByTestId("dev-code").textContent({ timeout: 15000 })).match(/\d{6}/)[0];
    await page.fill("#code", code);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await ctx.storageState({ path: statePath });
  }
  return { ctx, page, errors, email };
}

/** Elementos que passam da largura da tela fora de um contêiner com rolagem própria. */
async function overflowing(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const found = [];
    // Texto que escapa da própria caixa não muda o retângulo do elemento, mas alarga o documento.
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (docWidth > W + 1) found.push(`documento com ${docWidth}px (tela ${W}px)`);
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= W + 1) continue;
      let p = el.parentElement;
      let contained = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") { contained = true; break; }
        p = p.parentElement;
      }
      if (!contained) found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} (${Math.round(r.right)}px)`);
    }
    return found.slice(0, 6);
  });
}

async function visit(s, name, path, opts = {}) {
  const before = s.errors.length;
  const res = await s.page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(opts.wait ?? 350);
  const final = new URL(s.page.url());
  const entry = {
    who: s.email, name, path, status: res?.status(), final: final.pathname + final.search,
    h1: await s.page.locator("main h1").first().textContent({ timeout: 3000 }).catch(() => null),
    overflow: await overflowing(s.page),
  };
  if (opts.shot !== false) await s.page.screenshot({ path: `${out}/os-${name}.png`, fullPage: opts.full ?? true });
  entry.errors = s.errors.slice(before);
  report.pages.push(entry);
  return entry;
}

function check(label, ok, detail) {
  report.checks.push({ label, ok: !!ok, ...(detail ? { detail } : {}) });
}

// ── super_admin ─────────────────────────────────────────────────────────────
const admin = await session("admin@rtb.local");
const p = admin.page;
for (const [name, path] of [
  ["alunos", "/os/alunos"], ["alunos-todos", "/os/alunos?filtro=todos"], ["comercial", "/os/comercial"], ["jornadas", "/os/jornadas"],
  ["testes", "/os/testes"], ["rankings", "/os/rankings"], ["comunicacoes", "/os/comunicacoes"], ["analytics", "/os/analytics"],
  ["config-regras", "/os/configuracoes?aba=regras"], ["config-flags", "/os/configuracoes?aba=flags"], ["config-provas", "/os/configuracoes?aba=provas"],
  ["config-feriados", "/os/configuracoes?aba=feriados"], ["config-indices", "/os/configuracoes?aba=indices"], ["config-papeis", "/os/configuracoes?aba=papeis"],
  ["config-lgpd", "/os/configuracoes?aba=lgpd"], ["auditoria", "/os/auditoria"], ["auditoria-filtro", "/os/auditoria?entidade=program_settings"],
]) await visit(admin, name, path, name === "analytics" ? { wait: 1500 } : {});

// Vínculo: abrir a conferência da primeira linha (sem salvar).
await p.goto(`${base}/os/alunos?filtro=todos`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Conferir:/ }).first().click();
await p.waitForTimeout(300);
check("alunos: conferência abre com formulário de vínculo", await p.getByLabel("Status do vínculo").first().isVisible());
check("alunos: botão da Running desabilitado", await p.getByRole("button", { name: "Sincronizar com a Running" }).isDisabled());
await p.screenshot({ path: `${out}/os-alunos-aberto.png`, fullPage: true });

// Comercial: abrir a edição (sem salvar) e conferir que "Ganha" fica bloqueado sem matrícula verificada.
await p.goto(`${base}/os/comercial`, { waitUntil: "networkidle" });
const editOpp = p.getByRole("button", { name: /^Editar:/ }).first();
if (await editOpp.count()) {
  await editOpp.click();
  await p.waitForTimeout(300);
  const won = p.locator('option[value="WON"]').first();
  check("comercial: opção Ganha bloqueada sem matrícula verificada", await won.isDisabled());
  await p.screenshot({ path: `${out}/os-comercial-aberto.png`, fullPage: true });
}

// Jornadas: abrir metas da primeira linha.
await p.goto(`${base}/os/jornadas`, { waitUntil: "networkidle" });
const metas = p.getByRole("button", { name: /^Metas:/ }).first();
if (await metas.count()) {
  await metas.click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/os-jornadas-aberto.png`, fullPage: true });
}

// Comunicações: processar a fila (sem integração nada é enviado) e abrir um modelo (sem salvar).
await p.goto(`${base}/os/comunicacoes`, { waitUntil: "networkidle" });
// Só clica quando a integração de e-mail está pendente: aí nada pode ser enviado.
if (await p.getByText("E-mail: integração pendente").count()) {
  await p.getByRole("button", { name: "Processar fila agora" }).click();
  const pendingMsg = p.getByText("Integração de e-mail pendente: nada foi enviado");
  await pendingMsg.waitFor({ timeout: 15000 });
  check("comunicações: processar fila sem integração não envia nada", true, await pendingMsg.textContent());
}
await p.getByRole("button", { name: /^Editar:/ }).first().click();
await p.waitForTimeout(300);
check("comunicações: e-mail mascarado na fila", (await p.locator("td", { hasText: /^[a-z0-9]\*\*\*@[a-z0-9]\*\*\*\.[a-z]+$/i }).count()) > 0);
check("comunicações: nenhum e-mail completo na página", !(await p.content()).match(/[a-z0-9.]+@rtb\.local/i));
await p.screenshot({ path: `${out}/os-comunicacoes-aberto.png`, fullPage: true });

// Analytics: gráfico desenhado e tooltip no hover.
await p.goto(`${base}/os/analytics?dim=membership&metrica=applications&dias=90`, { waitUntil: "networkidle" });
await p.locator(".recharts-surface").first().waitFor({ timeout: 15000 });
const bar = p.locator(".recharts-bar-rectangle").first();
if (await bar.count()) { await bar.hover(); await p.waitForTimeout(300); }
check("analytics: gráfico desenhado", (await p.locator(".recharts-bar-rectangle").count()) > 0);
await p.screenshot({ path: `${out}/os-analytics-vinculo.png`, fullPage: true });

// Flags: Running bloqueado.
await p.goto(`${base}/os/configuracoes?aba=flags`, { waitUntil: "networkidle" });
check("flags: running_integration bloqueado", await p.getByRole("switch", { name: "running_integration" }).isDisabled());

// Papéis: abrir a confirmação de revogação e cancelar (nada é revogado).
await p.goto(`${base}/os/configuracoes?aba=papeis`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Revogar / }).first().click();
const dialog = p.getByRole("dialog");
await dialog.waitFor({ timeout: 5000 });
check("papéis: confirmação de revogação aparece", await dialog.isVisible(), await dialog.getByRole("heading").textContent());
check("papéis: botão final exige motivo", await dialog.getByRole("button", { name: "Revogar papel" }).isDisabled());
await p.screenshot({ path: `${out}/os-config-papeis-confirmar.png` });
await dialog.getByRole("button", { name: "Cancelar" }).click();
await dialog.waitFor({ state: "hidden", timeout: 5000 });
check("papéis: cancelar fecha sem revogar", !(await p.getByRole("dialog").count()));

// Papéis: e-mail sem conta → recusa sem gravar nada (só a busca do id).
await p.getByLabel("E-mail da conta (ou ID)").fill("conta-que-nao-existe@rtb.local");
await p.getByLabel("Observação (obrigatória, fica na auditoria)").fill("verificação automática (não grava)");
await p.getByRole("button", { name: "Conceder papel" }).click();
const grantMsg = p.getByRole("alert").filter({ hasText: /Não achamos uma conta/ });
await grantMsg.waitFor({ timeout: 10000 });
check("papéis: e-mail sem conta é recusado", true, await grantMsg.textContent());

// Regras: abrir o editor; valor com tipo errado é recusado no servidor (nada é gravado).
await p.goto(`${base}/os/configuracoes?aba=regras`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Editar: ranking$/ }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/os-config-regras-aberto.png`, fullPage: true });
await p.getByRole("button", { name: /^Fechar: ranking$/ }).click();
await p.getByRole("button", { name: /^Editar: next$/ }).click();
await p.getByLabel("Valor (JSON)").filter({ visible: true }).fill('{"reassessment_days": "90"}');
await p.getByRole("button", { name: "Salvar regra" }).filter({ visible: true }).click();
const typeMsg = p.getByRole("alert").filter({ hasText: /reassessment_days/ });
await typeMsg.waitFor({ timeout: 10000 });
check("regras: número entre aspas é recusado", true, await typeMsg.textContent());

// Feriados: data repetida é recusada pelo banco (nada é gravado).
await p.goto(`${base}/os/configuracoes?aba=feriados`, { waitUntil: "networkidle" });
await p.getByLabel("Data", { exact: true }).fill("2026-12-25");
await p.getByLabel("Nome", { exact: true }).fill("Natal");
await p.getByRole("button", { name: "Incluir" }).click();
const dupMsg = p.getByRole("alert").filter({ hasText: /Já existe um feriado/ });
await dupMsg.waitFor({ timeout: 10000 });
check("feriados: data repetida é recusada", true, await dupMsg.textContent());

// Provas: confirmar data sem data nem fonte é recusado (nada é gravado).
await p.goto(`${base}/os/configuracoes?aba=provas`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Editar:/ }).first().click();
await p.getByLabel("Data confirmada na fonte oficial").check();
await p.getByRole("button", { name: "Salvar prova" }).click();
const raceMsg = p.getByRole("alert").filter({ hasText: /confirmar a data/ });
await raceMsg.waitFor({ timeout: 10000 });
check("provas: data confirmada sem data é recusada", true, await raceMsg.textContent());

// Celular (390 px): nada vaza para fora da tela.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await admin.ctx.storageState() });
const m = { ctx: mobile, page: await mobile.newPage(), errors: [], email: "admin@rtb.local (390)" };
m.page.on("pageerror", (e) => m.errors.push(`pageerror: ${String(e).slice(0, 300)}`));
m.page.on("console", (msg) => { if (msg.type() === "error") m.errors.push(`console: ${msg.text().slice(0, 300)}`); });
for (const [name, path] of [["alunos-390", "/os/alunos?filtro=todos"], ["comercial-390", "/os/comercial"], ["config-papeis-390", "/os/configuracoes?aba=papeis"],
  ["analytics-390", "/os/analytics"], ["comunicacoes-390", "/os/comunicacoes"], ["auditoria-390", "/os/auditoria"]]) await visit(m, name, path, { wait: 900 });
await m.page.goto(`${base}/os/alunos?filtro=todos`, { waitUntil: "networkidle" });
await m.page.getByRole("button", { name: /^Conferir:/ }).first().click();
await m.page.waitForTimeout(300);
check("390: conferência aberta sem vazar", (await overflowing(m.page)).length === 0, await overflowing(m.page));
await m.page.screenshot({ path: `${out}/os-alunos-aberto-390.png`, fullPage: true });
await mobile.close();
await admin.ctx.close();

// ── coordenação técnica ─────────────────────────────────────────────────────
const tech = await session("coordenacao@rtb.local");
await visit(tech, "td-config-regras", "/os/configuracoes?aba=regras");
check("coordenação: aba Papéis escondida", !(await tech.page.getByRole("link", { name: "Papéis" }).count()));
check("coordenação: regra privacy só admin", (await tech.page.getByText("Só admin").count()) > 0);
const tdPapeis = await visit(tech, "td-config-papeis", "/os/configuracoes?aba=papeis", { shot: false });
check("coordenação: ?aba=papeis cai em Regras", !(await tech.page.getByRole("heading", { name: /Papéis ativos/ }).count()), tdPapeis.final);
await visit(tech, "td-testes", "/os/testes");
await visit(tech, "td-jornadas", "/os/jornadas");
await visit(tech, "td-alunos", "/os/alunos");
await visit(tech, "td-rankings", "/os/rankings");
const tdAudit = await visit(tech, "td-auditoria", "/os/auditoria", { shot: false });
check("coordenação: auditoria bloqueada", tdAudit.final.startsWith("/sem-acesso"), tdAudit.final);
await tech.ctx.close();

// ── comercial ───────────────────────────────────────────────────────────────
const sales = await session("comercial@rtb.local");
await visit(sales, "comercial-papel-comercial", "/os/comercial");
const salesCfg = await visit(sales, "comercial-config", "/os/configuracoes", { shot: false });
check("comercial: configurações bloqueadas", salesCfg.final.startsWith("/sem-acesso"), salesCfg.final);
await sales.ctx.close();

// ── growth e treinador (papéis que também chegam a algumas destas páginas) ──────
const growth = await session("growth@rtb.local");
await visit(growth, "growth-comunicacoes", "/os/comunicacoes");
check("growth: sem botão de processar a fila (só admin)", !(await growth.page.getByRole("button", { name: "Processar fila agora" }).count()));
await visit(growth, "growth-rankings", "/os/rankings");
check("growth: aviso de que o papel não vê resultados individuais", (await growth.page.getByText("Seu papel não vê resultados individuais").count()) > 0);
await visit(growth, "growth-analytics", "/os/analytics", { wait: 1200 });
const growthAlunos = await visit(growth, "growth-alunos", "/os/alunos", { shot: false });
check("growth: vínculo bloqueado", growthAlunos.final.startsWith("/sem-acesso"), growthAlunos.final);
await growth.ctx.close();

const coach = await session("treinador@rtb.local");
await visit(coach, "coach-jornadas", "/os/jornadas");
await visit(coach, "coach-testes", "/os/testes");
const coachCfg = await visit(coach, "coach-config", "/os/configuracoes", { shot: false });
check("treinador: configurações bloqueadas", coachCfg.final.startsWith("/sem-acesso"), coachCfg.final);
await coach.ctx.close();

await browser.close();

for (const e of report.pages) if (e.errors.length) report.errors.push({ page: e.name, who: e.who, errors: e.errors });
const failed = report.checks.filter((c) => !c.ok);
const overflow = report.pages.filter((e) => e.overflow.length);
console.log(JSON.stringify({
  pages: report.pages.map((e) => `${e.status} ${e.who.padEnd(24)} ${e.name.padEnd(26)} → ${e.final}${e.h1 ? ` · ${e.h1}` : ""}`),
  checks: report.checks.map((c) => `${c.ok ? "ok  " : "FAIL"} ${c.label}${c.detail ? ` · ${JSON.stringify(c.detail)}` : ""}`),
  overflow: overflow.map((e) => ({ page: e.name, items: e.overflow })),
  errors: report.errors,
}, null, 2));
process.exit(failed.length || report.errors.length || overflow.length ? 1 : 0);
