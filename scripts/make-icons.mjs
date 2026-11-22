// Gera os ícones do PWA a partir do escudo BORA (vetor do kit), verde #CEFF00 sobre azul-noite.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const shield = `<svg viewBox="0 0 548 680" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" fill="#ceff00" d="M0 0H548V400C548 560 430 680 274 680C118 680 0 560 0 400Z M34 34H514V400C514 549.8 409.6 646 274 646C138.4 646 34 549.8 34 400Z"/><polygon fill="#ceff00" points="115,330 338,102 352,100 362,114 362,335 305,335 305,200 185,335"/><polygon fill="#ceff00" points="433,350 210,578 196,580 186,566 186,345 243,345 243,480 363,345"/></svg>`;
const html = (pad, radius) => `<html><body style="margin:0"><div style="width:100vw;height:100vh;display:grid;place-items:center;background:radial-gradient(120% 90% at 30% 15%,#0f3a7a,#071c3c 60%);border-radius:${radius}">
<div style="height:${100 - pad * 2}vh">${shield.replace("<svg", '<svg style="height:100%;width:auto;display:block"')}</div></div></body></html>`;
const out = [
  ["public/icons/icon-192.png", 192, 20, "0"], ["public/icons/icon-512.png", 512, 20, "0"],
  ["public/icons/maskable-512.png", 512, 30, "0"], ["src/app/apple-icon.png", 180, 20, "0"], ["src/app/icon.png", 64, 14, "0"],
];
mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
for (const [path, size, pad, radius] of out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(pad, radius));
  await page.screenshot({ path, omitBackground: false });
  await page.close();
}
await browser.close();
console.log("ícones gerados");
