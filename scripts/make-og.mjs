// Imagem de compartilhamento (1200×630) renderizada com as fontes do projeto. Marca própria; nada da B.A.A.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const font = (f) => `data:font/woff2;base64,${readFileSync(f).toString("base64")}`;
const archivo = font("node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2");
const mono = font("node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2");
const html = `<html><head><style>
@font-face{font-family:A;src:url(${archivo}) format("woff2");font-stretch:62% 125%;font-weight:100 900}
@font-face{font-family:M;src:url(${mono}) format("woff2");font-weight:100 900}
body{margin:0;width:1200px;height:630px;background:radial-gradient(90% 120% at 85% 0%,#0f3a7a,#071c3c 55%);color:#f3f5f9;font-family:A;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(143,176,230,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(143,176,230,.07) 1px,transparent 1px);background-size:48px 48px}
.k{position:absolute;left:80px;top:72px;font-family:M;letter-spacing:.3em;font-size:18px;color:#a9b4c6;text-transform:uppercase}
h1{position:absolute;left:76px;top:120px;margin:0;font-weight:800;font-stretch:72%;text-transform:uppercase;font-size:150px;line-height:.88;letter-spacing:-.02em}
h1 span{color:#ceff00}
p{position:absolute;left:80px;bottom:76px;margin:0;font-size:34px;font-weight:600}
.f{position:absolute;right:80px;bottom:80px;font-family:M;font-size:16px;color:#8392a8;letter-spacing:.12em}
svg{position:absolute;right:90px;top:80px;height:200px}
</style></head><body><div class="grid"></div>
<div class="k">BORA · projeto independente</div>
<h1>Road to<br>Boston <span>2028</span></h1>
<p>Seu próximo índice começa aqui.</p>
<div class="f">ÍNDICE PELA IDADE EM 17.04.2028</div>
<svg viewBox="0 0 548 680"><path fill-rule="evenodd" fill="#ceff00" d="M0 0H548V400C548 560 430 680 274 680C118 680 0 560 0 400Z M34 34H514V400C514 549.8 409.6 646 274 646C138.4 646 34 549.8 34 400Z"/><polygon fill="#ceff00" points="115,330 338,102 352,100 362,114 362,335 305,335 305,200 185,335"/><polygon fill="#ceff00" points="433,350 210,578 196,580 186,566 186,345 243,345 243,480 363,345"/></svg>
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: "src/app/opengraph-image.png" });
await browser.close();
console.log("og ok");
