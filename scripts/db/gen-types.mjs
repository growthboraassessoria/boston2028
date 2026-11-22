#!/usr/bin/env node
// Gera src/types/database.types.ts no formato do `supabase gen types` (Tables Row/Insert/Update, Views, Functions)
// a partir do Postgres local. Quando houver projeto Supabase, dá para trocar por: supabase gen types typescript --project-id <ref> --schema rtb
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { localUrl } from "./lib.mjs";

const sql = postgres(process.env.RTB_TYPES_DB ?? localUrl("rtb_dev"), { max: 1, onnotice: () => {} });
const map = (t, udt) => {
  if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(udt)) return "number";
  if (udt === "bool") return "boolean";
  if (["json", "jsonb"].includes(udt)) return "Json";
  if (t === "ARRAY") return `${map("", udt.replace(/^_/, ""))}[]`;
  return "string";
};
const cols = await sql`
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_generated, c.is_identity, t.table_type
  from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'rtb' order by c.table_name, c.ordinal_position`;
const fns = await sql`
  select p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'rtb' order by p.proname`;
await sql.end();

const tables = {}, views = {};
for (const c of cols) {
  const target = c.table_type === "VIEW" ? views : tables;
  (target[c.table_name] ??= []).push(c);
}
const field = (c, mode) => {
  const ts = map(c.data_type, c.udt_name) + (c.is_nullable === "YES" ? " | null" : "");
  const optional = mode === "Update" || (mode === "Insert" && (c.is_nullable === "YES" || c.column_default !== null || c.is_identity === "YES"));
  return `          ${c.column_name}${optional ? "?" : ""}: ${ts}`;
};
let out = `// Gerado por scripts/db/gen-types.mjs a partir das migrations aplicadas no Postgres local. Não editar à mão.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  rtb: {
    Tables: {
`;
for (const [name, cs] of Object.entries(tables)) {
  out += `      ${name}: {\n        Row: {\n${cs.map((c) => field(c, "Row")).join("\n")}\n        };\n`;
  out += `        Insert: {\n${cs.filter((c) => c.is_generated !== "ALWAYS").map((c) => field(c, "Insert")).join("\n")}\n        };\n`;
  out += `        Update: {\n${cs.filter((c) => c.is_generated !== "ALWAYS").map((c) => field(c, "Update")).join("\n")}\n        };\n      };\n`;
}
out += `    };\n    Views: {\n`;
for (const [name, cs] of Object.entries(views)) out += `      ${name}: {\n        Row: {\n${cs.map((c) => field({ ...c, is_nullable: "YES" }, "Row")).join("\n")}\n        };\n      };\n`;
out += `    };\n    Functions: {\n`;
for (const f of fns) out += `      ${f.proname}: { Args: ${JSON.stringify(f.args)}; Returns: ${JSON.stringify(f.result)} };\n`;
out += `    };\n  };\n};\n`;
writeFileSync("src/types/database.types.ts", out);
console.log(`database.types.ts: ${Object.keys(tables).length} tabelas, ${Object.keys(views).length} views, ${fns.length} funções`);
