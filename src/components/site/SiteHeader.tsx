"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { clsx } from "clsx";
import { BoraLogo } from "@/components/brand/Bora";
import { buttonClass } from "@/components/ui/Button";

const NAV = [
  { href: "/projeto", label: "O projeto" },
  { href: "/criterios", label: "Critérios" },
  { href: "/calculadora", label: "Index Lab" },
  { href: "/calendario", label: "Calendário" },
  { href: "/faq", label: "Perguntas" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-white/5 bg-night-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-night-900/65"
      style={{ paddingTop: "var(--safe-top)" }}>
      <div className="safe-x mx-auto flex h-16 max-w-7xl items-center gap-4">
        <Link href="/" className="flex min-h-11 items-center gap-3 text-volt" aria-label="Road to Boston 2028, página inicial">
          <BoraLogo className="h-[18px] w-auto text-volt" title="BORA" />
          <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
          <span className="display-wide hidden text-[0.8rem] tracking-[0.08em] text-mist-50 sm:block">Road to Boston 2028</span>
        </Link>
        <nav aria-label="Principal" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
              className={clsx("rounded-md px-3 py-2 text-sm text-mist-200 transition-colors hover:text-mist-50",
                path === n.href && "text-volt hover:text-volt")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <span className="hidden sm:contents">
            <Link href="/login" className={buttonClass("ghost", "sm")}>Entrar</Link>
          </span>
          <Link href="/calculadora" className={buttonClass("volt", "sm", "whitespace-nowrap")}>
            <span className="sm:hidden">Meu índice</span>
            <span className="hidden sm:inline">Descobrir meu índice</span>
          </Link>
          <MobileMenu path={path} />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ path }: { path: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="grid size-11 place-items-center rounded-md text-mist-100 hover:bg-white/5 lg:hidden" aria-label="Abrir menu">
        <Menu className="size-5" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-night-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 top-0 z-50 rounded-b-xl border-b border-white/10 bg-night-900 p-4 shadow-2xl"
          style={{ paddingTop: "calc(var(--safe-top) + 1rem)" }}>
          <div className="flex items-center justify-between">
            <Dialog.Title className="label-mono text-mist-300">Menu</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-md text-mist-100 hover:bg-white/5" aria-label="Fechar menu">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Navegação do site Road to Boston 2028</Dialog.Description>
          <nav aria-label="Principal (celular)" className="mt-2 grid">
            {[{ href: "/", label: "Início" }, ...NAV, { href: "/login", label: "Entrar no Passport" }].map((n) => (
              <Dialog.Close asChild key={n.href}>
                <Link href={n.href} aria-current={path === n.href ? "page" : undefined}
                  className={clsx("flex min-h-12 items-center border-b border-white/5 text-lg text-mist-50", path === n.href && "text-volt")}>
                  {n.label}
                </Link>
              </Dialog.Close>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
