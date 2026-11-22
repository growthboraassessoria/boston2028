// QR interno do Passport: resolve um token opaco. Só a equipe autorizada vê o mínimo para conferir elegibilidade.
import { getSessionUser, getStaffContext } from "@/lib/auth/session";
import { asService } from "@/lib/db";
import { MEMBERSHIP_LABEL } from "@/lib/domain/athlete-status";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Verificação de passaporte", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPassport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  const staff = user ? await getStaffContext() : null;
  const allowed = staff?.roles.some((r) => ["super_admin", "technical_director", "coach", "membership_verifier"].includes(r.role));
  if (!allowed || !/^[0-9a-f]{32}$/.test(token)) {
    return (
      <AuthShell>
        <p className="label-mono text-signal">Verificação restrita</p>
        <h1 className="display mt-3 text-4xl text-mist-50">Passaporte BORA</h1>
        <p className="mt-4 leading-relaxed text-mist-200">Este código só pode ser consultado pela equipe autorizada da BORA, com login. Nenhum dado é mostrado aqui.</p>
      </AuthShell>
    );
  }
  // Leitura mínima com a chave de serviço, depois de conferir o papel no banco (staff). Registra a consulta na auditoria.
  const [row] = await asService(async (tx) => {
    const r = await tx`
      select p.passport_number, split_part(p.full_name, ' ', 1) as first_name, s.membership_verified, s.access_status, s.journey_status
      from rtb.profiles p join rtb.athlete_states s on s.user_id = p.user_id where p.passport_token = ${token} and p.deleted_at is null`;
    await tx`insert into rtb.audit_logs (actor_id, action, entity, entity_id, data) values (${user!.id}, 'passport.qr_checked', 'profiles', ${r[0]?.passport_number ?? "nao_encontrado"}, '{}'::jsonb)`;
    return r;
  });
  return (
    <AuthShell>
      <p className="label-mono text-volt">Verificação interna</p>
      {row ? (
        <>
          <h1 className="display mt-3 text-4xl text-mist-50">{row.first_name}</h1>
          <dl className="mt-6 grid gap-3 text-sm">
            <div><dt className="text-mist-400">Passaporte</dt><dd className="tabular font-mono text-mist-50">{row.passport_number}</dd></div>
            <div><dt className="text-mist-400">Vínculo</dt><dd className="text-mist-50">{MEMBERSHIP_LABEL[row.membership_verified as keyof typeof MEMBERSHIP_LABEL]}</dd></div>
            <div><dt className="text-mist-400">Acesso</dt><dd className="text-mist-50">{row.access_status}</dd></div>
            <div><dt className="text-mist-400">Jornada</dt><dd className="text-mist-50">{row.journey_status}</dd></div>
          </dl>
          <p className="mt-6 text-xs text-mist-500">Consulta registrada na auditoria.</p>
        </>
      ) : <p className="mt-4 text-mist-200">Passaporte não encontrado.</p>}
    </AuthShell>
  );
}
