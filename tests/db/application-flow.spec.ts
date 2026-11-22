import { expect, test } from "@playwright/test";
import { apply, as, createUser, daysAgo, decide, freshDb, grant, key, onboard, rejects, state, verify, type Sql } from "./helpers";

test.describe.configure({ mode: "serial" });

let sql: Sql;
let tech: string, verifier: string, admin: string, coach: string, commercial: string;

test.beforeAll(async () => {
  sql = await freshDb("flow");
  [tech, verifier, admin, coach, commercial] = (await Promise.all(["tech", "verif", "admin", "coach", "comm"].map((l) => createUser(sql, l)))) as [string, string, string, string, string];
  await grant(sql, tech, "technical_director");
  await grant(sql, verifier, "membership_verifier");
  await grant(sql, admin, "super_admin");
  await grant(sql, coach, "coach");
  await grant(sql, commercial, "commercial");
});
test.afterAll(async () => sql?.end());

async function athlete(label: string, opts: Parameters<typeof onboard>[2] = {}) {
  const uid = await createUser(sql, label);
  await onboard(sql, uid, opts);
  return uid;
}

test("passaporte emitido com número próprio, carimbo e e-mail na fila", async () => {
  const uid = await athlete("pass");
  const [p] = await sql`select passport_number, passport_token from rtb.profiles where user_id = ${uid}`;
  expect(p!.passport_number).toMatch(/^RTB28-\d{5}$/);
  expect(p!.passport_token).toMatch(/^[0-9a-f]{32}$/);
  const stamps = await sql`select b.slug from rtb.earned_badges e join rtb.badge_definitions b on b.id = e.badge_id where e.user_id = ${uid}`;
  expect(stamps.map((s) => s.slug)).toContain("passaporte-emitido");
  const [o] = await sql`select status, template_key from rtb.email_outbox where user_id = ${uid}`;
  expect(o).toMatchObject({ status: "queued", template_key: "account_created" });
});

test("cenário 3 · autodeclarado 'Sim' fica PENDENTE e sem nenhum acesso extra", async () => {
  const uid = await athlete("decl", { membership: "SIM_ATUAL" });
  const s = await state(sql, uid);
  expect(s).toMatchObject({ membership_declared: "SIM_ATUAL", membership_verified: "PENDENTE", access_status: "CANDIDATE_ONLY", journey_status: "NONE" });
});

test("triagem: na régua → elegível preliminar (sem SLA)", async () => {
  const uid = await athlete("eleg"); // M, 37 anos em 17/04/2028 → índice 3:00:00
  const r = await apply(sql, uid, { seconds: 10800 + 14 * 60 });
  expect(r.status).toBe("PRELIM_ELIGIBLE");
  expect(r.sla_due_at).toBeNull();
});

test("triagem: maratona 16 min acima → Quase lá, com SLA de 3 dias úteis", async () => {
  const uid = await athlete("quase");
  const r = await apply(sql, uid, { seconds: 10800 + 16 * 60 });
  expect(r.status).toBe("PRELIM_ALMOST");
  expect(r.sla_due_at).not.toBeNull();
  const [a] = await sql`select prelim_reasons, age_group, standard_seconds from rtb.applications where id = ${r.application_id}`;
  expect(a!.prelim_reasons).toEqual(["mark_outside_margin"]);
  expect(a!.age_group).toBe("35-39");
  expect(a!.standard_seconds).toBe(10800);
});

test("triagem: meia ×2 até 5 min acima → elegível; 6 min → Quase lá", async () => {
  const ok = await apply(sql, await athlete("meia-ok"), { distance: "HALF", seconds: (10800 + 300) / 2 });
  expect(ok.status).toBe("PRELIM_ELIGIBLE");
  const almost = await apply(sql, await athlete("meia-quase"), { distance: "HALF", seconds: (10800 + 360) / 2 });
  expect(almost.status).toBe("PRELIM_ALMOST");
});

