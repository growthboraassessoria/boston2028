import Link from "next/link";
import { BoraLogo, BoraShield } from "@/components/brand/Bora";
import { MotionRoot } from "@/components/motion/MotionRoot";

export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grain relative min-h-dvh overflow-hidden bg-night-900" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      <MotionRoot>
      <div className="hairline-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <span className="pointer-events-none absolute -right-24 -top-10" aria-hidden data-float>
        <BoraShield className="h-[34rem] w-auto text-white/[0.025]" />
      </span>
      <header className="safe-x relative mx-auto flex h-16 max-w-7xl items-center">
        <Link href="/" className="flex min-h-11 items-center gap-3" aria-label="Voltar para o início">
          <BoraLogo className="h-[18px] w-auto text-volt" />
          <span className="display-wide hidden text-[0.8rem] tracking-[0.08em] text-mist-50 sm:block">Road to Boston 2028</span>
        </Link>
      </header>
      <main id="conteudo" data-hero className={`safe-x relative mx-auto w-full ${wide ? "max-w-3xl" : "max-w-md"} pb-16 pt-6 sm:pt-12`}>{children}</main>
      </MotionRoot>
    </div>
  );
}
