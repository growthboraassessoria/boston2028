import { expect, test } from "@playwright/test";
import { cpfDigits, cpfFromBase, formatCpf, isValidCpf, passwordProblem } from "../../src/lib/cpf";

test("CPF: aceita válidos com ou sem máscara e recusa dígito errado e sequências", () => {
  expect(isValidCpf("529.982.247-25")).toBe(true);
  expect(isValidCpf("52998224725")).toBe(true);
  expect(isValidCpf("529.982.247-24")).toBe(false);
  expect(isValidCpf("111.111.111-11")).toBe(false);
  expect(isValidCpf("123")).toBe(false);
  expect(isValidCpf("")).toBe(false);
});

test("CPF: máscara enquanto digita e só números no servidor", () => {
  expect(formatCpf("529")).toBe("529");
  expect(formatCpf("5299822")).toBe("529.982.2");
  expect(formatCpf("52998224725999")).toBe("529.982.247-25");
  expect(cpfDigits(" 529.982.247-25 ")).toBe("52998224725");
});

test("CPF: completa os dígitos verificadores (o seed usa a mesma conta em SQL)", () => {
  expect(cpfFromBase("529982247")).toBe("52998224725");
  for (let n = 1; n <= 20; n++) expect(isValidCpf(cpfFromBase(String(123456000 + n)))).toBe(true);
});

test("senha: mesma regra do Supabase Auth (12+, minúscula, maiúscula, número e símbolo)", () => {
  expect(passwordProblem("Curta@1")).toMatch(/12 caracteres/);
  expect(passwordProblem("QaBoston2028x")).toBe("Falta na senha: símbolo (como ! ou @).");
  expect(passwordProblem("boston@2028!")).toBe("Falta na senha: letra maiúscula.");
  expect(passwordProblem("BOSTON@2028!")).toBe("Falta na senha: letra minúscula.");
  expect(passwordProblem("Boston@Road!")).toBe("Falta na senha: número.");
  expect(passwordProblem("somenteletrasaqui")).toMatch(/maiúscula, número, símbolo/);
  expect(passwordProblem("Boston@2028!")).toBeNull();
  expect(passwordProblem("Ab1~cdefghij")).toBeNull();
  expect(passwordProblem("Aa1!".repeat(19))).toMatch(/72/);
});