test("triagem: sem prova alvo, poucos treinos, marca antiga → Quase lá com todos os motivos", async () => {
  const uid = await athlete("varios");
  const r = await apply(sql, uid, { target: "NONE", sessions: false, markDate: daysAgo(800) });
  expect(r.status).toBe("PRELIM_ALMOST");
  const [a] = await sql`select prelim_reasons from rtb.applications where id = ${r.application_id}`;
  expect(a!.prelim_reasons).toEqual(expect.arrayContaining(["no_target_race", "frequency_below_min", "mark_not_recent"]));
});

test("cenário 10 · lesão em tratamento → Agora não, mesmo com marca boa; sem oferta de treino", async () => {
  const uid = await athlete("lesao");
  const r = await apply(sql, uid, { injury: true, seconds: 10000 });
  expect(r.status).toBe("PRELIM_NOT_NOW");
  await rejects(decide(sql, tech, r.application_id, "FORWARD_NEXT"), "invalid_transition");
  await rejects(decide(sql, tech, r.application_id, "APPROVE_ROAD"), "invalid_transition");
  expect(await sql`select * from rtb.journey_enrollments where user_id = ${uid}`).toHaveLength(0);
  const k = await decide(sql, tech, r.application_id, "KEEP_MONITORING", { nextOn: daysAgo(-60) });
  expect(k.to_status).toBe("REASSESSMENT_PENDING");
});

test("para-atleta → revisão humana (UNDER_REVIEW) com SLA", async () => {
  const uid = await athlete("para", { category: "OTHER" });
  const r = await apply(sql, uid);
  expect(r.status).toBe("UNDER_REVIEW");
  expect(r.sla_due_at).not.toBeNull();
});

test("idade mínima: 17 anos no dia da prova → Agora não", async () => {
  const uid = await athlete("jovem", { birth: "2010-05-01" });
  const r = await apply(sql, uid);
  expect(r.status).toBe("PRELIM_NOT_NOW");
});

test("cenário 11 · reenvio com a mesma chave é idempotente; outra chave = candidatura duplicada recusada", async () => {
  const uid = await athlete("dup");
  const k = key();
  const first = await apply(sql, uid, {}, k);
  const replay = await apply(sql, uid, {}, k);
  expect(replay.replayed).toBe(true);
  expect(replay.application_id).toBe(first.application_id);
  await rejects(apply(sql, uid), "application_already_submitted");
  expect(await sql`select * from rtb.applications where user_id = ${uid}`).toHaveLength(1);
});

test("candidatura exige consentimento de dados de saúde", async () => {
  const uid = await createUser(sql, "semconsent");
  await as(sql, uid)(async (tx) => {
    await tx`select rtb.save_my_profile(${tx.json({ full_name: "Sem Consentimento", birth_date: "1990-01-01", reference_category: "F", cep: "70150900" })})`;
  });
  await rejects(apply(sql, uid), "health_consent_required");
});

test("cadastro exige CEP com 8 números, também no banco", async () => {
  const uid = await createUser(sql, "semcep");
  const base = { full_name: "Sem Cep Teste", birth_date: "1990-01-01", reference_category: "F", city: "Brasília", uf: "DF" };
  await rejects(as(sql, uid)((tx) => tx`select rtb.save_my_profile(${tx.json(base)})`), "cep_required");
  await rejects(as(sql, uid)((tx) => tx`select rtb.save_my_profile(${tx.json({ ...base, cep: "7015090" })})`), "cep_required");
  await rejects(as(sql, uid)((tx) => tx`select rtb.save_my_profile(${tx.json({ ...base, cep: "abc" })})`), "cep_required");
  expect(await sql`select 1 from rtb.profiles where user_id = ${uid}`).toHaveLength(0);
  await as(sql, uid)((tx) => tx`select rtb.save_my_profile(${tx.json({ ...base, cep: "70150-900" })})`);
  const [p] = await sql`select cep from rtb.profiles where user_id = ${uid}`;
  expect(p!.cep).toBe("70150900");
});

