import { expect, test } from "@playwright/test";
import { apply, as, createUser, decide, freshDb, grant, key, onboard, rejects, verify, type Sql } from "./helpers";

test.describe.configure({ mode: "serial" });

let sql: Sql;
let admin: string, tech: string, verifier: string, partnerA: string, partnerB: string;
let partnerAId: string, partnerBId: string;

test.beforeAll(async () => {
  sql = await freshDb("benefits");
  [admin, tech, verifier] = (await Promise.all(["admin", "tech", "verif"].map((l) => createUser(sql, l)))) as [string, string, string];
  await grant(sql, admin, "super_admin");
  await grant(sql, tech, "technical_director");
  await grant(sql, verifier, "membership_verifier");
  const [pa] = await as(sql, admin)((tx) => tx`insert into rtb.partners (slug, name, category, status) values ('loja-teste', 'Loja Teste', 'equipment', 'ACTIVE') returning id`);
  const [pb] = await as(sql, admin)((tx) => tx`insert into rtb.partners (slug, name, category, status) values ('fisio-teste', 'Fisio Teste', 'health_assessment', 'ACTIVE') returning id`);
  partnerAId = pa!.id; partnerBId = pb!.id;
  partnerA = await createUser(sql, "op-a");
  partnerB = await createUser(sql, "op-b");
  await grant(sql, partnerA, "partner_operator", { partnerId: partnerAId });
  await grant(sql, partnerB, "partner_operator", { partnerId: partnerBId });
});
test.afterAll(async () => sql?.end());

async function benefit(opts: { slug: string; mode?: string; total?: number | null; perMember?: number; scope?: string; requiresMember?: boolean; partner?: string; ttl?: number }) {
  const total = opts.total === undefined ? 10 : opts.total;
  const [b] = await as(sql, admin)((tx) => tx`
    insert into rtb.benefits (partner_id, slug, title, summary, category, journey_scope, requires_active_member, total_quantity,
      remaining_quantity, per_member_limit, mode, status, code_ttl_hours)
    values (${opts.partner ?? partnerAId}, ${opts.slug}, ${"Benefício " + opts.slug}, 'Resumo do benefício', 'equipment', ${opts.scope ?? "ANY"},
      ${opts.requiresMember ?? true}, ${total}, ${total}, ${opts.perMember ?? 1}, ${opts.mode ?? "QR_VALIDATION"}, 'ACTIVE', ${opts.ttl ?? 720})
    returning id`);
  return b!.id as string;
}

async function member(label: string, road = false) {
  const uid = await createUser(sql, label);
  await onboard(sql, uid, { membership: "SIM_ATUAL" });
  await verify(sql, verifier, uid, "ATIVO_CONFIRMADO");
  if (road) {
    const r = await apply(sql, uid);
    await decide(sql, tech, r.application_id, "APPROVE_ROAD");
  }
  return uid;
}

const claim = (uid: string, benefitId: string, k = key()) =>
  as(sql, uid)(async (tx) => (await tx`select rtb.claim_benefit(${benefitId}, ${k}, true) as r`)[0]!.r as { redemption_id: string; status: string; replayed: boolean });

