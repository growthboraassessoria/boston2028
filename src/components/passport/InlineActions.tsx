"use client";

// Pequenas ações do Passport com retorno na própria tela (sem recarregar tudo).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptJourney, declineJourney, respondInfoRequest, withdrawApplication, type ActionResult } from "@/lib/actions/application";
import { Button } from "@/components/ui/Button";

function Feedback({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return r.ok
    ? r.message ? <p role="status" className="mt-3 text-sm text-volt">{r.message}</p> : null
    : <p role="alert" className="mt-3 text-sm text-danger">{r.error}</p>;
}

export function InfoResponseForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [r, setR] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <form className="mt-3 grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      const file = fileRef.current?.files?.[0];
      if (file) fd.set("proof", file);
      start(async () => {
        const out = await respondInfoRequest(requestId, text, file ? fd : null);
        setR(out);
        // O painel do pedido some depois de respondido: a confirmação vai para a página.
        if (out.ok) router.replace("/passport/candidatura?respondida=1", { scroll: false });
      });
    }}>
      <label htmlFor={`resp-${requestId}`} className="text-sm font-medium text-mist-100">Sua resposta</label>
      <textarea id={`resp-${requestId}`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} required
        className="block w-full rounded-md border border-white/12 bg-night-950/60 p-3 text-mist-50 outline-none focus:border-volt" />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Anexo (opcional)"
        className="block w-full text-sm text-mist-200 file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-white/10 file:px-4 file:text-mist-50" />
      <Button type="submit" disabled={pending || text.trim().length < 2}>{pending ? "Enviando…" : "Enviar resposta"}</Button>
      <Feedback r={r} />
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [r, setR] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (!confirm) {
    return <button type="button" onClick={() => setConfirm(true)} className="min-h-11 text-sm text-mist-400 underline underline-offset-4 hover:text-mist-100">Retirar candidatura</button>;
  }
  return (
    <div className="rounded-md border border-white/10 p-4">
      <p className="text-sm text-mist-100">Retirar a candidatura encerra a análise. Seu passaporte e histórico continuam guardados.</p>
      <div className="mt-3 flex gap-2">
        <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => {
          const out = await withdrawApplication(applicationId, "Retirada pelo atleta no Passport");
          setR(out); if (out.ok) router.replace("/passport/candidatura?retirada=1", { scroll: false });
        })}>Confirmar retirada</Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancelar</Button>
      </div>
      <Feedback r={r} />
    </div>
  );
}

export function JourneyDecision({ enrollmentId, journeyLabel }: { enrollmentId: string; journeyLabel: string }) {
  const router = useRouter();
  const [r, setR] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" disabled={pending} onClick={() => start(async () => {
          const out = await acceptJourney(enrollmentId);
          setR(out); if (out.ok) router.replace("/passport/jornada?aceito=1", { scroll: false });
        })}>Aceitar e entrar no {journeyLabel}</Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => setDeclining(true)}>Agora não</Button>
      </div>
      {declining && (
        <div className="mt-3 rounded-md border border-white/10 p-4">
          <p className="text-sm text-mist-100">Tudo bem. A coordenação pode conversar com você sobre o melhor momento.</p>
          <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            const out = await declineJourney(enrollmentId, "Recusado pelo atleta no Passport");
            setR(out); if (out.ok) router.replace("/passport/jornada?recusado=1", { scroll: false });
          })}>Confirmar que não quero agora</Button>
        </div>
      )}
      <Feedback r={r} />
    </div>
  );
}
