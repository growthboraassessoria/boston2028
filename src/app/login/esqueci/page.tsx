import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Criar nova senha" };

export default async function EsqueciPage() {
  if (await getSessionUser()) redirect("/passport");
  return (
    <AuthShell>
      <p className="label-mono text-volt" data-hero-item>Boston Passport</p>
      <h1 className="display mt-3 text-5xl text-mist-50" data-hero-split>Nova senha</h1>
      <p className="mt-4 leading-relaxed text-mist-200" data-hero-item>
        Informe seu CPF e o e-mail da sua conta. Se os dois conferirem, enviamos um código para você criar uma senha nova.
      </p>
      <div className="mt-8 rounded-xl border border-white/10 bg-night-850/80 p-5 sm:p-7" data-hero-item>
        <ResetForm />
      </div>
    </AuthShell>
  );
}
