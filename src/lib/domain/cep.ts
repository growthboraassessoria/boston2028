// Busca de CEP em fontes públicas, nesta ordem: ViaCEP → BrasilAPI → OpenCEP.
// Pura: recebe o fetch, para testar sem rede. Quem chama é o servidor (src/lib/server/cep.ts).
// As bases discordam (um CEP que o ViaCEP não tem pode estar na BrasilAPI), então "não achei" também passa para a próxima.
import { UF_LIST } from "../validation/profile";

export type Uf = (typeof UF_LIST)[number];
export type CepSource = "viacep" | "brasilapi" | "opencep";
export type CepAddress = { cep: string; street: string | null; neighborhood: string | null; city: string; uf: Uf; source: CepSource };
export type CepOutcome =
  | { status: "found"; address: CepAddress }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "invalid" };

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; json(): Promise<unknown> }>;

type Answer = { kind: "found"; address: CepAddress } | { kind: "not_found" } | { kind: "error" };
type Body = Record<string, unknown> | null;
type Source = { name: CepSource; url: (cep: string) => string; read: (status: number, body: Body, cep: string) => Answer };

export const cepDigits = (v: string) => String(v ?? "").replace(/\D/g, "");

/** Máscara 00000-000 enquanto a pessoa digita (no máximo 8 números). */
export function formatCep(v: string): string {
  const d = cepDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function address(cep: string, source: CepSource, street: unknown, neighborhood: unknown, city: unknown, uf: unknown): Answer {
  const c = text(city);
  const u = text(uf)?.toUpperCase();
  // Resposta sem cidade ou com UF estranha não serve: conta como falha da fonte e tenta a próxima.
  if (!c || !u || !(UF_LIST as readonly string[]).includes(u)) return { kind: "error" };
  return { kind: "found", address: { cep, street: text(street), neighborhood: text(neighborhood), city: c, uf: u as Uf, source } };
}

export const CEP_SOURCES: readonly Source[] = [
  {
    name: "viacep",
    url: (cep) => `https://viacep.com.br/ws/${cep}/json/`,
    // Responde 200 com { "erro": "true" } (texto ou booleano) quando o CEP não existe.
    read: (status, b, cep) => {
      if (status === 400) return { kind: "not_found" };
      if (status !== 200 || !b) return { kind: "error" };
      if (b.erro === true || b.erro === "true") return { kind: "not_found" };
      return address(cep, "viacep", b.logradouro, b.bairro, b.localidade, b.uf);
    },
  },
  {
    name: "brasilapi",
    url: (cep) => `https://brasilapi.com.br/api/cep/v1/${cep}`,
    read: (status, b, cep) => {
      if (status === 404) return { kind: "not_found" };
      if (status !== 200 || !b) return { kind: "error" };
      return address(cep, "brasilapi", b.street, b.neighborhood, b.city, b.state);
    },
  },
  {
    name: "opencep",
    url: (cep) => `https://opencep.com/v1/${cep}`,
    read: (status, b, cep) => {
      if (status === 404) return { kind: "not_found" };
      if (status !== 200 || !b) return { kind: "error" };
      if (b.error) return { kind: "not_found" };
      return address(cep, "opencep", b.logradouro, b.bairro, b.localidade, b.uf);
    },
  },
];

async function ask(source: Source, cep: string, fetchLike: FetchLike, timeoutMs: number): Promise<Answer> {
  try {
    const r = await fetchLike(source.url(cep), { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    let body: Body = null;
    try {
      const j = await r.json();
      body = j && typeof j === "object" ? (j as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    return source.read(r.status, body, cep);
  } catch {
    return { kind: "error" }; // rede, tempo esgotado ou resposta quebrada
  }
}

/** A primeira fonte que achar vence. Sem achar: "not_found" se alguma disse que não existe; senão "unavailable". */
export async function findCep(
  raw: string,
  fetchLike: FetchLike,
  opts: { timeoutMs?: number; sources?: readonly Source[] } = {},
): Promise<CepOutcome> {
  const cep = cepDigits(raw);
  if (!/^\d{8}$/.test(cep)) return { status: "invalid" };
  let answered = false;
  for (const source of opts.sources ?? CEP_SOURCES) {
    const a = await ask(source, cep, fetchLike, opts.timeoutMs ?? 2500);
    if (a.kind === "found") return { status: "found", address: a.address };
    if (a.kind === "not_found") answered = true;
  }
  return answered ? { status: "not_found" } : { status: "unavailable" };
}

/** Texto curto para a pessoa confirmar o endereço achado. Rua e bairro só aparecem na tela: não são gravados. */
export function describeAddress(a: { street: string | null; neighborhood: string | null; city: string; uf: string }): string {
  const place = [a.street, a.neighborhood].filter(Boolean).join(", ");
  return place ? `${place} · ${a.city}/${a.uf}` : `${a.city}/${a.uf}`;
}