test("cenário 6 · Quase lá sem decisão: nenhuma jornada, nenhum NEXT; aceitar é impossível", async () => {
  const uid = await athlete("q6");
  const r = await apply(sql, uid, { seconds: 10800 + 20 * 60 });
  expect(r.status).toBe("PRELIM_ALMOST");
  expect(await sql`select * from rtb.journey_enrollments where user_id = ${uid}`).toHaveLength(0);
  // Nem a chave de serviço consegue criar jornada sem decisão técnica humana:
  await rejects(sql`insert into rtb.journey_enrollments (user_id, application_id, cycle_id, journey, status, decision_id)
    select ${uid}, ${r.application_id}, cycle_id, 'BORA_NEXT', 'OFFERED', gen_random_uuid() from rtb.applications where id = ${r.application_id}`, /foreign key|enrollment_requires_decision/);
});

test("só technical_director decide: super_admin, treinador e comercial são recusados", async () => {
  const uid = await athlete("quem");
  const r = await apply(sql, uid, { seconds: 10800 + 20 * 60 });
  await rejects(decide(sql, admin, r.application_id, "FORWARD_NEXT"), "forbidden_technical_decision");
  await rejects(decide(sql, coach, r.application_id, "FORWARD_NEXT"), "forbidden_technical_decision");
  await rejects(decide(sql, commercial, r.application_id, "APPROVE_ROAD"), "forbidden_technical_decision");
});

test("decisão exige motivo e próximo passo", async () => {
  const uid = await athlete("motivo");
  const r = await apply(sql, uid);
  await rejects(as(sql, tech)((tx) => tx`select rtb.record_technical_decision(${r.application_id}, 'APPROVE_ROAD', '', 'algo', null, null, ${key()})`), "reason_required");
  await rejects(as(sql, tech)((tx) => tx`select rtb.record_technical_decision(${r.application_id}, 'APPROVE_ROAD', 'motivo ok', '', null, null, ${key()})`), "next_step_required");
});

test("cenário 4 · aluno confirmado + aprovado = Road ativo, sem cobrança, com carimbo", async () => {
  const uid = await athlete("road-membro", { membership: "SIM_ATUAL" });
  await verify(sql, verifier, uid, "ATIVO_CONFIRMADO");
  const r = await apply(sql, uid);
  const d = await decide(sql, tech, r.application_id, "APPROVE_ROAD");
  expect(d).toMatchObject({ to_status: "TECH_APPROVED", enrollment_status: "ACTIVE" });
  expect(await state(sql, uid)).toMatchObject({ access_status: "ACTIVE_MEMBER", journey_status: "ROAD_TO_BOSTON" });
  expect(await sql`select * from rtb.commercial_opportunities where user_id = ${uid}`).toHaveLength(0);
  const stamps = await sql`select b.slug from rtb.earned_badges e join rtb.badge_definitions b on b.id = e.badge_id where e.user_id = ${uid}`;
  expect(stamps.map((s) => s.slug)).toContain("road-to-boston");
});

test("cenário 5 · não aluno + aprovado = aguarda matrícula, oportunidade comercial, sem metas", async () => {
  const uid = await athlete("road-nao", { membership: "NAO" });
  const r = await apply(sql, uid);
  const d = await decide(sql, tech, r.application_id, "APPROVE_ROAD");
  expect(d.enrollment_status).toBe("PENDING_ENROLLMENT");
  expect(await state(sql, uid)).toMatchObject({ access_status: "PENDING_ENROLLMENT", journey_status: "NONE" });
  const [o] = await sql`select origin, status from rtb.commercial_opportunities where user_id = ${uid}`;
  expect(o).toMatchObject({ origin: "ROAD_APPROVED_NON_MEMBER", status: "OPEN" });
  await rejects(as(sql, tech)((tx) => tx`select rtb.save_training_goal(null, ${uid}, ${tx.json({ title: "Meta" })})`), "no_active_journey");
  // Comercial agora enxerga esse atleta (e só ele).
  await as(sql, commercial)(async (tx) => expect((await tx`select user_id from rtb.profiles`).map((p) => p.user_id)).toEqual([uid]));
  // Comercial não marca "ganho" sem matrícula verificada.
  const [opp] = await sql`select id from rtb.commercial_opportunities where user_id = ${uid}`;
  await rejects(as(sql, commercial)((tx) => tx`select rtb.update_opportunity(${opp!.id}, 'WON', null, null, null, 'fechou', null)`), "won_requires_verified_enrollment");
});

