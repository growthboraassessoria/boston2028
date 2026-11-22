"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { clsx } from "clsx";
import { X } from "lucide-react";
import {
  addNote, assignCoach, recordContact, recordDecision, saveGoal, setAutomationsPaused, setPolo, startReview, verifyMember,
  type OsResult,
} from "@/lib/actions/os";
import { parseDuration } from "@/lib/domain/time";

const input = "block min-h-10 w-full rounded-[3px] border border-white/12 bg-[#060f20] px-3 text-sm text-mist-50 outline-none focus:border-volt [color-scheme:dark]";
const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-semibold transition-colors disabled:opacity-50";

function Result({ r }: { r: OsResult | null }) {
  if (!r) return null;
  return r.ok ? <p role="status" className="text-sm text-volt">{r.message}</p> : <p role="alert" className="text-sm text-danger">{r.error}</p>;
}

function key() {
  return (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

const DECISIONS = {
  APPROVE_ROAD: { label: "Aprovar Road to Boston", tone: "bg-volt text-night-950 hover:bg-[#d8ff3d]", help: "Aluno confirmado entra no ciclo sem custo adicional; não aluno aguarda matrícula (vira oportunidade comercial)." },
  NOT_APPROVED: { label: "Não aprovar tecnicamente", tone: "border border-white/15 text-mist-100 hover:border-white/40", help: "Registra o parecer. Se havia jornada Road aberta, ela é cancelada (sem apagar histórico)." },
  FORWARD_NEXT: { label: "Encaminhar ao BORA NEXT", tone: "border border-volt/50 text-volt hover:bg-volt/10", help: "Aluno confirmado recebe convite (sem custo); não aluno recebe orientação de matrícula. Reavaliação é agendada." },
  REQUEST_INFO: { label: "Solicitar mais informações", tone: "border border-warn/50 text-warn hover:bg-warn/10", help: "O atleta recebe a pergunta no Passport e por e-mail; a candidatura fica em 'Aguardando informação'." },
  KEEP_MONITORING: { label: "Manter em acompanhamento", tone: "border border-blue-300/40 text-blue-300 hover:bg-blue-700/20", help: "Agenda reavaliação (padrão 90 dias, ou a data escolhida). Nenhuma oferta de treino." },
} as const;
type DecisionKey = keyof typeof DECISIONS;

export function DecisionPanel({ applicationId, allowed, status }: { applicationId: string; allowed: DecisionKey[]; status: string }) {
  const [open, setOpen] = useState<DecisionKey | null>(null);
  return (
    <div className="grid gap-2">
      {status !== "UNDER_REVIEW" && ["PRELIM_ELIGIBLE", "PRELIM_ALMOST", "PRELIM_NOT_NOW"].includes(status) && <StartReview applicationId={applicationId} />}
      {(Object.keys(DECISIONS) as DecisionKey[]).filter((d) => allowed.includes(d)).map((d) => (
        <button key={d} type="button" onClick={() => setOpen(d)} className={clsx(btn, "w-full justify-start", DECISIONS[d].tone)}>{DECISIONS[d].label}</button>
      ))}
      {open && <DecisionDialog applicationId={applicationId} decision={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StartReview({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  return (
    <div>
      <button type="button" disabled={pending} className={clsx(btn, "w-full justify-start border border-white/10 text-mist-200 hover:border-white/30")}
        onClick={() => start(async () => { const o = await startReview(applicationId); setR(o); if (o.ok) router.refresh(); })}>
        Assumir análise (marca “Em análise”)
      </button>
      <Result r={r} />
    </div>
  );
}

function DecisionDialog({ applicationId, decision, onClose }: { applicationId: string; decision: DecisionKey; onClose: () => void }) {
  const router = useRouter();
  const idem = useRef<string | null>(null);
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [f, setF] = useState({ reason: "", nextStep: "", nextStepOn: "", message: "" });
  const needsMessage = decision === "REQUEST_INFO";
  const d = DECISIONS[decision];
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed inset-x-3 top-[6vh] z-50 mx-auto max-h-[88vh] max-w-xl overflow-y-auto rounded-[6px] border border-white/10 bg-[#0a1630] p-5 text-mist-100 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-mono text-[0.6rem] text-mist-500">Decisão técnica · auditada</p>
              <Dialog.Title className="mt-1 text-lg font-semibold text-mist-50">{d.label}</Dialog.Title>
            </div>
            <Dialog.Close className="grid size-10 place-items-center text-mist-300 hover:text-mist-50" aria-label="Fechar"><X className="size-5" aria-hidden /></Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-mist-300">{d.help}</Dialog.Description>
          <form className="mt-4 grid gap-4" onSubmit={(e) => {
            e.preventDefault();
            idem.current ??= key();
            const idempotencyKey = idem.current;
            start(async () => {
              const o = await recordDecision({ applicationId, decision, reason: f.reason, nextStep: f.nextStep, nextStepOn: f.nextStepOn, message: f.message || undefined, idempotencyKey });
              setR(o);
              if (o.ok) { router.refresh(); setTimeout(onClose, 900); }
            });
          }}>
            <label className="grid gap-1.5 text-sm">Motivo técnico (interno, obrigatório)
              <textarea required minLength={5} rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={clsx(input, "py-2")} />
            </label>
            <label className="grid gap-1.5 text-sm">Próximo passo (obrigatório)
              <input required minLength={3} value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} className={input} placeholder="Ex.: ligar na terça e combinar plano de 12 semanas" />
            </label>
            <label className="grid gap-1.5 text-sm">Data do próximo passo {decision === "FORWARD_NEXT" || decision === "KEEP_MONITORING" ? "(vira a data da reavaliação)" : "(opcional)"}
              <input type="date" value={f.nextStepOn} onChange={(e) => setF({ ...f, nextStepOn: e.target.value })} className={input} />
            </label>
            <label className="grid gap-1.5 text-sm">{needsMessage ? "Pergunta para o atleta (obrigatória)" : "Mensagem para o atleta (opcional, aparece no Passport)"}
              <textarea required={needsMessage} rows={3} maxLength={1000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className={clsx(input, "py-2")} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={pending} className={clsx(btn, "bg-volt text-night-950")}>{pending ? "Registrando…" : "Registrar decisão"}</button>
              <Result r={r} />
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ContactForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [f, setF] = useState({ channel: "whatsapp", outcome: "reached", note: "" });
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await recordContact({ applicationId, ...f }); setR(o); if (o.ok) { setF({ ...f, note: "" }); router.refresh(); } }); }}>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Canal" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className={input}>
          <option value="whatsapp">WhatsApp</option><option value="phone">Telefone</option><option value="email">E-mail</option><option value="in_person">Presencial</option><option value="other">Outro</option>
        </select>
        <select aria-label="Resultado" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} className={input}>
          <option value="reached">Falou com o atleta</option><option value="scheduled">Conversa agendada</option><option value="left_message">Deixou recado</option><option value="no_answer">Sem resposta</option><option value="wrong_contact">Contato errado</option>
        </select>
      </div>
      <input aria-label="Observação" placeholder="Observação (sem dados de saúde)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={input} />
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Registrar contato</button><Result r={r} /></div>
    </form>
  );
}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [note, setNote] = useState("");
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await addNote(applicationId, note); setR(o); if (o.ok) { setNote(""); router.refresh(); } }); }}>
      <textarea aria-label="Nota técnica" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={clsx(input, "py-2")} placeholder="Nota técnica interna" />
      <div className="flex items-center gap-3"><button disabled={pending || note.trim().length < 2} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Adicionar nota</button><Result r={r} /></div>
    </form>
  );
}

