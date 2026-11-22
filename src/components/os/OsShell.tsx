"use client";

// Esqueleto do OS (padrão BORA OS): trilho lateral, barra superior com contexto, números em mono, verde como único sinal.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import {
  Activity, BadgeCheck, BarChart3, BookUser, Briefcase, ClipboardList, Cog, Gift, Handshake, LayoutDashboard, Mail, Medal,
  Menu, QrCode, Route, ScrollText, Timer, X,
} from "lucide-react";
import { BoraLogo } from "@/components/brand/Bora";

type Role = "super_admin" | "growth" | "technical_director" | "coach" | "commercial" | "membership_verifier" | "partner_operator";

const NAV: { href: string; label: string; icon: typeof Activity; roles: Role[] }[] = [
  { href: "/os", label: "Visão geral", icon: LayoutDashboard, roles: ["super_admin", "growth", "technical_director", "commercial", "coach", "membership_verifier"] },
  { href: "/os/triagem", label: "Triagem e SLA", icon: Timer, roles: ["super_admin", "technical_director"] },
  { href: "/os/candidatos", label: "Candidatos", icon: ClipboardList, roles: ["super_admin", "technical_director", "coach", "commercial", "membership_verifier"] },
  { href: "/os/alunos", label: "Vínculo BORA", icon: BadgeCheck, roles: ["super_admin", "membership_verifier", "technical_director"] },
  { href: "/os/comercial", label: "Comercial", icon: Briefcase, roles: ["super_admin", "commercial"] },
  { href: "/os/jornadas", label: "Jornadas", icon: Route, roles: ["super_admin", "technical_director", "coach"] },
  { href: "/os/testes", label: "Testes", icon: Activity, roles: ["super_admin", "technical_director", "coach"] },
  { href: "/os/rankings", label: "Rankings", icon: Medal, roles: ["super_admin", "technical_director"] },
  { href: "/os/beneficios", label: "Benefícios", icon: Gift, roles: ["super_admin", "growth"] },
  { href: "/os/parceiros", label: "Parceiros", icon: Handshake, roles: ["super_admin", "growth"] },
  { href: "/os/resgates", label: "Resgates", icon: QrCode, roles: ["super_admin", "growth", "partner_operator"] },
  { href: "/os/comunicacoes", label: "Comunicações", icon: Mail, roles: ["super_admin", "growth"] },
  { href: "/os/analytics", label: "Analytics", icon: BarChart3, roles: ["super_admin", "growth", "technical_director"] },
  { href: "/os/configuracoes", label: "Configurações", icon: Cog, roles: ["super_admin", "technical_director"] },
  { href: "/os/auditoria", label: "Auditoria", icon: ScrollText, roles: ["super_admin"] },
];

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Admin", growth: "Growth", technical_director: "Coordenação técnica", coach: "Treinador",
  commercial: "Comercial", membership_verifier: "Vínculo", partner_operator: "Parceiro",
};

export function OsShell({ roles, name, children }: { roles: Role[]; name: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.some((r) => roles.includes(r)));
  const current = items.find((n) => (n.href === "/os" ? path === "/os" : path.startsWith(n.href)));

  const nav = (
    <nav aria-label="BORA OS" className="grid gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/os" ? path === "/os" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={clsx("flex min-h-10 items-center gap-3 rounded-[3px] px-3 text-sm transition-colors",
              active ? "bg-white/[0.07] text-volt" : "text-mist-300 hover:bg-white/[0.04] hover:text-mist-50")}>
            <Icon className="size-4 shrink-0" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-[#060f20] text-mist-100">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-volt focus:px-4 focus:py-2 focus:text-night-950">Pular para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/[0.06] bg-[#050c1a] lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-4">
          <BoraLogo className="h-3.5 w-auto text-volt" />
          <span className="label-mono text-[0.62rem] text-mist-400">OS · RTB 2028</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{nav}</div>
        <div className="border-t border-white/[0.06] p-3 text-xs">
          <p className="truncate text-mist-200">{name}</p>
          <p className="label-mono mt-1 text-[0.58rem] text-mist-500">{roles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>
          <form action="/sair" method="post" className="mt-2"><button className="min-h-9 text-mist-400 hover:text-mist-100">Sair</button></form>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#060f20]/90 px-4 backdrop-blur" style={{ paddingTop: "var(--safe-top)" }}>
          <button type="button" className="grid size-10 place-items-center rounded-[3px] text-mist-200 hover:bg-white/5 lg:hidden" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="label-mono text-mist-500">OS</span>
          <span className="text-mist-600" aria-hidden>/</span>
          <span className="label-mono text-mist-200">{current?.label ?? "Ficha"}</span>
          <Link href="/passport" className="label-mono ml-auto hidden text-[0.62rem] text-mist-500 hover:text-mist-200 sm:block"><BookUser className="mr-1 inline size-3.5" aria-hidden />Meu Passport</Link>
        </header>
        <main id="conteudo" className="px-4 pb-16 pt-6 lg:px-8">{children}</main>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do OS">
          <button className="absolute inset-0 bg-black/60" aria-label="Fechar menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-white/10 bg-[#050c1a] p-3" style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}>
            <div className="mb-3 flex items-center justify-between px-1">
              <BoraLogo className="h-3.5 w-auto text-volt" />
              <button className="grid size-10 place-items-center text-mist-200" aria-label="Fechar menu" onClick={() => setOpen(false)}><X className="size-5" aria-hidden /></button>
            </div>
            {nav}
          </div>
        </div>
      )}
    </div>
  );
}
