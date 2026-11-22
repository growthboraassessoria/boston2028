"use client";

// Busca de CEP nos formulários (cadastro e perfil): dispara quando o CEP completa 8 números (e ao sair do campo),
// ignora respostas atrasadas e só preenche cidade e UF quando o CEP muda (não apaga o que a pessoa corrigiu à mão).
import { useRef, useState } from "react";
import { lookupCep, type CepResult } from "@/lib/actions/profile";
import { cepDigits, describeAddress } from "@/lib/domain/cep";

export type CepFound = Extract<CepResult, { status: "found" }>;
type Status = "idle" | "loading" | "found" | "not_found" | "unavailable" | "limited";

export function cepHint(status: Status, label?: string): string {
  switch (status) {
    case "loading":
      return "Buscando o endereço…";
    case "found":
      return `Achamos: ${label}. Confira a cidade e a UF.`;
    case "not_found":
      return "Não achamos esse CEP. Confira os números ou preencha a cidade e a UF.";
    case "unavailable":
      return "A busca de CEP não respondeu agora. Preencha a cidade e a UF.";
    case "limited":
      return "Muitas buscas seguidas. Preencha a cidade e a UF.";
    default:
      return "Com o CEP, a cidade e a UF se preenchem sozinhas.";
  }
}

export function useCepLookup(initial = "") {
  const [state, setState] = useState<{ status: Status; label?: string }>({ status: "idle" });
  const last = useRef(cepDigits(initial));
  const seq = useRef(0);

  async function check(value: string, onFound: (r: CepFound) => void) {
    const digits = cepDigits(value);
    if (digits.length !== 8) {
      // CEP incompleto: cancela a busca em andamento e libera uma nova quando completar.
      if (last.current) {
        last.current = "";
        seq.current += 1;
      }
      if (state.status !== "idle") setState({ status: "idle" });
      return;
    }
    if (digits === last.current) return;
    last.current = digits;
    const id = ++seq.current;
    setState({ status: "loading" });
    let r: CepResult;
    try {
      r = await lookupCep(digits);
    } catch {
      r = { status: "unavailable" };
    }
    if (id !== seq.current) return; // chegou depois de outra digitação
    if (r.status === "found") {
      onFound(r);
      setState({ status: "found", label: describeAddress(r) });
    } else {
      setState({ status: r.status === "invalid" ? "not_found" : r.status });
    }
  }

  return { status: state.status, hint: cepHint(state.status, state.label), check };
}
