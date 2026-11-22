// CPF: normalização, validação dos dígitos verificadores e máscara. Sem dependências (roda no servidor e no navegador).

export function cpfDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function checkDigit(base: string): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (base.length + 1 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}

/** true para CPF com 11 números e dígitos verificadores corretos (recusa sequências como 111.111.111-11). */
export function isValidCpf(raw: string): boolean {
  const d = cpfDigits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const d1 = checkDigit(d.slice(0, 9));
  const d2 = checkDigit(d.slice(0, 9) + d1);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

/** 000.000.000-00, aplicada conforme a pessoa digita. */
export function formatCpf(raw: string): string {
  const d = cpfDigits(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Completa 9 números com os dígitos verificadores (testes e dados de demonstração). */
export function cpfFromBase(base9: string): string {
  const b = cpfDigits(base9).padStart(9, "0").slice(-9);
  const d1 = checkDigit(b);
  return b + d1 + checkDigit(b + d1);
}

/** Regra de senha do Passport: 8 a 72 caracteres, com letra e número. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (pw.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}
