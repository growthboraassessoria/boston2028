// Service worker do Boston Passport.
// Guarda SÓ arquivos públicos (código do site, ícones, marca, fontes) e a página offline.
// Nunca guarda Passport, OS, APIs, login ou qualquer resposta com dado pessoal.
const VERSION = "rtb-static-v1";
const PRECACHE = ["/offline", "/brand/bora-logo-white.png", "/brand/bora-symbol-white.png", "/icons/icon-192.png", "/icons/icon-512.png"];
const PRIVATE = /^\/(passport|os|api|login|cadastro|auth|sair|v|sem-acesso)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isStatic =
    !PRIVATE.test(url.pathname) &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/") ||
      /\.(?:woff2?|ttf)$/.test(url.pathname));
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic" && !res.headers.get("cache-control")?.includes("no-store")) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
    return;
  }
  if (req.mode === "navigate") {
    // Rede sempre; sem rede, a página offline (nunca uma cópia antiga do Passport).
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
