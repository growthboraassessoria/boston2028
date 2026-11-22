import type { Metadata } from "next";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { MarkAllReadButton, NotificationLink, ProfileTabs } from "@/components/passport/athlete-forms";
import { EmptyState, PageTitle } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Notificações" };

const fmt = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(d));

/** Só caminhos internos (nunca "//outro-site" nem barra invertida). */
const internal = (u: unknown): string | null => (typeof u === "string" && /^\/(?![/\\])/.test(u) && !u.includes("\\") ? u : null);

type Item = { id: string; title: string; body: string | null; href: string | null; unread: boolean; at: string };

function NotificationCard({ n }: { n: Item }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        {n.unread ? (
          <span className="label-mono inline-flex items-center gap-1.5 text-mist-50">
            <span className="size-2 rounded-full bg-volt" aria-hidden /> Nova
          </span>
        ) : (
          <span className="label-mono text-mist-500">Lida</span>
        )}
        <time dateTime={n.at} className="tabular text-xs text-mist-400">{fmt(n.at)}</time>
      </div>
      <p className={clsx("mt-1.5 leading-snug", n.unread ? "font-semibold text-mist-50" : "font-medium text-mist-200")}>{n.title}</p>
      {n.body && <p className="mt-1 text-sm leading-relaxed text-mist-300">{n.body}</p>}
      {n.href && (
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-mist-100">
          Abrir <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </>
  );
  const box = clsx("block rounded-xl border p-4", n.unread ? "border-volt/25 bg-night-850" : "border-white/8 bg-night-900");
  return n.href ? (
    <NotificationLink id={n.id} href={n.href} unread={n.unread} className={clsx(box, "transition-colors hover:border-white/25")}>
      {content}
    </NotificationLink>
  ) : (
    <div className={box}>{content}</div>
  );
}

export default async function NotificacoesPage() {
  const d = await getPassport();
  const rows = await asUser(d.user, (tx) => tx`
    select id, title, body, action_url, read_at, created_at from rtb.notifications
    where user_id = ${d.user.id}
    order by (read_at is null) desc, created_at desc
    limit 100`);
  const items: Item[] = rows.map((r) => ({
    id: String(r.id), title: String(r.title), body: (r.body as string | null) ?? null, href: internal(r.action_url),
    unread: r.read_at === null, at: new Date(r.created_at).toISOString(),
  }));
  const unread = items.filter((n) => n.unread);
  const read = items.filter((n) => !n.unread);

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileTabs />
      <PageTitle eyebrow="Perfil" title="Notificações">
        <p className="text-sm" aria-live="polite">{unread.length ? `${unread.length} não lida${unread.length > 1 ? "s" : ""}.` : "Tudo lido por aqui."}</p>
      </PageTitle>

      {items.length === 0 ? (
        <EmptyState title="Nada por aqui ainda">Avisos sobre sua candidatura, sua jornada e seus carimbos aparecem nesta lista.</EmptyState>
      ) : (
        <div className="grid gap-6">
          {unread.length > 0 && (
            <section aria-labelledby="nao-lidas">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="nao-lidas" className="label-mono text-mist-300">Não lidas</h2>
                <MarkAllReadButton />
              </div>
              <ul className="grid gap-2.5">
                {unread.map((n) => <li key={n.id}><NotificationCard n={n} /></li>)}
              </ul>
            </section>
          )}
          {read.length > 0 && (
            <section aria-labelledby="lidas">
              <h2 id="lidas" className="label-mono mb-3 text-mist-300">Lidas</h2>
              <ul className="grid gap-2.5">
                {read.map((n) => <li key={n.id}><NotificationCard n={n} /></li>)}
              </ul>
            </section>
          )}
          {items.length >= 100 && <p className="text-xs text-mist-400">Mostrando até 100 notificações.</p>}
        </div>
      )}
    </div>
  );
}
