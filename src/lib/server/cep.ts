// Busca de CEP no servidor: fontes públicas (src/lib/domain/cep.ts), cache curto em memória e um modo de teste.
// Vai só o CEP (8 números) para as fontes: nada de nome, e-mail ou telefone.
// CEP_DRIVER=fixture só vale com o login local (testes ponta a ponta sem rede); na Vercel o login local é recusado.
import "server-only";
import { authDriver } from "@/lib/auth/session";
import { findCep, type CepOutcome } from "@/lib/domain/cep";

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;
const memory = new Map<string, { until: number; outcome: CepOutcome }>();

// CEPs públicos (praça e avenida), sem dado de ninguém.
const FIXTURE: Record<string, CepOutcome> = {
  "70150900": {
    status: "found",
    address: { cep: "70150900", street: "Praça dos Três Poderes", neighborhood: "Zona Cívico-Administrativa", city: "Brasília", uf: "DF", source: "viacep" },
  },
  "01310100": {
    status: "found",
    address: { cep: "01310100", street: "Avenida Paulista", neighborhood: "Bela Vista", city: "São Paulo", uf: "SP", source: "viacep" },
  },
  "99999990": { status: "unavailable" }, // simula as três fontes fora do ar
};

export function cepDriver(): "live" | "fixture" {
  return process.env.CEP_DRIVER === "fixture" && authDriver() === "local" ? "fixture" : "live";
}

export async function lookupCepServer(digits: string): Promise<CepOutcome> {
  if (cepDriver() === "fixture") return FIXTURE[digits] ?? { status: "not_found" };
  const hit = memory.get(digits);
  if (hit && hit.until > Date.now()) return hit.outcome;
  const outcome = await findCep(digits, (url, init) => fetch(url, { ...init, cache: "no-store" }));
  // Só guarda resposta definitiva; "fora do ar" tenta de novo na próxima vez.
  if (outcome.status === "found" || outcome.status === "not_found") {
    if (memory.size >= MAX_ENTRIES) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    memory.set(digits, { until: Date.now() + (outcome.status === "found" ? FOUND_TTL_MS : NOT_FOUND_TTL_MS), outcome });
  }
  return outcome;
}
