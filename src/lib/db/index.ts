// Acesso ao Postgres pelo servidor. Cada operação roda numa transação com o papel e as claims de quem pediu,
// do mesmo jeito que o PostgREST do Supabase faz: o RLS vale sempre, inclusive para a equipe.
// Em produção: pooler do Supabase (modo transação) com o usuário rtb_app (NOINHERIT, membro de anon/authenticated/service_role).
import "server-only";
import postgres from "postgres";

export type Tx = postgres.TransactionSql;

type Claims = { sub: string; email?: string | null };

const g = globalThis as unknown as { __rtbSql?: postgres.Sql };

export function db(): postgres.Sql {
  if (g.__rtbSql) return g.__rtbSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbUnavailableError("DATABASE_URL ausente");
  const client = postgres(url, {
    prepare: false, // obrigatório no pooler em modo transação
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 8)),
    idle_timeout: 20,
    connect_timeout: 8,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    onnotice: () => {},
    connection: { application_name: "rtb-web" },
  });
  g.__rtbSql = client;
  return client;
}

export class DbUnavailableError extends Error {
  override name = "DbUnavailableError";
}

async function withRole<T>(role: "anon" | "authenticated" | "service_role", claims: Claims | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    // Papel fixo da lista acima (nunca vem do cliente).
    await tx.unsafe(`set local role ${role}`);
    if (claims) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: claims.sub, email: claims.email ?? null, role, aud: "authenticated" })}, true)`;
    }
    return fn(tx);
  }) as Promise<T>;
}

/** Visitante sem login: só views públicas. */
export function asAnon<T>(fn: (tx: Tx) => Promise<T>) {
  return withRole("anon", null, fn);
}

/** Usuário autenticado (id vindo da sessão verificada no servidor). */
export function asUser<T>(user: { id: string; email?: string | null }, fn: (tx: Tx) => Promise<T>) {
  return withRole("authenticated", { sub: user.id, email: user.email }, fn);
}

/** Rotinas do servidor (cron, fila de e-mail, simulação anônima com limite por IP). Nunca a partir de dado do cliente sem validação. */
export function asService<T>(fn: (tx: Tx) => Promise<T>) {
  return withRole("service_role", null, fn);
}

/** Traduz o erro do banco (raise exception 'codigo') para um código estável. */
export function dbErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/^([a-z_]+)(?::([a-z_]+))?/);
  if (!m) return "unexpected";
  return m[2] ? `${m[1]}:${m[2]}` : m[1]!;
}
