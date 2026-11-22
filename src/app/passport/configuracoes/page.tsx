import type { Metadata } from "next";
import Link from "next/link";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { DataRequestForm, DeviceSettings, PrivacyForm, ProfileTabs, type PrivacyPurpose } from "@/components/passport/athlete-forms";
import { EmptyState, PageTitle, Panel } from "@/components/passport/ui";

export const metadata: Metadata = { title: "Configurações" };

const fmt = (d: Date | string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

const KIND_LABEL: Record<string, string> = {
  ACCESS: "Ver meus dados",
  RECTIFICATION: "Corrigir dados",
  DELETION: "Excluir meus dados",
  PORTABILITY: "Levar meus dados",
  OBJECTION: "Parar um uso",
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Recebido", className: "border-white/15 text-mist-100" },
  IN_PROGRESS: { label: "Em andamento", className: "border-blue-300/40 text-blue-300" },
  DONE: { label: "Concluído", className: "border-white/25 text-mist-50" },
  REJECTED: { label: "Não atendido", className: "border-warn/50 text-warn" },
};

const PURPOSES: PrivacyPurpose[] = ["public_profile", "ranking_public", "marketing_email", "marketing_whatsapp", "avatar_use"];

export default async function ConfiguracoesPage() {
  const d = await getPassport();
  const { consents, requests } = await asUser(d.user, async (tx) => ({
    consents: await tx`
      select distinct on (purpose) purpose, granted from rtb.consents
      where user_id = ${d.user.id}
        and purpose in ('public_profile', 'ranking_public', 'marketing_email', 'marketing_whatsapp', 'avatar_use')
      order by purpose, created_at desc`,
    requests: await tx`
      select id, kind, details, status, response, created_at, handled_at from rtb.data_requests
      where user_id = ${d.user.id} order by created_at desc limit 50`,
  }));
  const latest = new Map<string, boolean>(consents.map((c): [string, boolean] => [String(c.purpose), !!c.granted]));
  const initial = Object.fromEntries(PURPOSES.map((p) => [p, latest.get(p) ?? false])) as Record<PrivacyPurpose, boolean>;
  const openKinds = requests.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").map((r) => String(r.kind));

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileTabs />
      <PageTitle eyebrow="Perfil" title="Configurações" />

      <div className="grid gap-5">
        <Panel>
          <h2 className="label-mono text-mist-300">Privacidade</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist-200">
            Tudo vem desligado até você ligar. Mude quando quiser: vale a partir do momento em que você salvar.
          </p>
          <div className="mt-4">
            <PrivacyForm initial={initial} hasAvatar={!!d.profile.avatarPath} />
          </div>
        </Panel>

        <Panel>
          <h2 className="label-mono text-mist-300">Neste aparelho</h2>
          <div className="mt-4">
            <DeviceSettings />
          </div>
        </Panel>

        <Panel>
          <h2 id="seus-dados" className="label-mono scroll-mt-24 text-mist-300">Seus dados (LGPD)</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist-200">
            Você pode pedir para ver, corrigir, levar ou excluir seus dados, ou pedir que um uso pare. A equipe da BORA responde por aqui.{" "}
            <Link href="/privacidade" className="text-mist-50 underline underline-offset-2">Aviso de privacidade</Link>
          </p>
          <div className="mt-5">
            <DataRequestForm openKinds={openKinds} />
          </div>

          <h3 className="label-mono mt-8 text-mist-300">Seus pedidos</h3>
          {requests.length ? (
            <ul className="mt-3 grid gap-3">
              {requests.map((r) => {
                const st = STATUS_LABEL[String(r.status)] ?? { label: String(r.status), className: "border-white/15 text-mist-100" };
                return (
                  <li key={r.id} className="rounded-md border border-white/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-mist-50">{KIND_LABEL[String(r.kind)] ?? "Pedido"}</p>
                      <span className={`label-mono rounded-full border px-2.5 py-1 text-[0.65rem] ${st.className}`}>{st.label}</span>
                    </div>
                    <p className="tabular mt-1 text-xs text-mist-400">
                      Enviado em {fmt(r.created_at)}{r.handled_at ? ` · atualizado em ${fmt(r.handled_at)}` : ""}
                    </p>
                    {r.details && <p className="mt-2 whitespace-pre-line break-words text-sm text-mist-200">{r.details}</p>}
                    {r.response && (
                      <blockquote className="mt-3 border-l-2 border-white/20 pl-3 text-sm leading-relaxed text-mist-100">
                        {r.response}
                        <span className="mt-1 block text-xs text-mist-400">Resposta da BORA</span>
                      </blockquote>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3">
              <EmptyState title="Nenhum pedido até agora">Quando você fizer um pedido, ele aparece aqui com a situação.</EmptyState>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
