import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AccountForm } from "@/components/auth/AccountForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { getSessionUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Criar meu Boston Passport" };

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/passport";
  const user = await getSessionUser();
  if (user) {
    const has = await asUser(user, (tx) => tx`select 1 from rtb.profiles where user_id = ${user.id} and deleted_at is null`);
    if (has.length) redirect("/passport");
  }
  return (
    <AuthShell wide={!!user}>
      <p className="label-mono text-volt" data-hero-item>Boston Passport · gratuito</p>
      <h1 className="display mt-3 text-[clamp(2.4rem,1.6rem+3vw,3.6rem)] text-mist-50" data-hero-split>Criar meu passaporte</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-mist-200" data-hero-item>
        O Passport guarda sua simulação, sua candidatura e cada etapa da jornada, mesmo antes de qualquer aprovação.
      </p>
      <div className="mt-8 rounded-xl border border-white/10 bg-night-850/80 p-5 sm:p-7" data-hero-item>
        {user ? <SignupForm email={user.email} /> : (
          <>
            <p className="mb-5 text-sm text-mist-200">Primeiro, crie seu acesso. Leva menos de um minuto.</p>
            <AccountForm next={next} />
          </>
        )}
      </div>
    </AuthShell>
  );
}
