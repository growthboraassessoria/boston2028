import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { buttonClass } from "@/components/ui/Button";

export const metadata = { title: "Sem acesso" };

export default function SemAcesso() {
  return (
    <AuthShell>
      <p className="label-mono text-signal">Acesso restrito</p>
      <h1 className="display mt-3 text-5xl text-mist-50">Área da equipe</h1>
      <p className="mt-4 leading-relaxed text-mist-200">
        Sua conta não tem um papel no BORA OS do projeto. Os papéis são atribuídos por um administrador, com registro em auditoria.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/passport" className={buttonClass("volt")}>Ir para o meu Passport</Link>
        <Link href="/" className={buttonClass("outline")}>Início</Link>
      </div>
    </AuthShell>
  );
}
