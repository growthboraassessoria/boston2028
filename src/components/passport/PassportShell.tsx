"use client";

// Casca de app iOS: barra superior com área segura, conteúdo que rola sozinho e barra de abas fixa
// (esconde quando o teclado abre, para não cobrir campos nem botões).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Bell, BookOpen, Gift, Route, TrendingUp, UserRound } from "lucide-react";
import { BoraLogo } from "@/components/brand/Bora";

const TABS = [
  { href: "/passport", label: "Passaporte", icon: BookOpen, match: (p: string) => p === "/passport" },
  { href: "/passport/jornada", label: "Jornada", icon: Route, match: (p: string) => p.startsWith("/passport/jornada") || p.startsWith("/passport/candidatura") },
  { href: "/passport/indicadores", label: "Evolução", icon: TrendingUp, match: (p: string) => ["/passport/indicadores", "/passport/testes", "/passport/conquistas"].some((x) => p.startsWith(x)) },
  { href: "/passport/beneficios", label: "Benefícios", icon: Gift, match: (p: string) => p.startsWith("/passport/beneficios") || p.startsWith("/passport/resgates") },
  { href: "/passport/perfil", label: "Perfil", icon: UserRound, match: (p: string) => ["/passport/perfil", "/passport/configuracoes", "/passport/notificacoes"].some((x) => p.startsWith(x)) },
];

export function PassportShell({ passportNumber, unread, children }: { passportNumber: string; unread: number; children: React.ReactNode }) {
  const path = usePathname();
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboard(vv.height < window.innerHeight * 0.72);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="min-h-dvh bg-night-900">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-volt focus:px-4 focus:py-2 focus:text-night-950">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-night-900/85 backdrop-blur-xl" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="safe-x mx-auto flex h-14 max-w-5xl items-center gap-3">
          <Link href="/passport" className="flex min-h-11 items-center gap-2.5" aria-label="Boston Passport, início">
            <BoraLogo className="h-4 w-auto text-volt" />
            <span className="label-mono text-mist-300">Passport</span>
          </Link>
          <span className="tabular ml-auto hidden font-mono text-xs text-mist-400 sm:block">{passportNumber}</span>
          <Link href="/passport/notificacoes" className="relative ml-auto grid size-11 place-items-center rounded-full text-mist-100 hover:bg-white/5 sm:ml-2"
            aria-label={unread ? `Notificações: ${unread} não lida${unread > 1 ? "s" : ""}` : "Notificações"}>
            <Bell className="size-5" aria-hidden />
            {unread > 0 && (
              <span className="tabular absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-volt px-1 text-[0.6rem] font-bold text-night-950" aria-hidden>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main id="conteudo" className="safe-x mx-auto max-w-5xl pt-5" style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 2rem)" }}>
        {children}
      </main>
      <nav aria-label="Seções do Passport"
        className={clsx("fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-night-950/85 backdrop-blur-xl transition-transform duration-200",
          keyboard && "translate-y-full")}
        style={{ paddingBottom: "var(--safe-bottom)" }}>
        <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-xl grid-cols-5">
          {TABS.map(({ href, label, icon: Icon, match }) => {
            const active = match(path);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined}
                  className={clsx("flex h-full min-h-11 flex-col items-center justify-center gap-1 text-[0.68rem] transition-colors",
                    active ? "text-volt" : "text-mist-400 hover:text-mist-100")}>
                  <Icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
