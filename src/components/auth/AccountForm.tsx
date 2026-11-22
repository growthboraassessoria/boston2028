"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createAccountAction, type AccountState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { authInput, CpfField, FormError, Honeypot, PasswordField } from "./fields";

/** Primeiro passo do cadastro: cria o acesso (CPF + e-mail + senha). Depois vem o formulário do Passport. */
export function AccountForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(createAccountAction, {});
  const err = (f: AccountState["field"]) => (state.field === f ? state.error : undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Honeypot />
      <CpfField id="cpf" name="cpf" label="CPF" defaultValue={state.cpf} error={err("cpf")} autoFocus
        help="Você vai usar o CPF para entrar." />
      <div>
        <label htmlFor="email" className="text-sm font-medium text-mist-100">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.email}
          placeholder="voce@exemplo.com" className={`${authInput} mt-2`} aria-invalid={!!err("email")}
          aria-describedby={err("email") ? "email-err" : "email-help"} />
        {err("email")
          ? <p id="email-err" role="alert" className="mt-2 text-sm text-danger">{err("email")}</p>
          : <p id="email-help" className="mt-2 text-xs text-mist-400">É para onde enviamos avisos e o código se você esquecer a senha.</p>}
      </div>
      <PasswordField id="password" name="password" label="Crie uma senha" autoComplete="new-password" error={err("password")}
        help="Pelo menos 8 caracteres, com letras e números." />
      <PasswordField id="confirm" name="confirm" label="Repita a senha" autoComplete="new-password" error={err("confirm")} />
      <FormError>{state.field ? undefined : state.error}</FormError>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Criando…" : "Criar conta e continuar"}</Button>
      <p className="text-center text-sm text-mist-300">
        Já tem conta? <Link href="/login" className="underline underline-offset-4 hover:text-volt">Entrar</Link>
      </p>
    </form>
  );
}