test("cenário 7 · NEXT: aluno confirmado aceita e entra; não aluno só entra após matrícula", async () => {
  const membro = await athlete("next-membro", { membership: "SIM_ATUAL" });
  await verify(sql, verifier, membro, "ATIVO_CONFIRMADO");
  const r1 = await apply(sql, membro, { seconds: 10800 + 25 * 60 });
  expect(r1.status).toBe("PRELIM_ALMOST");
  const d1 = await decide(sql, tech, r1.application_id, "FORWARD_NEXT");
  expect(d1).toMatchObject({ to_status: "REASSESSMENT_PENDING", enrollment_status: "OFFERED" });
  await as(sql, membro)((tx) => tx`select rtb.accept_journey(${d1.enrollment_id})`);
  expect(await state(sql, membro)).toMatchObject({ journey_status: "BORA_NEXT", access_status: "ACTIVE_MEMBER" });
  const [re] = await sql`select scheduled_for from rtb.reassessments where user_id = ${membro} and status = 'SCHEDULED'`;
  expect(re).toBeTruthy();

  const naoAluno = await athlete("next-nao", { membership: "NAO" });
  const r2 = await apply(sql, naoAluno, { seconds: 10800 + 25 * 60 });
  const d2 = await decide(sql, tech, r2.application_id, "FORWARD_NEXT");
  expect(d2.enrollment_status).toBe("PENDING_ENROLLMENT");
  await rejects(as(sql, naoAluno)((tx) => tx`select rtb.accept_journey(${d2.enrollment_id})`), "not_offered");
  await verify(sql, verifier, naoAluno, "ATIVO_CONFIRMADO");
  const [e] = await sql`select status from rtb.journey_enrollments where id = ${d2.enrollment_id}`;
  expect(e!.status).toBe("OFFERED");
  await as(sql, naoAluno)((tx) => tx`select rtb.accept_journey(${d2.enrollment_id})`);
  expect(await state(sql, naoAluno)).toMatchObject({ journey_status: "BORA_NEXT" });
  const [o] = await sql`select status from rtb.commercial_opportunities where user_id = ${naoAluno}`;
  expect(o!.status).toBe("WON");
});

test("cenário 8 · pedido de informações e resposta do candidato", async () => {
  const uid = await athlete("info");
  const r = await apply(sql, uid, { seconds: 10800 + 18 * 60 });
  const d = await decide(sql, tech, r.application_id, "REQUEST_INFO", { message: "Envie o link do resultado oficial da sua maratona." });
  expect(d.to_status).toBe("NEEDS_INFO");
  const [req] = await as(sql, uid)((tx) => tx`select id, message from rtb.info_requests`);
  expect(req!.message).toContain("resultado oficial");
  await as(sql, uid)((tx) => tx`select rtb.respond_info_request(${req!.id}, 'Segue o link: resultado oficial publicado.', null)`);
  const [a] = await sql`select status from rtb.applications where id = ${r.application_id}`;
  expect(a!.status).toBe("UNDER_REVIEW");
  await rejects(decide(sql, tech, r.application_id, "REQUEST_INFO"), "message_required_for_info_request");
});

test("cenário 9 · manter em acompanhamento agenda reavaliação", async () => {
  const uid = await athlete("acomp");
  const r = await apply(sql, uid, { seconds: 10800 + 30 * 60 });
  const d = await decide(sql, tech, r.application_id, "KEEP_MONITORING", { nextOn: daysAgo(-45) });
  expect(d.to_status).toBe("REASSESSMENT_PENDING");
  const [re] = await sql`select scheduled_for::text as d from rtb.reassessments where application_id = ${r.application_id} and status = 'SCHEDULED'`;
  expect(re!.d).toBe(daysAgo(-45));
});

