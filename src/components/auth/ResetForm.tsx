"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { confirmResetAction, requestResetAction, type ResetState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { formatCpf, PASSWORD_RULE } from "@/lib/cpf";
import { authInput, CpfField, FormError, Honeypot, PasswordField } from "./fields";

/** Esqueci a senha: 1) CPF + e-mail da conta → código no e-mail; 2) código + senha nova. */
export function ResetForm() {
  const [asked, ask, asking] = useActionState<ResetState, FormData>(requestResetAction, { step: "identify" });
  const [confirmed, confirm, confirming] = useActionState<ResetState, FormData>(confirmResetAction, { step: "identify" });
  const restart = confirmed.step === "identify" && !!confirmed.error; // o passo 2 pediu para recomeçar
  const codeRef = useRef<HTMLInputElement>(null);
  const inCode = asked.step === "code" && !restart;
  useEffect(() => {
    if (inCode) codeRef.current?.focus();
  }, [inCode]);

  if (asked.step === "code" && !restart) {
    const step = { ...asked, error: confirmed.step === "code" ? confirmed.error : undefined };
    return (
      <form action={confirm} className="grid gap-4" noValidate>
        <input type="hidden" name="cpf" value={step.cpf} />
        <p className="text-sm leading-relaxed text-mist-200">{step.info ?? "Digite o código de 6 números que enviamos para o seu e-mail."}</p>
        <p className="text-sm text-mist-300">CPF: <strong className="font-mono tabular text-mist-50">{formatCpf(step.cpf)}</strong></p>
        {step.devCode && (
          <p className="rounded-md border border-signal/40 bg-signal/10 p-3 font-mono text-sm text-signal" data-testid="dev-code">
            Código (só em desenvolvimento): <strong className="tabular">{step.devCode}</strong>
          </p>
        )}
        <div>
          <label htmlFor="code" className="text-sm font-medium text-mist-100">Código do e-mail</label>
          <input ref={codeRef} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            required className={`${authInput} mt-2 text-center font-mono text-2xl tracking-[0.5em]`} />
        </div>
        <PasswordField id="password" name="password" label="Nova senha" autoComplete="new-password"
          help={PASSWORD_RULE} />
        <PasswordField id="confirm" name="confirm" label="Repita a nova senha" autoComplete="new-password" />
        <FormError>{step.error}</FormError>
        <Button type="submit" size="lg" disabled={confirming}>{confirming ? "Salvando…" : "Salvar nova senha e entrar"}</Button>
        {/* <a> e não <Link>: recarrega a página e zera o passo anterior. */}
        <a href="/login/esqueci" className="text-center text-sm text-mist-300 underline underline-offset-4 hover:text-volt">
          Não recebi: pedir outro código
        </a>
      </form>
    );
  }

  // Aqui o estado é sempre do passo 1 (o passo 2 já retornou acima).
  const step = (restart ? confirmed : asked) as Extract<ResetState, { step: "identify" }>;
  return (
    <form action={ask} className="grid gap-4" noValidate>
      <Honeypot />
      <CpfField id="cpf" name="cpf" label="CPF" defaultValue={step.cpf} autoFocus />
      <div>
        <label htmlFor="email" className="text-sm font-medium text-mist-100">E-mail da conta</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={step.email}
          placeholder="voce@exemplo.com" className={`${authInput} mt-2`} aria-describedby="email-help" />
        <p id="email-help" className="mt-2 text-xs text-mist-400">O mesmo e-mail que você usou no cadastro. É para ele que vai o código.</p>
      </div>
      <FormError>{step.error}</FormError>
      <Button type="submit" size="lg" disabled={asking}>{asking ? "Conferindo…" : "Enviar código"}</Button>
      <Link href="/login" className="text-center text-sm text-mist-300 underline underline-offset-4 hover:text-volt">Voltar para entrar</Link>
    </form>
  );
}
