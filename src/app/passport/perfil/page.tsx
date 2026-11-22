import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, FileText, LogOut, Settings, Stamp as StampIcon, Ticket, Timer } from "lucide-react";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { athleteStatusView, MEMBERSHIP_LABEL } from "@/lib/domain/athlete-status";
import { CATEGORY_LABEL } from "@/lib/domain/standards";
import { avatarUrlFor } from "@/lib/storage";
import { AvatarForm, ContactForm, MembershipForm, ProfileTabs } from "@/components/passport/athlete-forms";
import { PageTitle, Panel } from "@/components/passport/ui";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Perfil" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(`${d.slice(0, 10)}T12:00:00-03:00`));

/** +5561990000005 → (61) 99000-0005. Fora do Brasil, mostra como está. */
function phoneForInput(e164: string | null): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  if (!e164.startsWith("+55") || (digits.length !== 12 && digits.length !== 13)) return e164;
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}

const cepForInput = (cep: string | null) => (cep && /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep ?? "");

export default async function PerfilPage() {
  const d = await getPassport();
  const [avatarUrl, extra] = await Promise.all([
    avatarUrlFor(d.user, d.profile.avatarPath),
    asUser(d.user, async (tx) => {
      const [claim] = await tx`
        select answer, coach_name, support_point, no_polo from rtb.membership_claims
        where user_id = ${d.user.id} order by created_at desc limit 1`;
      const [p] = await tx`select cep from rtb.profiles where user_id = ${d.user.id}`;
      return { claim, cep: (p?.cep as string | null) ?? null };
    }),
  ]);
  const { claim, cep } = extra;
  const p = d.profile;
  const initials = p.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const view = athleteStatusView(d.situation);
  const answer = claim?.answer as "SIM_ATUAL" | "NAO" | "EX_ALUNO" | undefined;

  const links = [
    { href: "/passport/candidatura", label: "Candidatura", detail: view.label, icon: FileText },
    { href: "/passport/testes", label: "Testes do ciclo", detail: "Calendário e resultados", icon: Timer },
    { href: "/passport/conquistas", label: "Conquistas", detail: d.stamps.length === 1 ? "1 carimbo" : `${d.stamps.length} carimbos`, icon: StampIcon },
    { href: "/passport/resgates", label: "Meus resgates", detail: "Códigos e histórico de benefícios", icon: Ticket },
    { href: "/passport/notificacoes", label: "Notificações", detail: d.unread ? `${d.unread} não lida${d.unread > 1 ? "s" : ""}` : "Tudo lido", icon: Bell },
    { href: "/passport/configuracoes", label: "Configurações", detail: "Privacidade, seus dados e som", icon: Settings },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileTabs />
      <PageTitle eyebrow="Boston Passport" title="Perfil" />

      <div className="grid gap-5">
        <Panel>
          <div className="flex items-center gap-4">
            <div className="size-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-night-800">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-linear-to-b from-blue-700 to-night-900" aria-hidden>
                  <span className="display text-xl text-mist-50">{initials}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="break-words text-lg font-semibold leading-snug text-mist-50">{p.fullName}</p>
              <p className="tabular mt-0.5 font-mono text-xs text-mist-400">{p.passportNumber}</p>
              <p className="mt-1 text-sm text-mist-300">{MEMBERSHIP_LABEL[d.situation.membershipVerified]}</p>
            </div>
          </div>
        </Panel>

        <nav aria-label="Atalhos do Passport">
          <ul className="divide-y divide-white/8 overflow-hidden rounded-xl border border-white/10 bg-night-850">
            {links.map(({ href, label, detail, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]">
                  <Icon className="size-5 shrink-0 text-mist-300" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-mist-50">{label}</span>
                    <span className="block truncate text-xs text-mist-400">{detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-mist-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Panel>
          <h2 className="label-mono text-mist-300">Foto do passaporte</h2>
          <div className="mt-4">
            <AvatarForm avatarUrl={avatarUrl} initials={initials} />
          </div>
        </Panel>

        <Panel>
          <h2 className="label-mono text-mist-300">Contato</h2>
          <p className="mt-2 text-sm text-mist-300">Conta: <span className="break-all text-mist-100">{p.email}</span></p>
          <div className="mt-5">
            <ContactForm initial={{ preferredName: p.preferredName ?? "", phone: phoneForInput(p.phone), cep: cepForInput(cep), city: p.city ?? "", uf: p.uf ?? "" }} />
          </div>
        </Panel>

        <Panel>
          <h2 className="label-mono text-mist-300">Dados do passaporte</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-mist-400">Nome completo</dt><dd className="mt-0.5 break-words text-mist-50">{p.fullName}</dd></div>
            <div><dt className="text-mist-400">Data de nascimento</dt><dd className="tabular mt-0.5 text-mist-50">{fmtDay(p.birthDate)}</dd></div>
            <div><dt className="text-mist-400">Categoria de referência</dt><dd className="mt-0.5 text-mist-50">{CATEGORY_LABEL[p.category]}</dd></div>
            <div><dt className="text-mist-400">Emitido em</dt><dd className="tabular mt-0.5 text-mist-50">{fmtDay(p.issuedAt)}</dd></div>
            <div><dt className="text-mist-400">Nº do passaporte</dt><dd className="tabular mt-0.5 font-mono text-mist-50">{p.passportNumber}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-mist-400">
            Nome, nascimento e categoria definem o índice da sua faixa e não mudam por aqui. Para corrigir, faça um pedido de correção em{" "}
            <Link href="/passport/configuracoes#seus-dados" className="text-mist-100 underline underline-offset-2">Configurações › Seus dados</Link>.
          </p>
        </Panel>

        <Panel>
          <h2 className="label-mono text-mist-300">Vínculo com a BORA</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist-200">
            Situação conferida pela equipe: <strong className="font-semibold text-mist-50">{MEMBERSHIP_LABEL[d.situation.membershipVerified]}</strong>.
          </p>
          <div className="mt-5">
            <MembershipForm initial={{
              membership: answer ?? "", coachName: (claim?.coach_name as string | null) ?? "", supportPoint: (claim?.support_point as string | null) ?? "",
              noPolo: !!claim?.no_polo,
            }} />
          </div>
          <p className="mt-5 rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-mist-200">
            Sua resposta fica como <strong className="text-mist-50">autodeclaração</strong>. Ela não libera nem bloqueia nada sozinha:
            a equipe da BORA confirma o vínculo antes de qualquer recurso de aluno. Isso não muda sua candidatura.
          </p>
        </Panel>

        <form action="/sair" method="post" className="pt-1">
          <Button type="submit" variant="ghost" className="w-full border border-white/10 sm:w-auto">
            <LogOut className="size-4" aria-hidden /> Sair da conta
          </Button>
        </form>
      </div>
    </div>
  );
}
