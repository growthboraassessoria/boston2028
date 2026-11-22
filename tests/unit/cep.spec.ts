import { expect, test } from "@playwright/test";
import { cepDigits, describeAddress, findCep, formatCep, type FetchLike } from "../../src/lib/domain/cep";
import { CepSchema } from "../../src/lib/validation/profile";

// Fontes falsas por domínio: cada uma responde, cai ou demora, sem rede de verdade.
type Reply = { status: number; body?: unknown } | "timeout" | "network";
const VIA = "viacep.com.br";
const BR = "brasilapi.com.br";
const OPEN = "opencep.com";

function fakeFetch(replies: Record<string, Reply>) {
  const calls: string[] = [];
  const f: FetchLike = async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    const r = replies[host];
    if (!r || r === "network") throw new TypeError("fetch failed");
    if (r === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return {
      status: r.status,
      json: async () => {
        if (r.body === undefined) throw new SyntaxError("Unexpected end of JSON input");
        return r.body;
      },
    };
  };
  return { f, calls };
}

test("CEP: máscara enquanto digita e só números para gravar", () => {
  expect(formatCep("70150")).toBe("70150");
  expect(formatCep("701509")).toBe("70150-9");
  expect(formatCep("70150900")).toBe("70150-900");
  expect(formatCep("70.150-900 ")).toBe("70150-900");
  expect(formatCep("7015090012")).toBe("70150-900");
  expect(cepDigits("70150-900")).toBe("70150900");
});

test("CEP é obrigatório e tem 8 números", () => {
  const msg = (v: unknown) => CepSchema.safeParse(v).error?.issues[0]?.message;
  expect(msg("")).toBe("Informe o CEP.");
  expect(msg("   ")).toBe("Informe o CEP.");
  expect(msg(undefined)).toBe("Informe o CEP.");
  expect(msg("7015-090")).toBe("O CEP tem 8 números.");
  expect(CepSchema.safeParse("70150-900").success).toBe(true);
  expect(CepSchema.safeParse("70150900").success).toBe(true);
});

test("CEP inválido não consulta nenhuma fonte", async () => {
  const { f, calls } = fakeFetch({});
  expect(await findCep("7015-090", f)).toEqual({ status: "invalid" });
  expect(calls).toHaveLength(0);
});

test("ViaCEP acha: para na primeira fonte", async () => {
  const { f, calls } = fakeFetch({
    [VIA]: { status: 200, body: { cep: "70150-900", logradouro: "Praça dos Três Poderes", bairro: "Zona Cívico-Administrativa", localidade: "Brasília", uf: "DF" } },
  });
  expect(await findCep("70150-900", f)).toEqual({
    status: "found",
    address: { cep: "70150900", street: "Praça dos Três Poderes", neighborhood: "Zona Cívico-Administrativa", city: "Brasília", uf: "DF", source: "viacep" },
  });
  expect(calls).toEqual([VIA]);
});

test("ViaCEP não tem o CEP (erro em texto): a BrasilAPI acha", async () => {
  const { f, calls } = fakeFetch({
    [VIA]: { status: 200, body: { erro: "true" } },
    [BR]: { status: 200, body: { cep: "99999999", state: "PR", city: "Sarandi", neighborhood: "Jardim Centro Cívico", street: "Avenida das Torres" } },
  });
  const r = await findCep("99999999", f);
  expect(r.status === "found" && r.address).toMatchObject({ city: "Sarandi", uf: "PR", source: "brasilapi" });
  expect(calls).toEqual([VIA, BR]);
});

test("ViaCEP fora do ar e BrasilAPI lenta: o OpenCEP acha", async () => {
  const { f, calls } = fakeFetch({
    [VIA]: { status: 503 },
    [BR]: "timeout",
    [OPEN]: { status: 200, body: { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" } },
  });
  const r = await findCep("01310100", f);
  expect(r.status === "found" && r.address).toMatchObject({ city: "São Paulo", uf: "SP", source: "opencep" });
  expect(calls).toEqual([VIA, BR, OPEN]);
});

test("nenhuma fonte tem o CEP: não encontrado", async () => {
  const { f } = fakeFetch({
    [VIA]: { status: 200, body: { erro: true } },
    [BR]: { status: 404, body: { name: "CepPromiseError" } },
    [OPEN]: { status: 404, body: { error: true } },
  });
  expect(await findCep("00000000", f)).toEqual({ status: "not_found" });
});

test("uma diz que não existe e as outras caem: não encontrado", async () => {
  const { f } = fakeFetch({ [VIA]: { status: 200, body: { erro: "true" } }, [BR]: "network", [OPEN]: { status: 502 } });
  expect(await findCep("70150900", f)).toEqual({ status: "not_found" });
});

test("todas fora do ar ou com resposta quebrada: indisponível (a pessoa preenche à mão)", async () => {
  const { f } = fakeFetch({ [VIA]: "network", [BR]: { status: 500 }, [OPEN]: { status: 200 } });
  expect(await findCep("70150900", f)).toEqual({ status: "unavailable" });
});

test("resposta sem cidade ou com UF estranha não vale: tenta a próxima", async () => {
  const { f } = fakeFetch({
    [VIA]: { status: 200, body: { localidade: "Brasília", uf: "XX" } },
    [BR]: { status: 200, body: { city: "", state: "DF" } },
    [OPEN]: { status: 200, body: { localidade: "Brasília", uf: "df" } },
  });
  const r = await findCep("70150900", f);
  expect(r.status === "found" && r.address).toMatchObject({ city: "Brasília", uf: "DF", source: "opencep" });
});

test("texto de confirmação do endereço", () => {
  expect(describeAddress({ street: "Avenida Paulista", neighborhood: "Bela Vista", city: "São Paulo", uf: "SP" })).toBe("Avenida Paulista, Bela Vista · São Paulo/SP");
  expect(describeAddress({ street: null, neighborhood: null, city: "Sarandi", uf: "PR" })).toBe("Sarandi/PR");
});
