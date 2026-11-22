import { expect, test } from "@playwright/test";
import { apply, as, asService, createUser, freshDb, grant, onboard, rejects, type Sql } from "./helpers";

test.describe.configure({ mode: "serial" });

let sql: Sql;
let admin: string, tech: string;

test.beforeAll(async () => {
  sql = await freshDb("integrity");
  [admin, tech] = (await Promise.all(["admin", "tech"].map((l) => createUser(sql, l)))) as [string, string];
  await grant(sql, admin, "super_admin");
  await grant(sql, tech, "technical_director");
});
test.afterAll(async () => sql?.end());

test("auditoria é imutável até para o dono do banco e para a chave de serviço", async () => {
  const uid = await createUser(sql, "aud");
  await onboard(sql, uid);
  await rejects(sql`update rtb.audit_logs set action = 'x'`, "immutable_table");
  await rejects(sql`delete from rtb.audit_logs`, "immutable_table");
  await rejects(sql`truncate rtb.audit_logs`, "immutable_table");
  await rejects(asService(sql)((tx) => tx`delete from rtb.audit_logs`), "immutable_table");
});

test("exclusão do usuário (LGPD) remove em cascata os históricos ligados a ele, mas não a auditoria", async () => {
  const uid = await createUser(sql, "lgpd");
  await onboard(sql, uid);
  await apply(sql, uid);
  const [before] = await sql`select count(*)::int as n from rtb.audit_logs`;
  await sql`delete from auth.users where id = ${uid}`;
  expect(await sql`select * from rtb.application_events where user_id = ${uid}`).toHaveLength(0);
  const [after] = await sql`select count(*)::int as n from rtb.audit_logs`;
  expect(after!.n).toBe(before!.n);
});

test("tabela de índices publicada não muda: mudança exige nova versão", async () => {
  await rejects(sql`update rtb.qualification_standards set standard_seconds = 9999`, "standards_version_locked");
  await rejects(sql`delete from rtb.qualification_standards`, "standards_version_locked");
  const [n] = await sql`select count(*)::int as n from rtb.v_public_standards`;
  expect(n!.n).toBe(33);
});

test("índices oficiais conferidos com a fonte (amostras)", async () => {
  const get = async (cat: string, age: number) => (await sql`select rtb.lookup_standard(rtb.active_standard_version(), ${cat}, ${age}) as s`)[0]!.s;
  expect(await get("M", 34)).toBe(10500); // 2:55:00
  expect(await get("F", 18)).toBe(12300); // 3:25:00
  expect(await get("X", 52)).toBe(13800); // 3:50:00
  expect(await get("M", 64)).toBe(13800); // 3:50:00
  expect(await get("F", 85)).toBe(19200); // 5:20:00
  expect(await get("M", 17)).toBeNull();
});

test("idade conta no dia da prova (17/04/2028), não hoje", async () => {
  const age = async (birth: string) => (await sql`select rtb.age_on(${birth}::date, date '2028-04-17') as a`)[0]!.a;
  expect(await age("1993-04-17")).toBe(35);
  expect(await age("1993-04-18")).toBe(34);
  expect(await age("2000-02-29")).toBe(28);
});

test("dias úteis: pula fim de semana e feriado nacional", async () => {
  const due = async (from: string, days: number) =>
    (await sql`select to_char(rtb.add_business_days(${from}::timestamptz, ${days}) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as d`)[0]!.d;
  // Sexta 13/11/2026 15h → seg 16, ter 17, qua 18 → vence quarta 23:59
  expect(await due("2026-11-13 15:00-03", 3)).toBe("2026-11-18 23:59");
  // Quinta 19/11 → sexta 20/11 é feriado (Consciência Negra) → seg 23, ter 24, qua 25
  expect(await due("2026-11-19 10:00-03", 3)).toBe("2026-11-25 23:59");
  // Véspera do Natal (qui 24/12) → sexta 25 feriado → seg 28, ter 29, qua 30
  expect(await due("2026-12-24 09:00-03", 3)).toBe("2026-12-30 23:59");
});

