import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { Qr } from "@/components/passport/Qr";
import { MODE_LABEL, REDEMPTION_LABEL } from "@/components/benefits/labels";
import { EmptyState, PageTitle } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Resgates" };

const fmt = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default async function ResgatesPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const [d, sp] = await Promise.all([getPassport(), searchParams]);
  const list = await asUser(d.user, (tx) => tx`select * from rtb.my_redemptions()`);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow="Boston Passport" title="Meus resgates" />
      {sp.novo && <p role="status" className="mb-5 rounded-md border border-volt/30 bg-volt/10 p-3 text-sm text-mist-50">Resgate registrado. Seu código está abaixo.</p>}
      {list.length === 0 ? (
        <EmptyState title="Nenhum resgate ainda"><Link href="/passport/beneficios" className="text-volt underline underline-offset-4">Ver benefícios</Link></EmptyState>
      ) : (
        <ul className="grid gap-4">
          {list.map((r) => (
            <li key={r.id} className={clsx("rounded-xl border p-5", r.id === sp.novo ? "border-volt/40 bg-volt/[0.05]" : "border-white/10 bg-night-850")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-mist-50">{r.title}{r.is_demo && !/demonstra/i.test(r.title) ? " (demonstração)" : ""}</p>
                <span className={clsx("label-mono text-[0.6rem]", r.status === "ISSUED" ? "text-volt" : "text-mist-400")}>{REDEMPTION_LABEL[r.status]}</span>
              </div>
              <p className="mt-1 text-xs text-mist-400">{MODE_LABEL[r.mode]} · pedido em {fmt(r.created_at)}</p>
              {r.status === "ISSUED" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
                  {r.qr_token && (
                    <div className="mx-auto w-36 rounded-lg bg-white p-2 sm:mx-0">
                      <Qr value={`${site}/os/resgates/validar?t=${r.qr_token}`} title="QR do resgate para o parceiro validar" className="h-auto w-full" />
                    </div>
                  )}
                  <div>
                    {r.display_code && <p className="tabular font-mono text-2xl tracking-[0.12em] text-mist-50" aria-label={`Código ${r.display_code.split("").join(" ")}`}>{r.display_code}</p>}
                    {r.external_url && <a href={r.external_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-volt underline underline-offset-4">Abrir link do parceiro ↗</a>}
                    {r.expires_at && <p className="mt-2 text-sm text-mist-300">Vale até {fmt(r.expires_at)}.</p>}
                    {r.redemption_instructions && <p className="mt-2 text-sm leading-relaxed text-mist-200">{r.redemption_instructions}</p>}
                  </div>
                </div>
              )}
              {r.status === "RESERVED" && <p className="mt-3 text-sm text-mist-200">A equipe BORA vai aprovar. Você recebe o código aqui e por e-mail.</p>}
              {r.status === "REDEEMED" && r.redeemed_at && <p className="mt-3 text-sm text-mist-200">Utilizado em {fmt(r.redeemed_at)}.</p>}
              {r.status === "CANCELLED" && r.cancel_reason && <p className="mt-3 text-sm text-mist-300">Motivo: {r.cancel_reason}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs leading-relaxed text-mist-400">O QR leva só um código opaco. O parceiro valida uma única vez, num painel autorizado da BORA.</p>
    </div>
  );
}
