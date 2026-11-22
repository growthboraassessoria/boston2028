import { defineConfig } from "@playwright/test";

// Unidade e banco (sem servidor web). Ponta a ponta fica em playwright.e2e.config.ts.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 4,
  reporter: [["list"]],
  projects: [
    { name: "unit", testMatch: /unit\/.*\.spec\.ts/ },
    { name: "db", testMatch: /db\/.*\.spec\.ts/ },
  ],
});
