// Atleta resgata → QR → parceiro valida uma vez → segunda vez é recusada.
import { chromium, webkit } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3530";
const out = ".data/shots";
const errors = [];
async function login(page, email, next) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Receber código" }).click();
  const code = (await page.getByTestId("dev-code").textContent()).match(/\d{6}/)[0];
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const b1 = await webkit.launch();
const athlete = await (await b1.newContext({ viewport: { width: 390, height: 844 } })).newPage();
athlete.on("pageerror", (e) => errors.push(String(e)));
await login(athlete, "elisa.road@rtb.local", "/passport/beneficios");
await athlete.goto(`${base}/passport/beneficios`, { waitUntil: "networkidle" });
await athlete.screenshot({ path: `${out}/benefits-catalog-390.png`, fullPage: true });
await athlete.getByRole("link", { name: /10% em tênis/ }).click();
await athlete.waitForURL(/beneficios\/demo-tenis-10/, { waitUntil: "commit" });
await athlete.locator("label[for=accept-terms]").click();
await athlete.getByRole("button", { name: "Resgatar" }).click();
await athlete.waitForURL(/resgates\?novo=/, { waitUntil: "commit" });
await athlete.waitForTimeout(500);
await athlete.screenshot({ path: `${out}/benefits-redemption-390.png`, fullPage: true });
const html = await athlete.content();
const token = (html.match(/validar\?t=([0-9a-f]{40})/) ?? [])[1];
// O QR é SVG: o token não aparece no HTML como texto. Busca o token pela página do atleta via data do servidor não é possível;
// então lemos do banco local só para o teste (o atleta vê o QR; o parceiro "lê" o mesmo link).
let qrToken = token;
if (!qrToken) {
  const { default: postgres } = await import("postgres");
  const sql = postgres("postgres://postgres@127.0.0.1:54329/rtb_dev", { onnotice: () => {} });
  const [r] = await sql`select s.qr_token from rtb.redemption_secrets s join auth.users u on u.id = s.user_id where u.email = 'elisa.road@rtb.local' order by s.created_at desc limit 1`;
  qrToken = r.qr_token; await sql.end();
}
await b1.close();
const b2 = await chromium.launch();
const partner = await (await b2.newContext({ viewport: { width: 390, height: 844 } })).newPage();
partner.on("pageerror", (e) => errors.push(String(e)));
await login(partner, "parceiro@rtb.local", `/os/resgates/validar?t=${qrToken}`);
await partner.goto(`${base}/os/resgates/validar?t=${qrToken}`, { waitUntil: "networkidle" });
await partner.getByRole("button", { name: "Confirmar uso" }).click();
await partner.getByText("Uso confirmado").waitFor();
await partner.screenshot({ path: `${out}/benefits-validated-390.png` });
await partner.goto(`${base}/os/resgates/validar?t=${qrToken}`, { waitUntil: "networkidle" });
await partner.getByRole("button", { name: "Confirmar uso" }).click();
await partner.getByText("Não validado").waitFor();
const second = await partner.getByText("Este código já foi usado.").count();
await partner.screenshot({ path: `${out}/benefits-second-390.png` });
console.log(JSON.stringify({ secondRejected: second > 0, errors: errors.slice(0, 5) }));
await b2.close();