export function VerifyForm({ userId, current }: { userId: string; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [f, setF] = useState({ status: current === "PENDENTE" ? "ATIVO_CONFIRMADO" : current, note: "", externalMemberId: "" });
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await verifyMember({ userId, ...f, externalMemberId: f.externalMemberId || undefined }); setR(o); if (o.ok) router.refresh(); }); }}>
      <select aria-label="Status do vínculo" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={input}>
        <option value="ATIVO_CONFIRMADO">Ativo confirmado</option><option value="EX_ALUNO_CONFIRMADO">Ex-aluno confirmado</option>
        <option value="NAO_ALUNO_CONFIRMADO">Não aluno confirmado</option><option value="DIVERGENCIA">Divergência</option><option value="PENDENTE">Pendente</option>
      </select>
      <input aria-label="Origem da conferência" required minLength={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={input} placeholder="Origem (ex.: planilha da unidade, conversa com o treinador)" />
      <input aria-label="ID na Running (opcional)" value={f.externalMemberId} onChange={(e) => setF({ ...f, externalMemberId: e.target.value })} className={input} placeholder="ID na Running (opcional)" />
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "bg-volt text-night-950")}>Salvar vínculo</button><Result r={r} /></div>
    </form>
  );
}

export function PoloForm({ userId, current }: { userId: string; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [polo, setP] = useState(current ?? "");
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await setPolo(userId, polo); setR(o); if (o.ok) router.refresh(); }); }}>
      <input aria-label="Polo" value={polo} onChange={(e) => setP(e.target.value)} className={clsx(input.replace("w-full", ""), "w-44")} placeholder="Polo (ex.: DF)" />
      <button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Salvar polo</button>
      <Result r={r} />
    </form>
  );
}

