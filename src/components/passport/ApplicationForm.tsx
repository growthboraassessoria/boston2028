"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { submitApplication } from "@/lib/actions/application";
import { durationPreview, maskDuration, parseDuration, selectAllSoon, typingDigits, validateMark } from "@/lib/domain/time";
import { LAB_STORAGE_KEY } from "@/components/landing/IndexLab";
import { Button } from "@/components/ui/Button";
import { CheckRow, ChoiceCards, FieldShell, TextInput } from "@/components/forms/fields";

type Race = { id: string; name: string; city: string; dateLabel: string };
type YesNo = "yes" | "no" | "";

function newKey() {
  return (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

export function ApplicationForm({ races }: { races: Race[] }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [f, setF] = useState({
    targetChoice: "" as "RACE" | "NONE" | "", targetRaceId: "", hasMark: "" as YesNo, markDistance: "" as "MARATHON" | "HALF" | "",
    markTime: "", markDate: "", markRaceName: "", sessions4plus: "" as YesNo, injury: "" as YesNo, healthConsent: false, availabilityNote: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // A simulação do Index Lab preenche a marca (mesmo aparelho).
  useEffect(() => {
    try {
      const lab = JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) ?? "null") as { distance?: "MARATHON" | "HALF"; time?: string; markDate?: string; raceName?: string } | null;
      // Leitura do armazenamento do aparelho só depois da hidratação (evita HTML diferente do servidor).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (lab?.time) setF((v) => ({ ...v, hasMark: "yes", markDistance: lab.distance ?? "MARATHON", markTime: lab.time ?? "", markDate: lab.markDate ?? "", markRaceName: lab.raceName ?? "" }));
    } catch {
      /* sem armazenamento */
    }
  }, []);

  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()), []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const local: Record<string, string> = {};
    let seconds: number | undefined;
    if (f.hasMark === "yes") {
      const t = parseDuration(f.markTime, "hours");
      if (!t.ok) local.markSeconds = t.error;
      else if (f.markDistance) {
        const bad = validateMark(f.markDistance, t.seconds);
        if (bad) local.markSeconds = bad; else seconds = t.seconds;
      }
      if (f.markDate && f.markDate > today) local.markDate = "A data não pode estar no futuro.";
    }
    if (Object.keys(local).length) { setErrors(local); return; }
    const fd = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("proof", file);
    key.current ??= newKey(); // mesma chave em reenvios: a candidatura não duplica
    const idempotencyKey = key.current;
    start(async () => {
      const r = await submitApplication({
        idempotencyKey, targetChoice: f.targetChoice || undefined, targetRaceId: f.targetRaceId,
        hasMark: f.hasMark || undefined, markDistance: f.markDistance || undefined, markSeconds: seconds, markDate: f.markDate,
        markRaceName: f.markRaceName || undefined, sessions4plus: f.sessions4plus || undefined, injury: f.injury || undefined,
        healthConsent: f.healthConsent, availabilityNote: f.availabilityNote || undefined,
      }, file ? fd : null);
      if (r.ok) {
        try { localStorage.removeItem(LAB_STORAGE_KEY); } catch { /* ok */ }
        router.replace(`/passport/candidatura?enviada=1${r.message ? `&aviso=${encodeURIComponent(r.message)}` : ""}`);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setServerError(r.error);
      }
    });
  }

  const yesNo = (name: "sessions4plus" | "injury" | "hasMark", legend: string, error?: string) => (
    <ChoiceCards name={name} legend={legend} value={f[name]} onChange={(v) => set(name, v)} invalid={!!error} error={error}
      options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]} />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-7">
      <section className="grid gap-4" aria-labelledby="q-prova">
        <h2 id="q-prova" className="text-lg font-semibold text-mist-50">1. Prova alvo em 2027</h2>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {races.map((r) => (
            <label key={r.id} className={clsx("flex min-h-14 cursor-pointer flex-col justify-center rounded-md border px-4 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-volt",
              f.targetChoice === "RACE" && f.targetRaceId === r.id ? "border-volt bg-volt/10" : errors.targetChoice || errors.targetRaceId ? "border-danger/60" : "border-white/12 hover:border-white/30")}>
              <input type="radio" name="target" className="sr-only" checked={f.targetChoice === "RACE" && f.targetRaceId === r.id}
                onChange={() => setF((s) => ({ ...s, targetChoice: "RACE", targetRaceId: r.id }))} />
              <span className={clsx("font-medium", f.targetRaceId === r.id && f.targetChoice === "RACE" ? "text-volt" : "text-mist-50")}>{r.city}</span>
              <span className="text-xs text-mist-400">{r.name} · {r.dateLabel}</span>
            </label>
          ))}
          <label className={clsx("flex min-h-14 cursor-pointer flex-col justify-center rounded-md border px-4 py-2.5",
            f.targetChoice === "NONE" ? "border-volt bg-volt/10" : "border-white/12 hover:border-white/30")}>
            <input type="radio" name="target" className="sr-only" checked={f.targetChoice === "NONE"} onChange={() => setF((s) => ({ ...s, targetChoice: "NONE", targetRaceId: "" }))} />
            <span className={clsx("font-medium", f.targetChoice === "NONE" ? "text-volt" : "text-mist-50")}>Nenhuma por enquanto</span>
            <span className="text-xs text-mist-400">A coordenação conversa com você</span>
          </label>
        </div>
        {(errors.targetChoice || errors.targetRaceId) && <p role="alert" className="text-sm text-danger">{errors.targetChoice ?? errors.targetRaceId}</p>}
      </section>

      <section className="grid gap-4" aria-labelledby="q-marca">
        <h2 id="q-marca" className="text-lg font-semibold text-mist-50">2. Marca recente</h2>
        {yesNo("hasMark", "Você tem uma maratona ou meia maratona recente?", errors.hasMark)}
        {f.hasMark === "yes" && (
          <div className="grid gap-4 rounded-lg border border-white/10 p-4">
            <ChoiceCards name="markDistance" legend="Distância" value={f.markDistance} onChange={(v) => set("markDistance", v)} invalid={!!errors.markDistance} error={errors.markDistance}
              options={[{ value: "MARATHON", label: "Maratona" }, { value: "HALF", label: "Meia maratona", hint: "Só para a triagem interna" }]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell id="markTime" label="Tempo (h:mm:ss)" error={errors.markSeconds} live
                hint={durationPreview(f.markTime) ? `Vai ficar ${durationPreview(f.markTime)}` : "Digite só os números: 031230 (ou 31230) vira 3:12:30."}>
                <TextInput id="markTime" inputMode="numeric" placeholder="3:12:30" value={f.markTime} className="tabular"
                  onChange={(e) => set("markTime", typingDigits(e.target.value))} onFocus={(e) => { set("markTime", typingDigits(f.markTime)); selectAllSoon(e.currentTarget); }}
                  onBlur={() => set("markTime", maskDuration(f.markTime))} invalid={!!errors.markSeconds} />
              </FieldShell>
              <FieldShell id="markDate" label="Data da prova" error={errors.markDate}>
                <TextInput id="markDate" type="date" max={today} value={f.markDate} onChange={(e) => set("markDate", e.target.value)} invalid={!!errors.markDate} />
              </FieldShell>
            </div>
            <FieldShell id="markRace" label="Nome da prova" optional>
              <TextInput id="markRace" maxLength={120} value={f.markRaceName} onChange={(e) => set("markRaceName", e.target.value)} />
            </FieldShell>
            <FieldShell id="proof" label="Comprovante" optional hint="Print ou PDF do resultado oficial (JPG, PNG, WEBP ou PDF, até 10 MB).">
              <input ref={fileRef} id="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="block w-full text-sm text-mist-200 file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-white/10 file:px-4 file:text-mist-50" />
            </FieldShell>
          </div>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="q-rotina">
        <h2 id="q-rotina" className="text-lg font-semibold text-mist-50">3. Rotina e saúde</h2>
        {yesNo("sessions4plus", "Você treina pelo menos 4 vezes por semana?", errors.sessions4plus)}
        {yesNo("injury", "Você está em tratamento de alguma lesão hoje?", errors.injury)}
        <CheckRow id="healthConsent" checked={f.healthConsent} onChange={(v) => set("healthConsent", v)} invalid={!!errors.healthConsent}>
          Autorizo o uso da resposta sobre lesão (só sim ou não) para a triagem técnica. Ela fica restrita à coordenação técnica,
          não aparece em perfil, ranking ou parceiros e é guardada pelo prazo do programa.
        </CheckRow>
        {errors.healthConsent && <p role="alert" className="text-sm text-danger">{errors.healthConsent}</p>}
        <FieldShell id="availability" label="Disponibilidade de treino" optional hint="Dias e horários, se quiser contar.">
          <TextInput id="availability" maxLength={500} value={f.availabilityNote} onChange={(e) => set("availabilityNote", e.target.value)} />
        </FieldShell>
      </section>

      <p className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-mist-200">
        Responda tudo, mesmo que alguma resposta pareça te tirar da régua. O resultado é preliminar: a coordenação técnica analisa cada caso pessoalmente.
      </p>
      {serverError && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-mist-50">{serverError}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">{pending ? "Enviando…" : "Enviar candidatura"}</Button>
    </form>
  );
}