test("reversão: aprovação vira não aprovação sem apagar a decisão anterior", async () => {
  const uid = await athlete("rev", { membership: "SIM_ATUAL" });
  await verify(sql, verifier, uid, "ATIVO_CONFIRMADO");
  const r = await apply(sql, uid);
  await decide(sql, tech, r.application_id, "APPROVE_ROAD");
  await decide(sql, tech, r.application_id, "NOT_APPROVED");
  const decisions = await sql`select decision, supersedes_id from rtb.technical_decisions where application_id = ${r.application_id} order by created_at`;
  expect(decisions.map((d) => d.decision)).toEqual(["APPROVE_ROAD", "NOT_APPROVED"]);
  expect(decisions[1]!.supersedes_id).not.toBeNull();
  const journeys = await sql`select status from rtb.journey_enrollments where application_id = ${r.application_id}`;
  expect(journeys.map((j) => j.status)).toEqual(["CANCELLED"]);
  expect(await state(sql, uid)).toMatchObject({ journey_status: "NONE", access_status: "ACTIVE_MEMBER" });
  await rejects(sql`update rtb.technical_decisions set reason = 'apagar' where application_id = ${r.application_id}`, "immutable_history");
});

test("decisão idempotente: mesma chave não duplica", async () => {
  const uid = await athlete("idem-dec");
  const r = await apply(sql, uid, { seconds: 10800 + 25 * 60 });
  const k = key();
  const a = await decide(sql, tech, r.application_id, "KEEP_MONITORING", {}, k);
  const b = await decide(sql, tech, r.application_id, "KEEP_MONITORING", {}, k);
  expect(b.replayed).toBe(true);
  expect(b.decision_id).toBe(a.decision_id);
});

test("cenário 16 · aluno sai: jornada pausada, metas somem, histórico fica; volta: reativa", async () => {
  const uid = await athlete("sai", { membership: "SIM_ATUAL" });
  await verify(sql, verifier, uid, "ATIVO_CONFIRMADO");
  const r = await apply(sql, uid);
  await decide(sql, tech, r.application_id, "APPROVE_ROAD");
  await as(sql, tech)((tx) => tx`select rtb.save_training_goal(null, ${uid}, ${tx.json({ title: "Sub 3h05 na prova alvo", target_distance: "MARATHON", target_seconds: 11100 })})`);
  expect(await as(sql, uid)((tx) => tx`select * from rtb.training_goals`)).toHaveLength(1);

  await verify(sql, verifier, uid, "EX_ALUNO_CONFIRMADO");
  expect(await state(sql, uid)).toMatchObject({ access_status: "SUSPENDED", journey_status: "PAUSED" });
  expect(await as(sql, uid)((tx) => tx`select * from rtb.training_goals`)).toHaveLength(0);
  const [j] = await sql`select status from rtb.journey_enrollments where user_id = ${uid}`;
  expect(j!.status).toBe("PAUSED");

  await verify(sql, verifier, uid, "ATIVO_CONFIRMADO");
  expect(await state(sql, uid)).toMatchObject({ access_status: "ACTIVE_MEMBER", journey_status: "ROAD_TO_BOSTON" });
  expect(await as(sql, uid)((tx) => tx`select * from rtb.training_goals`)).toHaveLength(1);
  expect(await sql`select * from rtb.membership_verifications where user_id = ${uid}`).toHaveLength(3);
});

test("verificador com escopo de polo não verifica atleta de outro polo", async () => {
  const scoped = await createUser(sql, "verif-bh");
  await grant(sql, scoped, "membership_verifier", { polo: "BH" });
  const uid = await athlete("polo-df");
  await as(sql, admin)((tx) => tx`select rtb.set_athlete_polo(${uid}, 'DF')`);
  await rejects(verify(sql, scoped, uid, "ATIVO_CONFIRMADO"), "forbidden_scope");
});

test("atleta vê a própria cronologia só com eventos públicos", async () => {
  const uid = await athlete("timeline");
  await apply(sql, uid, { seconds: 10800 + 20 * 60 });
  const mine = await as(sql, uid)((tx) => tx`select type, visibility from rtb.application_events`);
  expect(mine.every((e) => e.visibility === "athlete")).toBe(true);
  expect(mine.map((e) => e.type)).toContain("application.submitted");
  expect(mine.map((e) => e.type)).not.toContain("application.triaged");
});