test("cenário 12 · resgate elegível: código único, QR opaco, histórico e baixa de estoque", async () => {
  const uid = await member("res1");
  const b = await benefit({ slug: "tenis-10" });
  const r = await claim(uid, b);
  expect(r.status).toBe("ISSUED");
  const [sec] = await as(sql, uid)((tx) => tx`select display_code, qr_token from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  expect(sec!.display_code).toMatch(/^[A-Z2-9]{8}$/);
  expect(sec!.qr_token).toMatch(/^[0-9a-f]{40}$/);
  const [bb] = await sql`select remaining_quantity from rtb.benefits where id = ${b}`;
  expect(bb!.remaining_quantity).toBe(9);
  const events = await as(sql, uid)((tx) => tx`select type from rtb.redemption_events where redemption_id = ${r.redemption_id}`);
  expect(events.map((e) => e.type)).toEqual(["issued"]);
});

test("segredos: o atleta nunca lê cupom ou URL antes do resgate; outro atleta não vê o código", async () => {
  const uid = await member("seg");
  const other = await member("seg2");
  const b = await benefit({ slug: "cupom-x", mode: "COUPON" });
  await as(sql, admin)((tx) => tx`insert into rtb.benefit_secrets (benefit_id, coupon_code) values (${b}, 'BORA15')`);
  await as(sql, uid)(async (tx) => {
    expect(await tx`select * from rtb.benefit_secrets`).toHaveLength(0);
    expect(await tx`select * from rtb.benefits`).toHaveLength(0);
    const catalog = await tx`select * from rtb.my_benefit_catalog()`;
    expect(JSON.stringify(catalog)).not.toContain("BORA15");
  });
  const r = await claim(uid, b);
  const [mine] = await as(sql, uid)((tx) => tx`select display_code from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  expect(mine!.display_code).toBe("BORA15");
  expect(await as(sql, other)((tx) => tx`select * from rtb.redemption_secrets`)).toHaveLength(0);
});

test("cenário 13 · inelegível: sem vínculo ativo, jornada errada, limite e esgotado são negados sem emitir código", async () => {
  const candidate = await createUser(sql, "cand");
  await onboard(sql, candidate, { membership: "SIM_ATUAL" }); // autodeclarado, sem verificação
  const b = await benefit({ slug: "so-membro" });
  await rejects(claim(candidate, b), "not_eligible:requires_active_member");

  const m = await member("jornada");
  const roadOnly = await benefit({ slug: "so-road", scope: "ROAD" });
  await rejects(claim(m, roadOnly), "not_eligible:journey_mismatch");

  const once = await benefit({ slug: "uma-vez" });
  await claim(m, once);
  await rejects(claim(m, once), "not_eligible:pending_redemption");

  const none = await benefit({ slug: "esgotado", total: 0 });
  await rejects(claim(m, none), "not_eligible:sold_out");
  expect(await sql`select * from rtb.benefit_redemptions where benefit_id in (${b}, ${roadOnly}, ${none})`).toHaveLength(0);
});

test("benefício vencido ou ainda não iniciado é negado", async () => {
  const m = await member("datas");
  const b = await benefit({ slug: "vencido" });
  await sql`update rtb.benefits set starts_at = now() - interval '10 days', ends_at = now() - interval '1 day' where id = ${b}`;
  await rejects(claim(m, b), "not_eligible:ended");
  await sql`update rtb.benefits set starts_at = now() + interval '1 day', ends_at = null where id = ${b}`;
  await rejects(claim(m, b), "not_eligible:not_started");
});

test("cenário 14 · dois atletas disputam a última unidade ao mesmo tempo: só um vence", async () => {
  const atletas = await Promise.all(Array.from({ length: 8 }, (_, i) => member(`corrida${i}`)));
  const b = await benefit({ slug: "ultima-unidade", total: 1 });
  const results = await Promise.allSettled(atletas.map((uid) => claim(uid, b)));
  const ok = results.filter((r) => r.status === "fulfilled");
  const fail = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  expect(ok).toHaveLength(1);
  expect(fail).toHaveLength(7);
  expect(fail.every((f) => String(f.reason.message).includes("not_eligible:sold_out"))).toBe(true);
  const [bb] = await sql`select remaining_quantity from rtb.benefits where id = ${b}`;
  expect(bb!.remaining_quantity).toBe(0);
  expect(await sql`select * from rtb.benefit_redemptions where benefit_id = ${b}`).toHaveLength(1);
});

test("mesmo atleta clicando duas vezes ao mesmo tempo (chaves diferentes): um resgate só", async () => {
  const m = await member("duplo");
  const b = await benefit({ slug: "duplo-clique", total: 50, perMember: 1 });
  const results = await Promise.allSettled([claim(m, b), claim(m, b), claim(m, b)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await sql`select * from rtb.benefit_redemptions where benefit_id = ${b}`).toHaveLength(1);
});

test("idempotência do resgate: mesma chave devolve o mesmo resgate", async () => {
  const m = await member("idem");
  const b = await benefit({ slug: "idem" });
  const k = key();
  const a = await claim(m, b, k);
  const again = await claim(m, b, k);
  expect(again.replayed).toBe(true);
  expect(again.redemption_id).toBe(a.redemption_id);
});

test("cenário 15 · parceiro valida o QR uma vez; segunda validação falha; repetição com a mesma chave é idempotente", async () => {
  const m = await member("valida");
  const b = await benefit({ slug: "valida-qr" });
  const r = await claim(m, b);
  const [sec] = await as(sql, m)((tx) => tx`select qr_token from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  const k1 = key();
  const first = await as(sql, partnerA)(async (tx) => (await tx`select rtb.validate_redemption(${sec!.qr_token}, null, null, ${k1}) as r`)[0]!.r);
  expect(first).toMatchObject({ status: "REDEEMED", replayed: false });
  expect(String(first.member)).toMatch(/^Atleta S\.$/);
  const replay = await as(sql, partnerA)(async (tx) => (await tx`select rtb.validate_redemption(${sec!.qr_token}, null, null, ${k1}) as r`)[0]!.r);
  expect(replay).toMatchObject({ status: "REDEEMED", replayed: true });
  const second = await as(sql, partnerA)(async (tx) => (await tx`select rtb.validate_redemption(${sec!.qr_token}, null, null, ${key()}) as r`)[0]!.r);
  expect(second).toMatchObject({ status: "REJECTED", reason: "already_redeemed" });
});

test("parceiro errado não valida, não vê resgates de outro parceiro nem dados pessoais", async () => {
  const m = await member("outro-parceiro");
  const b = await benefit({ slug: "so-parceiro-a" });
  const r = await claim(m, b);
  const [sec] = await as(sql, m)((tx) => tx`select qr_token from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  await rejects(as(sql, partnerB)((tx) => tx`select rtb.validate_redemption(${sec!.qr_token}, null, null, ${key()})`), "forbidden_partner");
  await as(sql, partnerB)(async (tx) => {
    expect(await tx`select * from rtb.benefit_redemptions where benefit_id = ${b}`).toHaveLength(0);
    expect(await tx`select * from rtb.profiles`).toHaveLength(0);
    expect(await tx`select * from rtb.redemption_secrets`).toHaveLength(0);
  });
  await as(sql, partnerA)(async (tx) => {
    expect((await tx`select * from rtb.benefit_redemptions where benefit_id = ${b}`).length).toBe(1);
    expect(await tx`select * from rtb.profiles`).toHaveLength(0);
  });
});

test("código vencido não valida e o resgate fica EXPIRED", async () => {
  const m = await member("expira");
  const b = await benefit({ slug: "expira", ttl: 1 });
  const r = await claim(m, b);
  await sql`update rtb.benefit_redemptions set expires_at = now() - interval '1 minute' where id = ${r.redemption_id}`;
  const [sec] = await as(sql, m)((tx) => tx`select display_code from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  const res = await as(sql, partnerA)(async (tx) => (await tx`select rtb.validate_redemption(null, ${sec!.display_code}, ${b}, ${key()}) as r`)[0]!.r);
  expect(res).toMatchObject({ status: "REJECTED", reason: "expired" });
  const [row] = await sql`select status from rtb.benefit_redemptions where id = ${r.redemption_id}`;
  expect(row!.status).toBe("EXPIRED");
});

test("modo aprovação manual: reserva sem código até a equipe aprovar", async () => {
  const m = await member("manual");
  const b = await benefit({ slug: "manual", mode: "MANUAL_APPROVAL" });
  const r = await claim(m, b);
  expect(r.status).toBe("RESERVED");
  const [s1] = await as(sql, m)((tx) => tx`select display_code from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  expect(s1!.display_code).toBeNull();
  await as(sql, admin)((tx) => tx`select rtb.approve_manual_redemption(${r.redemption_id}, null)`);
  const [s2] = await as(sql, m)((tx) => tx`select display_code from rtb.redemption_secrets where redemption_id = ${r.redemption_id}`);
  expect(s2!.display_code).toMatch(/^BORA-/);
});

test("lote de códigos do parceiro: entrega em ordem e esgota quando acaba (sem gerar)", async () => {
  const m1 = await member("lote1");
  const m2 = await member("lote2");
  const b = await benefit({ slug: "lote", mode: "ONE_TIME_CODE" });
  await sql`update rtb.benefits set generate_codes = false where id = ${b}`;
  await as(sql, admin)((tx) => tx`select rtb.load_benefit_codes(${b}, array['PARC-0001'])`);
  const r1 = await claim(m1, b);
  const [c] = await as(sql, m1)((tx) => tx`select display_code from rtb.redemption_secrets where redemption_id = ${r1.redemption_id}`);
  expect(c!.display_code).toBe("PARC-0001");
  await rejects(claim(m2, b), "not_eligible:sold_out");
});

test("benefício só do Road: aprovado no Road resgata", async () => {
  const m = await member("road", true);
  const b = await benefit({ slug: "road-ok", scope: "ROAD" });
  expect((await claim(m, b)).status).toBe("ISSUED");
});

test("vitrine: bloqueado aparece com motivo só quando marcado como visível-bloqueado", async () => {
  const cand = await createUser(sql, "vitrine");
  await onboard(sql, cand);
  const hidden = await benefit({ slug: "escondido-sem-vinculo" });
  const locked = await benefit({ slug: "visivel-bloqueado" });
  await as(sql, admin)((tx) => tx`update rtb.benefits set visibility = 'VISIBLE_LOCKED' where id = ${locked}`);
  const rows = await as(sql, cand)((tx) => tx`select id, eligible, lock_reason from rtb.my_benefit_catalog()`);
  expect(rows.find((r) => r.id === hidden)).toBeUndefined();
  expect(rows.find((r) => r.id === locked)).toMatchObject({ eligible: false, lock_reason: "requires_active_member" });
});
