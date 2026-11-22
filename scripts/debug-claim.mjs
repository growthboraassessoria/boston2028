import { webkit } from "@playwright/test";
const base = "http://localhost:3530";
const b = await webkit.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
await page.goto(`${base}/login?next=/passport/beneficios`, { waitUntil: "networkidle" });
await page.fill("#email", "elisa.road@rtb.local");
await page.getByRole("button", { name: "Receber código" }).click();
const code = (await page.getByTestId("dev-code").textContent()).match(/\d{6}/)[0];
await page.fill("#code", code);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));
console.log("após login:", page.url());
await page.goto(`${base}/passport/beneficios/demo-tenis-10`, { waitUntil: "networkidle" });
console.log("detalhe:", page.url());
await page.screenshot({ path: ".data/shots/debug-detail.png", fullPage: true });
const hasClaim = await page.getByRole("button", { name: "Resgatar" }).count();
console.log("botão resgatar:", hasClaim);
if (hasClaim) {
  await page.locator("label[for=accept-terms]").click();
  await page.getByRole("button", { name: "Resgatar" }).click();
  await page.waitForTimeout(3000);
  console.log("depois do resgate:", page.url());
  console.log(await page.locator("[role=alert]").allTextContents());
  await page.screenshot({ path: ".data/shots/debug-after-claim.png", fullPage: true });
}
await b.close();
