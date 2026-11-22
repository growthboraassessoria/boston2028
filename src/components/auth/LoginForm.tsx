"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { CpfField, FormError, Honeypot, PasswordField } from "./fields";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInAction, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Honeypot />
      <CpfField id="cpf" name="cpf" label="CPF" defaultValue={state.cpf} autoFocus />
      <PasswordField id="password" name="password" label="Senha" autoComplete="current-password" />
      <FormError>{state.error}</FormError>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/login/esqueci" className="text-mist-300 underline underline-offset-4 hover:text-volt">Esqueci minha senha</Link>
        <Link href={`/cadastro${next !== "/passport" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-mist-300 underline underline-offset-4 hover:text-volt">Criar minha conta</Link>
      </div>
    </form>
  );
}
