// Banco de teste descartável: Postgres 17 local + stub do Supabase + todas as migrations.
// Cada arquivo de teste cria o seu banco (rtb_test_<nome>) para rodar em paralelo sem interferência.
import postgres from "postgres";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export async function freshDb(name: string, opts: { seed?: boolean } = {}): Promise<Sql> {
  const db = `rtb_test_${name.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
  const script = path.resolve(__dirname, "../../scripts/db/create-test-db.mjs");
  const url = execFileSync(process.execPath, [script, db, ...(opts.seed ? ["--seed"] : [])], { encoding: "utf8" }).trim();
  return postgres(url, { max: 12, onnotice: () => {}, prepare: false });
}

export async function createUser(sql: Sql, label: string): Promise<string> {
  const email = `${label}-${randomUUID().slice(0, 8)}@teste.local`;
  const [u] = await sql`insert into auth.users (email, email_confirmed_at) values (${email}, now()) returning id`;
  return u!.id as string;
}

/** Executa como um usuário autenticado (igual ao servidor do app e ao PostgREST). */
export function as(sql: Sql, uid: string) {
  return <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      return fn(tx);
    }) as Promise<T>;
}

export function asAnon(sql: Sql) {
  return <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role anon");
      return fn(tx);
    }) as Promise<T>;
}

export function asService(sql: Sql) {
  return <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    sql.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return fn(tx);
    }) as Promise<T>;
}

export async function grant(sql: Sql, uid: string, role: string, opts: { polo?: string; partnerId?: string } = {}) {
  await sql`insert into rtb.user_roles (user_id, role, scope_polo, partner_id) values (${uid}, ${role}, ${opts.polo ?? null}, ${opts.partnerId ?? null})`;
}

export const key = () => randomUUID().replaceAll("-", "");

export type ProfileOpts = { birth?: string; category?: string; membership?: "SIM_ATUAL" | "NAO" | "EX_ALUNO"; uf?: string; city?: string };

/** Cria perfil + autodeclaração + consentimentos (inclui saúde) pelo caminho real (funções). */
export async function onboard(sql: Sql, uid: string, o: ProfileOpts = {}) {
  await as(sql, uid)(async (tx) => {
    await tx`select rtb.save_my_profile(${tx.json({
      full_name: "Atleta Teste Silva", birth_date: o.birth ?? "1990-06-10", phone_e164: `+5561${Math.floor(10000000 + Math.random() * 89999999)}`,
      cep: "70150900", city: o.city ?? "Brasília", uf: o.uf ?? "DF", reference_category: o.category ?? "M",
    })})`;
    await tx`select rtb.save_membership_claim(${o.membership ?? "NAO"}, ${null}, ${null}, ${false})`;
    await tx`select rtb.record_consents(${tx.json([{ purpose: "terms", granted: true }, { purpose: "privacy", granted: true }, { purpose: "health_data", granted: true }])}, 'teste')`;
  });
}

export async function raceId(sql: Sql, slug = "rio-2027"): Promise<string> {
  const [r] = await sql`select id from rtb.target_races where slug = ${slug}`;
  return r!.id as string;
}

export function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function daysAgo(n: number) {
  const d = new Date(Date.now() - n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export type ApplyOpts = { injury?: boolean; sessions?: boolean; target?: "RACE" | "NONE"; distance?: "MARATHON" | "HALF"; seconds?: number; markDate?: string; hasMark?: boolean };

export async function apply(sql: Sql, uid: string, o: ApplyOpts = {}, idem = key()) {
  const race = await raceId(sql);
  return as(sql, uid)(async (tx) => {
    const [r] = await tx`select rtb.submit_application(${tx.json({
      injury_in_treatment: o.injury ?? false, sessions_4plus: o.sessions ?? true, target_choice: o.target ?? "RACE",
      target_race_id: (o.target ?? "RACE") === "RACE" ? race : null, has_mark: o.hasMark ?? true,
      mark_distance: o.distance ?? "MARATHON", mark_seconds: o.seconds ?? 10800 + 300, mark_date: o.markDate ?? daysAgo(60),
    })}, ${idem}) as r`;
    return r!.r as { application_id: string; status: string; sla_due_at: string | null; replayed: boolean };
  });
}

export async function decide(sql: Sql, techUid: string, appId: string, decision: string, extra: { message?: string; nextOn?: string } = {}, idem = key()) {
  return as(sql, techUid)(async (tx) => {
    const [r] = await tx`select rtb.record_technical_decision(${appId}, ${decision}, ${"Motivo técnico registrado em teste."},
      ${"Próximo passo combinado."}, ${extra.nextOn ?? null}, ${extra.message ?? null}, ${idem}) as r`;
    return r!.r as { decision_id: string; to_status: string; enrollment_id: string | null; enrollment_status: string | null; replayed: boolean };
  });
}

export async function verify(sql: Sql, verifierUid: string, athlete: string, status: string) {
  return as(sql, verifierUid)((tx) => tx`select rtb.verify_member_link(${athlete}, ${status}, 'manual', ${"Conferido na planilha da unidade."}, ${null}) as r`);
}

export async function state(sql: Sql, uid: string) {
  const [s] = await sql`select * from rtb.athlete_states where user_id = ${uid}`;
  return s!;
}

/** Espera que a promessa falhe com uma mensagem que contém o trecho. */
export async function rejects(p: Promise<unknown>, fragment: string | RegExp) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof fragment === "string" ? msg.includes(fragment) : fragment.test(msg)) return msg;
    throw new Error(`Falhou com outra mensagem: "${msg}" (esperado: ${fragment})`);
  }
  throw new Error(`Era para falhar (${fragment}), mas passou.`);
}
