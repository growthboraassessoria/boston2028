import { expect, test } from "@playwright/test";
import { as, asAnon, asService, createUser, freshDb, rejects, type Sql } from "./helpers";

// Login com CPF + senha: o CPF fica em rtb.login_identities e o código de troca de senha em rtb.password_resets.
test.describe.configure({ mode: "serial" });

let sql: Sql;
let ana: string;
let bia: string;

test.beforeAll(async () => {
  sql = await freshDb("login");
  ana = await createUser(sql, "ana");
  bia = await createUser(sql, "bia");
  await asService(sql)((tx) => tx`insert into rtb.login_identities (user_id, cpf) values (${ana}, '52998224725'), (${bia}, '12345600191')`);
});

test.afterAll(async () => sql?.end());

test("titular vê só o próprio CPF; anônimo não vê nenhum", async () => {
  const mine = await as(sql, ana)((tx) => tx`select user_id, cpf from rtb.login_identities`);
  expect(mine).toHaveLength(1);
  expect(mine[0]!.cpf).toBe("52998224725");
  await rejects(asAnon(sql)((tx) => tx`select cpf from rtb.login_identities`), /permission denied/);
});

test("ninguém pela sessão grava CPF nem lê códigos de troca de senha", async () => {
  await rejects(as(sql, ana)((tx) => tx`update rtb.login_identities set cpf = '11144477735' where user_id = ${ana}`), /permission denied/);
  await rejects(as(sql, ana)((tx) => tx`insert into rtb.login_identities (user_id, cpf) values (${ana}, '11144477735')`), /permission denied/);
  await rejects(as(sql, ana)((tx) => tx`select * from rtb.password_resets`), /permission denied/);
  await rejects(asAnon(sql)((tx) => tx`select * from rtb.password_resets`), /permission denied/);
});

test("um CPF por conta e uma conta por CPF; formato só com 11 números", async () => {
  const c = await createUser(sql, "c");
  const d = await createUser(sql, "d");
  await rejects(asService(sql)((tx) => tx`insert into rtb.login_identities (user_id, cpf) values (${c}, '52998224725')`), /duplicate key/);
  await rejects(asService(sql)((tx) => tx`insert into rtb.login_identities (user_id, cpf) values (${ana}, '11144477735')`), /duplicate key/);
  await rejects(asService(sql)((tx) => tx`insert into rtb.login_identities (user_id, cpf) values (${d}, '529.982.247-25')`), /check constraint/);
});

test("código de troca de senha guardado como hash (bcrypt) e conferido no banco", async () => {
  await asService(sql)((tx) => tx`insert into rtb.password_resets (user_id, code_hash, expires_at)
    values (${ana}, extensions.crypt('123456', extensions.gen_salt('bf', 8)), now() + interval '15 minutes')`);
  const [r] = await asService(sql)((tx) => tx`select code_hash, code_hash = extensions.crypt('123456', code_hash) as ok,
    code_hash = extensions.crypt('654321', code_hash) as wrong from rtb.password_resets where user_id = ${ana}`);
  expect(r!.code_hash).not.toContain("123456");
  expect(r!.ok).toBe(true);
  expect(r!.wrong).toBe(false);
});
