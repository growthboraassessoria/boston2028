import type { Metadata } from "next";
import Link from "next/link";
import { Camera, FileText, IdCard, ImageIcon, LogOut, Phone, Stamp as StampIcon, Ticket, Timer, Users } from "lucide-react";
import { getPassport } from "@/lib/data/passport";
import { asUser } from "@/lib/db";
import { athleteStatusView, MEMBERSHIP_LABEL } from "@/lib/domain/athlete-status";
import { CATEGORY_LABEL } from "@/lib/domain/standards";
import { avatarUrlFor } from "@/lib/storage";
import { AvatarForm, ContactForm, MembershipForm, ProfileTabs } from "@/components/passport/athlete-forms";
import { Fold, OpenFoldLink } from "@/components/passport/Fold";
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

  const tiles = [
    { href: "/passport/candidatura", label: "Candidatura", detail: view.label, icon: FileText },
    { href: "/passport/testes", label: "Testes", detail: "Calendário e resultados", icon: Timer },
    { href: "/passport/conquistas", label: "Conquistas", detail: d.stamps.length === 1 ? "1 carimbo" : `${d.stamps.length} carimbos`, icon: StampIcon },
    { href: "/passport/resgates", label: "Resgates", detail: "Códigos e histórico", icon: Ticket },
  ];
  const phone = phoneForInput(p.phone);
  const place = p.city ? `${p.city}${p.uf ? `/${p.uf}` : ""}` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileTabs />
      <h1 className="sr-only">Perfil</h1>

      <div className="grid gap-4">
        {/* Cartão do atleta: a foto leva direto para a seção de troca de foto. */}
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-blue-900/60 via-night-850 to-night-850 p-5">
          <div className="flex items-center gap-4">
            <OpenFoldLink target="foto" className="relative shrink-0 rounded-full outline-offset-4" aria-label={avatarUrl ? "Trocar foto do passaporte" : "Adicionar foto do passaporte"}>
              <span className="block size-20 overflow-hidden rounded-full border-2 border-white/15 bg-night-800">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-linear-to-b from-blue-700 to-night-900" aria-hidden>
                    <span className="display text-2xl text-mist-50">{initials}</span>
                  </span>
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border-2 border-night-850 bg-volt text-night-950" aria-hidden>
                <Camera className="size-3.5" />
              </span>
            </OpenFoldLink>
            <div className="min-w-0">
              <p className="break-words text-lg font-semibold leading-snug text-mist-50">{p.fullName}</p>
              <p className="tabular mt-0.5 font-mono text-xs text-mist-400">{p.passportNumber}</p>
              <p className="mt-2 inline-flex max-w-full items-center rounded-full border border-volt/30 bg-volt/10 px-2.5 py-0.5 text-xs text-mist-50">
                <span className="truncate">{view.label}</span>
              </p>
            </div>
          </div>
        </section>

        <nav aria-label="Atalhos do Passport">
          <ul className="grid grid-cols-2 gap-2.5">
            {tiles.map(({ href, label, detail, icon: Icon }) => (
              <li key={href} className="min-w-0">
                <Link href={href} className="flex h-full min-h-24 flex-col justify-between gap-3 rounded-xl border border-white/10 bg-night-850 p-3.5 transition-[background-color,transform] hover:bg-white/[0.04] active:scale-[0.98]">
                  <Icon className="size-5 text-volt" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium text-mist-50">{label}</span>
                    <span className="block truncate text-xs text-mist-400">{detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-2.5">
          <Fold id="contato" icon={<Phone className="size-[18px]" aria-hidden />} title="Contato" summary={[phone || "WhatsApp não informado", place].filter(Boolean).join(" · ")}>
            <p className="text-sm text-mist-300">Conta: <span className="break-all text-mist-100">{p.email}</span></p>
            <div className="mt-4">
              <ContactForm initial={{ preferredName: p.preferredName ?? "", phone, cep: cepForInput(cep), city: p.city ?? "", uf: p.uf ?? "" }} />
            </div>
          </Fold>

          <Fold id="foto" icon={<ImageIcon className="size-[18px]" aria-hidden />} title="Foto do passaporte" summary={avatarUrl ? "Foto enviada · toque para trocar" : "Sem foto · o passaporte mostra suas iniciais"}>
            <AvatarForm avatarUrl={avatarUrl} initials={initials} />
          </Fold>

          <Fold id="vinculo" icon={<Users className="size-[18px]" aria-hidden />} title="Vínculo com a BORA" summary={MEMBERSHIP_LABEL[d.situation.membershipVerified]}>
            <p className="text-sm leading-relaxed text-mist-200">
              Situação conferida pela equipe: <strong className="font-semibold text-mist-50">{MEMBERSHIP_LABEL[d.situation.membershipVerified]}</strong>.
            </p>
            <div className="mt-4">
              <MembershipForm initial={{
                membership: answer ?? "", coachName: (claim?.coach_name as string | null) ?? "", supportPoint: (claim?.support_point as string | null) ?? "",
                noPolo: !!claim?.no_polo,
              }} />
            </div>
            <p className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-3.5 text-sm leading-relaxed text-mist-200">
              Sua resposta fica como <strong className="text-mist-50">autodeclaração</strong>. Ela não libera nem bloqueia nada sozinha:
              a equipe da BORA confirma o vínculo antes de qualquer recurso de aluno. Isso não muda sua candidatura.
            </p>
          </Fold>

          <Fold id="dados" icon={<IdCard className="size-[18px]" aria-hidden />} title="Dados do passaporte" summary={`${CATEGORY_LABEL[p.category]} · nascimento ${fmtDay(p.birthDate)}`}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
          </Fold>
        </div>

        <form action="/sair" method="post" className="pt-2">
          <Button type="submit" variant="ghost" className="w-full border border-white/10 sm:w-auto">
            <LogOut className="size-4" aria-hidden /> Sair da conta
          </Button>
        </form>
      </div>
    </div>
  );
}
