#!/usr/bin/env node
// Uso: node scripts/db/create-test-db.mjs <nome>  → sobe o Postgres local e recria o banco (stub + migrations, sem seed).
import { localUrl, recreateDatabase, start } from "./lib.mjs";

const name = process.argv[2];
if (!name || !/^[a-z0-9_]{3,60}$/.test(name)) {
  console.error("Nome de banco inválido.");
  process.exit(1);
}
await start();
await recreateDatabase(name, { quiet: true, seed: process.argv.includes("--seed") });
process.stdout.write(localUrl(name));
