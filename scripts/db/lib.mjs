// Postgres local de desenvolvimento e teste, sem Docker.
// Usa os binários reais do PostgreSQL 17 (pacote embedded-postgres) e roda como serviço em 127.0.0.1.
// Antes das migrations, aplica supabase/local/supabase_stub.sql, que recria o que o Supabase já traz
// (papéis anon/authenticated/service_role, auth.uid(), auth.users e o esquema storage).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = path.join(ROOT, ".data", "pg");
export const LOG_FILE = path.join(ROOT, ".data", "pg.log");
export const PORT = Number(process.env.RTB_LOCAL_PG_PORT ?? 54329);
export const HOST = "127.0.0.1";

export function localUrl(database) {
  return `postgres://postgres@${HOST}:${PORT}/${database}`;
}

async function binaries() {
  const pkg = `@embedded-postgres/${process.platform}-${process.arch}`;
  try {
    return await import(pkg);
  } catch {
    throw new Error(`Binários do Postgres para ${process.platform}-${process.arch} não instalados (${pkg}). Rode npm install.`);
  }
}

export async function isRunning() {
  const { pg_ctl } = await binaries();
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) return false;
  const r = spawnSync(pg_ctl, ["status", "-D", DATA_DIR], { encoding: "utf8" });
  return r.status === 0;
}

export async function start() {
  const { initdb, pg_ctl } = await binaries();
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    // Só escuta em 127.0.0.1; "trust" é aceitável porque o banco é local e descartável.
    execFileSync(initdb, ["-D", DATA_DIR, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C", "--no-instructions"], { stdio: "pipe" });
  }
  if (await isRunning()) return;
  execFileSync(
    pg_ctl,
    ["start", "-D", DATA_DIR, "-l", LOG_FILE, "-w", "-t", "30", "-o", `-p ${PORT} -c listen_addresses=${HOST} -c max_connections=60 -c timezone=UTC -c fsync=off`],
    { stdio: "pipe" },
  );
}

export async function stop() {
  const { pg_ctl } = await binaries();
  if (!(await isRunning())) return;
  execFileSync(pg_ctl, ["stop", "-D", DATA_DIR, "-m", "fast", "-w"], { stdio: "pipe" });
}

export async function destroy() {
  await stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
}

export function migrationFiles() {
  const dir = path.join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(path.join(dir, f), "utf8") }));
}

/** Recria o banco do zero: esqueleto Supabase + todas as migrations (+ seed de demonstração, se pedido). */
export async function recreateDatabase(database, { seed = false, quiet = false } = {}) {
  const admin = postgres(localUrl("postgres"), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${database}' and pid <> pg_backend_pid()`);
    await admin.unsafe(`drop database if exists ${database}`);
    await admin.unsafe(`create database ${database}`);
  } finally {
    await admin.end();
  }
  const db = postgres(localUrl(database), { max: 1, onnotice: () => {} });
  try {
    // Papéis são do cluster inteiro: o stub é idempotente.
    await db.unsafe(readFileSync(path.join(ROOT, "supabase", "local", "supabase_stub.sql"), "utf8"));
    for (const m of migrationFiles()) {
      try {
        await db.unsafe(m.sql);
      } catch (e) {
        throw new Error(`Migration ${m.name} falhou: ${e.message}${e.position ? ` (posição ${e.position})` : ""}${e.where ? `\n${e.where}` : ""}`);
      }
      if (!quiet) console.log(`  ✓ ${m.name}`);
    }
    if (seed) {
      await db.unsafe(readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"));
      if (!quiet) console.log("  ✓ seed.sql (dados de demonstração)");
    }
  } finally {
    await db.end();
  }
}
