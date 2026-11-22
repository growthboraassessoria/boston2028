#!/usr/bin/env node
// npm run db:start  → sobe o Postgres local e cria o banco rtb_dev (só na primeira vez)
// npm run db:reset  → recria rtb_dev do zero (stub + migrations + seed de demonstração)
// npm run db:stop   → para o serviço
// npm run db:status → mostra se está rodando
import { isRunning, localUrl, PORT, recreateDatabase, start, stop } from "./lib.mjs";
import postgres from "postgres";

const cmd = process.argv[2] ?? "start";
const DB = process.env.RTB_LOCAL_DB ?? "rtb_dev";

async function exists(name) {
  const sql = postgres(localUrl("postgres"), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`select 1 from pg_database where datname = ${name}`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

if (cmd === "start") {
  await start();
  if (!(await exists(DB))) {
    console.log(`Criando ${DB}…`);
    await recreateDatabase(DB, { seed: true });
  }
  console.log(`Postgres local pronto em ${localUrl(DB)} (porta ${PORT}).`);
} else if (cmd === "reset") {
  await start();
  console.log(`Recriando ${DB}…`);
  await recreateDatabase(DB, { seed: true });
  console.log(`Pronto: ${localUrl(DB)}`);
} else if (cmd === "stop") {
  await stop();
  console.log("Postgres local parado.");
} else if (cmd === "status") {
  console.log((await isRunning()) ? `Rodando na porta ${PORT}.` : "Parado.");
} else {
  console.error(`Comando desconhecido: ${cmd}`);
  process.exit(1);
}
