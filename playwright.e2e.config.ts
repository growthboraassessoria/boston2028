import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta contra um BUILD DE PRODUÇÃO local, com banco próprio (rtb_e2e, recriado com o seed de demonstração),
// login local (código na tela) e arquivos locais. Nada toca Supabase remoto.
const PORT = 3531;
const DB = "postgres://postgres@127.0.0.1:54329/rtb_e2e";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // iPhone e desktop dividem as contas de demonstração: em série, sem corrida entre eles
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "e2e-iphone", use: { ...devices["iPhone 14"] } },
    { name: "e2e-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `node scripts/db/create-test-db.mjs rtb_e2e --seed && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB, DATABASE_SSL: "disable", AUTH_DRIVER: "local", STORAGE_DRIVER: "local",
      LOCAL_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789abcdef", RTB_RATE_LIMIT_OFF: "1",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, CRON_SECRET: "e2e-cron-secret-0123456789",
      // CEPs fixos (sem rede): a busca de verdade é conferida em scripts/smoke-cep.mjs contra o servidor de desenvolvimento.
      CEP_DRIVER: "fixture",
    },
  },
});
