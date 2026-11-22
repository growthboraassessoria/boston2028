import type { Metadata } from "next";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { EvolutionTabs } from "@/components/passport/athlete-forms";
import { Guilloche } from "@/components/passport/Guilloche";
import { Stamp } from "@/components/passport/Stamp";
import { PageTitle, Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Conquistas" };

const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso));
const fmtMonth = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" })
  .format(new Date(`${iso.slice(0, 10)}T12:00:00-03:00`));

type StampKind = "stamp" | "seal" | "milestone";
const asKind = (k: string): StampKind => (k === "seal" || k === "milestone" ? k : "stamp");

export default async function ConquistasPage() {
  const d = await getPassport();
  // Próximos carimbos = os dos testes do ciclo atual que ainda não foram conquistados.
  const cycleStamps = await asUser(d.user, (tx) => tx`
    select b.slug, b.name, b.description, t.planned_month::text as planned_month
    from rtb.tests t join rtb.badge_definitions b on b.slug = t.badge_slug and b.active
    where t.cycle_id = rtb.current_cycle_id() and t.status <> 'cancelled'
    order by t.planned_month`);
  const earned = new Set(d.stamps.map((s) => s.slug));
  const seen = new Set<string>();
  const upcoming = cycleStamps
    .filter((b) => !earned.has(String(b.slug)) && !seen.has(String(b.slug)) && seen.add(String(b.slug)))
    .map((b) => ({ slug: String(b.slug), name: String(b.name), description: String(b.description), month: String(b.planned_month) }));

  return (
    <div className="mx-auto max-w-2xl">
      <EvolutionTabs />
      <PageTitle eyebrow="Evolução" title="Conquistas">
        <p>Cada etapa validada ganha um carimbo no seu passaporte.</p>
      </PageTitle>

      <div className="grid gap-5">
        <section aria-labelledby="pagina-carimbos" className="light relative overflow-hidden rounded-xl bg-paper p-4 sm:p-6">
          <Guilloche className="pointer-events-none absolute inset-0 h-full w-full" />
          <div className="relative">
            <div className="border-b border-ink/10 pb-2">
              <h2 id="pagina-carimbos" className="label-mono text-[0.62rem] text-mist-600">Boston Passport · Carimbos</h2>
              <p className="mt-1 text-sm text-mist-700">
                {d.stamps.length} {d.stamps.length === 1 ? "conquistado" : "conquistados"}{upcoming.length ? ` · ${upcoming.length} por vir` : ""}
              </p>
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {d.stamps.map((s) => (
                <li key={s.slug + s.awardedAt}>
                  <Stamp title={s.name} date={fmtDate(s.awardedAt)} kind={asKind(s.kind)} className="w-full" />
                </li>
              ))}
              {upcoming.map((u) => (
                <li key={u.slug}>
                  <Stamp title={u.name} empty className="w-full" />
                  <span className="sr-only">: ainda não conquistado</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Panel>
          <h2 className="label-mono text-mist-300">Seus carimbos</h2>
          {d.stamps.length ? (
            <ul className="mt-3 grid gap-3">
              {d.stamps.map((s) => (
                <li key={s.slug + s.awardedAt} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="font-medium text-mist-50">{s.name}</p>
                    <p className="tabular font-mono text-xs text-mist-400">{fmtDate(s.awardedAt)}</p>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-mist-300">{s.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mist-300">Seu primeiro carimbo aparece quando o passaporte é emitido.</p>
          )}
        </Panel>

        {upcoming.length > 0 && (
          <Panel>
            <h2 className="label-mono text-mist-300">Próximos carimbos</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">
              Vêm dos testes do ciclo, depois que a equipe técnica valida o resultado. As datas dos testes ainda podem mudar.
            </p>
            <ul className="mt-3 grid gap-3">
              {upcoming.map((u) => (
                <li key={u.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-mist-100">{u.name}</p>
                  <p className="text-xs text-mist-400">Previsto para {fmtMonth(u.month)}</p>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
