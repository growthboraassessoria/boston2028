import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Lock } from "lucide-react";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { CATEGORY_LABEL, LOCK_LABEL } from "@/components/benefits/labels";
import { EmptyState, PageTitle } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Benefícios" };

export default async function BeneficiosPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const [d, sp] = await Promise.all([getPassport(), searchParams]);
  const cat = Object.keys(CATEGORY_LABEL).includes(sp.cat ?? "") ? sp.cat! : null;
  const items = await asUser(d.user, (tx) => tx`select * from rtb.my_benefit_catalog()`);
  const list = items.filter((b) => !cat || b.category === cat);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Boston Passport" title="Benefícios">
        <p className="text-sm leading-relaxed">Vantagens de parceiros cadastrados e confirmados pela BORA, conforme seu status e seu vínculo.</p>
      </PageTitle>
      <nav aria-label="Categorias" className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        <Link href="/passport/beneficios" aria-current={!cat ? "page" : undefined}
          className={clsx("whitespace-nowrap rounded-full border px-4 py-2 text-sm", !cat ? "border-volt text-volt" : "border-white/12 text-mist-200")}>Todos</Link>
        {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
          <Link key={k} href={`/passport/beneficios?cat=${k}`} aria-current={cat === k ? "page" : undefined}
            className={clsx("whitespace-nowrap rounded-full border px-4 py-2 text-sm", cat === k ? "border-volt text-volt" : "border-white/12 text-mist-200")}>{v}</Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <EmptyState title="Nenhum benefício disponível agora">
          Os benefícios aparecem conforme os parceiros são confirmados e conforme seu status no projeto. Recursos de membro exigem matrícula ativa confirmada.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((b) => {
            const img = publicUrl(b.image_path);
            return (
              <li key={b.id}>
                <Link href={`/passport/beneficios/${b.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-night-850 transition-colors hover:border-white/25">
                  <div className="relative aspect-[16/7] bg-linear-to-br from-blue-700 to-night-900">
                    {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-full w-full object-cover" />
                )}
                    {b.is_demo && <span className="label-mono absolute left-3 top-3 rounded-sm bg-signal px-1.5 py-0.5 text-[0.58rem] text-night-950">Demonstração</span>}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="label-mono text-[0.6rem] text-mist-400">{CATEGORY_LABEL[b.category]} · {b.partner_name}</p>
                    <p className="mt-1.5 font-semibold text-mist-50">{b.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-mist-300">{b.summary}</p>
                    <p className={clsx("mt-auto pt-3 text-sm", b.eligible ? "text-volt" : "text-mist-400")}>
                      {b.eligible ? "Disponível para você" : <><Lock className="mr-1 inline size-3.5" aria-hidden />{LOCK_LABEL[b.lock_reason] ?? "Indisponível"}</>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-xs leading-relaxed text-mist-400">Benefícios de saúde nunca divulgam condição clínica; o parceiro recebe só o mínimo para validar o uso.</p>
    </div>
  );
}