export function CoachSelect({ athleteId, coaches, current }: { athleteId: string; coaches: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [value, setValue] = useState(current ?? "");
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await assignCoach(athleteId, value || null); setR(o); if (o.ok) router.refresh(); }); }}>
      <select aria-label="Treinador" value={value} onChange={(e) => setValue(e.target.value)} className={clsx(input, "w-56")}>
        <option value="">Sem treinador</option>
        {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Atribuir</button>
      <Result r={r} />
    </form>
  );
}

export function PauseToggle({ userId, paused }: { userId: string; paused: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}
        onClick={() => start(async () => { const o = await setAutomationsPaused(userId, !paused); setR(o); if (o.ok) router.refresh(); })}>
        {paused ? "Retomar automações" : "Pausar automações"}
      </button>
      <Result r={r} />
    </div>
  );
}

export function GoalForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  const [f, setF] = useState({ title: "", targetDistance: "", time: "", dueOn: "" });
  return (
    <form className="grid gap-2" onSubmit={(e) => {
      e.preventDefault();
      const t = f.time ? parseDuration(f.time, "hours") : null;
      if (t && !t.ok) { setR({ ok: false, error: t.error }); return; }
      start(async () => {
        const o = await saveGoal({ userId, title: f.title, targetDistance: f.targetDistance, targetSeconds: t && t.ok ? t.seconds : undefined, dueOn: f.dueOn });
        setR(o); if (o.ok) { setF({ title: "", targetDistance: "", time: "", dueOn: "" }); router.refresh(); }
      });
    }}>
      <input aria-label="Meta" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={input} placeholder="Meta (ex.: 10 km abaixo de 42:00)" />
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Distância" value={f.targetDistance} onChange={(e) => setF({ ...f, targetDistance: e.target.value })} className={input}>
          <option value="">Distância</option><option value="3K">3 km</option><option value="5K">5 km</option><option value="10K">10 km</option><option value="HALF">Meia</option><option value="MARATHON">Maratona</option>
        </select>
        <input aria-label="Tempo alvo" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={clsx(input, "tabular")} placeholder="Tempo" />
        <input aria-label="Prazo" type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} className={input} />
      </div>
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Salvar meta</button><Result r={r} /></div>
    </form>
  );
}