test("SLA: aviso e atraso são registrados uma única vez", async () => {
  const uid = await createUser(sql, "sla");
  await onboard(sql, uid);
  const r = await apply(sql, uid, { seconds: 10800 + 25 * 60 });
  await sql`update rtb.applications set sla_due_at = now() - interval '1 hour' where id = ${r.application_id}`;
  const first = await asService(sql)(async (tx) => (await tx`select rtb.sla_tick() as r`)[0]!.r);
  const second = await asService(sql)(async (tx) => (await tx`select rtb.sla_tick() as r`)[0]!.r);
  expect(first.sla_overdue).toBe(1);
  expect(second.sla_overdue).toBe(0);
  const notes = await as(sql, tech)((tx) => tx`select kind from rtb.notifications where kind = 'sla.overdue'`);
  expect(notes).toHaveLength(1);
  // Contato registrado encerra o SLA.
  await as(sql, tech)((tx) => tx`select rtb.record_contact_attempt(${r.application_id}, 'whatsapp', 'reached', 'Conversamos sobre o plano.')`);
  const [a] = await sql`select first_contact_at from rtb.applications where id = ${r.application_id}`;
  expect(a!.first_contact_at).not.toBeNull();
});

test("fila de e-mail: só vira 'accepted' com id do provedor; 'delivered' só com o webhook", async () => {
  const uid = await createUser(sql, "mail");
  await onboard(sql, uid);
  const claimed = await asService(sql)((tx) => tx`select * from rtb.outbox_claim(10)`);
  expect(claimed.length).toBeGreaterThan(0);
  const id = claimed[0]!.id;
  await asService(sql)((tx) => tx`select rtb.outbox_result(${id}, true, 'resend', null, null)`);
  let [row] = await sql`select status from rtb.email_outbox where id = ${id}`;
  expect(row!.status).toBe("queued"); // ok sem id do provedor NÃO conta como enviado
  await sql`update rtb.email_outbox set next_attempt_at = now() where id = ${id}`;
  await asService(sql)((tx) => tx`select * from rtb.outbox_claim(10)`);
  await asService(sql)((tx) => tx`select rtb.outbox_result(${id}, true, 'resend', 'msg_123', null)`);
  [row] = await sql`select status, provider_message_id from rtb.email_outbox where id = ${id}`;
  expect(row).toMatchObject({ status: "accepted", provider_message_id: "msg_123" });
  await asService(sql)((tx) => tx`select rtb.outbox_provider_event('resend', 'evt_1', 'msg_123', 'email.delivered', '{}'::jsonb)`);
  [row] = await sql`select status from rtb.email_outbox where id = ${id}`;
  expect(row!.status).toBe("delivered");
});

test("pausa de automações suprime só e-mails de automação", async () => {
  const uid = await createUser(sql, "pausa");
  await onboard(sql, uid);
  await as(sql, admin)((tx) => tx`select rtb.set_automations_paused(${uid}, true)`);
  await sql`update rtb.message_templates set kind = 'automation' where key = 'reassessment_scheduled'`;
  await asService(sql)((tx) => tx`select rtb.queue_email(${uid}, 'reassessment_scheduled', '{}'::jsonb, 'auto-teste-1')`);
  await asService(sql)((tx) => tx`select rtb.queue_email(${uid}, 'technical_decision', '{}'::jsonb, 'trans-teste-1')`);
  const rows = await sql`select template_key, status from rtb.email_outbox where idempotency_key in ('auto-teste-1', 'trans-teste-1') order by template_key`;
  expect(rows).toEqual([
    { template_key: "reassessment_scheduled", status: "suppressed" },
    { template_key: "technical_decision", status: "queued" },
  ]);
});

test("limite de tentativas por janela", async () => {
  const hit = async () => (await asService(sql)((tx) => tx`select rtb.hit_rate_limit('teste:rl', 3, 60) as ok`))[0]!.ok;
  expect([await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false]);
});

test("último super_admin não pode remover o próprio papel", async () => {
  const [r] = await sql`select id from rtb.user_roles where user_id = ${admin} and role = 'super_admin'`;
  await rejects(as(sql, admin)((tx) => tx`select rtb.revoke_role(${r!.id}, 'saindo')`), "last_super_admin");
});

test("mudança de configuração entra na auditoria com quem mudou", async () => {
  await as(sql, admin)((tx) => tx`update rtb.feature_flags set enabled = true where key = 'analytics'`);
  const [log] = await sql`select actor_id, action, entity, data from rtb.audit_logs where entity = 'feature_flags' order by id desc limit 1`;
  expect(log).toMatchObject({ actor_id: admin, action: "update", entity: "feature_flags" });
  expect(log!.data.changed).toContain("enabled");
});
