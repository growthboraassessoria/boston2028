import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/passport";
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell>
      <p className="label-mono text-volt" data-hero-item>Boston Passport</p>
      <h1 className="display mt-3 text-5xl text-mist-50" data-hero-split>Entrar</h1>
      <p className="mt-4 leading-relaxed text-mist-200" data-hero-item>Acesse seu passaporte com o código que enviamos para o seu e-mail.</p>
      <div className="mt-8 rounded-xl border border-white/10 bg-night-850/80 p-5 sm:p-7" data-hero-item>
        <LoginForm next={next} linkError={sp.erro === "link"} />
      </div>
    </AuthShell>
  );
}
