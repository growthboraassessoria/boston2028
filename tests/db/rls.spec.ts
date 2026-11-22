import { expect, test } from "@playwright/test";
import { apply, as, asAnon, createUser, freshDb, grant, key, onboard, rejects, type Sql } from "./helpers";

test.describe.configure({ mode: "serial" });

let sql: Sql;
let athleteA: string, athleteB: string, tech: string, commercial: string, verifier: string, admin: string, growth: string, coach: string;

test.beforeAll(async () => {
  sql = await freshDb("rls");
  [athleteA, athleteB, tech, commercial, verifier, admin, growth, coach] = (await Promise.all(["a", "b", "tech", "comm", "verif", "admin", "growth", "coach"].map((l) => createUser(sql, l)),)) as [string, string, string, string, string, string, string, string];
  await grant(sql, tech, "technical_director");
  await grant(sql, commercial, "commercial");
  await grant(sql, verifier, "membership_verifier");
  await grant(sql, admin, "super_admin");
  await grant(sql, growth, "growth");
  await grant(sql, coach, "coach");
  await onboard(sql, athleteA);
  await onboard(sql, athleteB);
  await apply(sql, athleteA, { injury: true });
  await apply(sql, athleteB);
});
test.afterAll(async () => sql?.end());

test("cenário 20 · atleta não vê perfil, candidatura, saúde nem estado de outro atleta", async () => {
  await as(sql, athleteA)(async (tx) => {
    const profiles = await tx`select user_id from rtb.profiles`;
    expect(profiles.map((r) => r.user_id)).toEqual([athleteA]);
    const apps = await tx`select user_id from rtb.applications`;
    expect(apps.map((r) => r.user_id)).toEqual([athleteA]);
    const health = await tx`select user_id from rtb.application_health`;
    expect(health.map((r) => r.user_id)).toEqual([athleteA]);
    const states = await tx`select user_id from rtb.athlete_states`;
    expect(states).toHaveLength(1);
    expect(await tx`select 1 from rtb.profiles where user_id = ${athleteB}`).toHaveLength(0);
  });
});

test("atleta não consegue escrever direto nas tabelas (só pelas funções)", async () => {
  await rejects(as(sql, athleteA)((tx) => tx`update rtb.athlete_states set membership_verified = 'ATIVO_CONFIRMADO' where user_id = ${athleteA}`), "permission denied");
  await rejects(as(sql, athleteA)((tx) => tx`update rtb.applications set status = 'TECH_APPROVED' where user_id = ${athleteA}`), "permission denied");
  await rejects(as(sql, athleteA)((tx) => tx`insert into rtb.user_roles (user_id, role) values (${athleteA}, 'super_admin')`), "permission denied");
  await rejects(as(sql, athleteA)((tx) => tx`delete from rtb.audit_logs`), "permission denied");
});

test("cenário 20 · atleta não usa funções da equipe nem vê dados do OS", async () => {
  await rejects(as(sql, athleteA)((tx) => tx`select rtb.os_overview(now() - interval '30 days', now())`), "forbidden");
  await rejects(as(sql, athleteA)((tx) => tx`select rtb.verify_member_link(${athleteA}, 'ATIVO_CONFIRMADO', 'manual', 'eu mesmo', null)`), "forbidden");
  await rejects(as(sql, athleteA)((tx) => tx`select rtb.grant_role(${athleteA}, 'super_admin', null, null, 'tentativa')`), "forbidden");
  await as(sql, athleteA)(async (tx) => {
    expect(await tx`select * from rtb.os_candidates`).toHaveLength(1);
    expect(await tx`select * from rtb.audit_logs`).toHaveLength(0);
    expect(await tx`select * from rtb.user_roles`).toHaveLength(0);
  });
});

test("saúde: só dono e coordenação técnica; nem comercial, verificador, growth ou super_admin", async () => {
  const count = async (uid: string) => (await as(sql, uid)((tx) => tx`select count(*)::int as n from rtb.application_health`))[0]!.n;
  expect(await count(tech)).toBe(2);
  expect(await count(commercial)).toBe(0);
  expect(await count(verifier)).toBe(0);
  expect(await count(growth)).toBe(0);
  expect(await count(admin)).toBe(0);
  expect(await count(coach)).toBe(0);
});

test("comercial só vê atletas com oportunidade comercial (nenhuma ainda)", async () => {
  await as(sql, commercial)(async (tx) => {
    expect(await tx`select * from rtb.profiles`).toHaveLength(0);
    expect(await tx`select * from rtb.applications`).toHaveLength(0);
  });
});

test("treinador só vê atletas atribuídos", async () => {
  await as(sql, coach)(async (tx) => expect(await tx`select * from rtb.profiles`).toHaveLength(0));
  await as(sql, tech)((tx) => tx`select rtb.assign_coach(${athleteB}, ${coach})`);
  await as(sql, coach)(async (tx) => {
    const rows = await tx`select user_id from rtb.profiles`;
    expect(rows.map((r) => r.user_id)).toEqual([athleteB]);
    expect(await tx`select * from rtb.application_health`).toHaveLength(0);
  });
});

test("verificador de vínculo vê cadastro, mas não saúde nem decisões", async () => {
  await as(sql, verifier)(async (tx) => {
    expect((await tx`select * from rtb.profiles`).length).toBe(2);
    expect(await tx`select * from rtb.technical_decisions`).toHaveLength(0);
  });
});

test("visitante (anon) só lê views públicas", async () => {
  await asAnon(sql)(async (tx) => {
    const std = await tx`select count(*)::int as n from rtb.v_public_standards`;
    expect(std[0]!.n).toBe(33);
    expect((await tx`select * from rtb.v_public_races`).length).toBe(3);
  });
  await rejects(asAnon(sql)((tx) => tx`select * from rtb.profiles`), "permission denied");
  await rejects(asAnon(sql)((tx) => tx`select * from rtb.benefits`), "permission denied");
  await rejects(asAnon(sql)((tx) => tx`select rtb.submit_application('{}'::jsonb, ${key()})`), "permission denied");
});

test("ranking público fica vazio com o flag desligado", async () => {
  await asAnon(sql)(async (tx) => expect(await tx`select * from rtb.v_public_ranking`).toHaveLength(0));
});

test("papéis: nenhum privilégio por nome ou e-mail, só por atribuição", async () => {
  const lucas = await createUser(sql, "lucas.resende");
  await onboard(sql, lucas);
  const [app] = await sql`select id from rtb.applications limit 1`;
  await rejects(as(sql, lucas)((tx) => tx`select rtb.start_review(${app!.id})`), "forbidden");
});

test("busca de conta por e-mail: só a chave de serviço (nem atleta nem super_admin direto)", async () => {
  await rejects(as(sql, athleteA)((tx) => tx`select rtb.user_id_by_email('admin@rtb.local')`), "permission denied");
  await rejects(as(sql, admin)((tx) => tx`select rtb.user_id_by_email('admin@rtb.local')`), "permission denied");
  const [r] = await sql.begin(async (tx) => { await tx.unsafe("set local role service_role"); return tx`select rtb.user_id_by_email('nao-existe@rtb.local') as id`; });
  expect(r!.id).toBeNull();
});
