"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ArrowRight, Info, ShieldAlert } from "lucide-react";
import { runIndexLab, FIT_COPY, type LabInput } from "@/lib/domain/index-lab";
import { CATEGORY_LABEL, formatDateBR, type ReferenceCategory, type StandardsVersion } from "@/lib/domain/standards";
import { durationPreview, formatDuration, maskDuration, parseDuration, selectAllSoon, typingDigits } from "@/lib/domain/time";
import { saveSimulation } from "@/lib/actions/simulation";
import { Button } from "@/components/ui/Button";

export const LAB_STORAGE_KEY = "rtb.lab.v1";

type FormState = {
  birthDate: string;
  category: ReferenceCategory | "";
  distance: "MARATHON" | "HALF";
  time: string;
  markDate: string;
  raceName: string;
};

const EMPTY: FormState = { birthDate: "", category: "", distance: "MARATHON", time: "", markDate: "", raceName: "" };

function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function IndexLab({ version, compact = false }: { version: StandardsVersion | null; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Retoma uma simulação feita antes (mesmo aparelho), para não perder o contexto.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<FormState>;
        // Leitura do armazenamento do aparelho só depois da hidratação (evita HTML diferente do servidor).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm((f) => ({ ...f, ...saved }));
      }
    } catch {
      /* armazenamento indisponível: segue sem retomar */
    }
  }, []);

  const parsedTime = useMemo(() => (form.time ? parseDuration(form.time, "hours") : null), [form.time]);
  const today = todayBR();

  const result = useMemo(() => {
    if (!submitted) return null;
    if (!form.category) return { ok: false as const, errors: { category: "Escolha a categoria de referência." } };
    if (!parsedTime || !parsedTime.ok) return { ok: false as const, errors: { seconds: parsedTime && !parsedTime.ok ? parsedTime.error : "Informe o tempo." } };
    const input: LabInput = {
      birthDate: form.birthDate, category: form.category, distance: form.distance, seconds: parsedTime.seconds,
      markDate: form.markDate, raceName: form.raceName || undefined, today,
    };
    return runIndexLab(input, version);
  }, [submitted, form, parsedTime, version, today]);

  const errors = result && !result.ok ? result.errors : {};

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function persist() {
    try {
      localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(form));
    } catch {
      /* sem armazenamento local: a simulação também fica no servidor pelo cookie anônimo */
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    persist();
    const t = parseDuration(form.time, "hours");
    if (form.category && t.ok && form.birthDate && form.markDate) {
      startTransition(async () => {
        const r = await saveSimulation({
          birthDate: form.birthDate, category: form.category, distance: form.distance, seconds: t.seconds,
          markDate: form.markDate, raceName: form.raceName || undefined,
        });
        if (!r.ok && r.error === "rate_limited") setSaveError("Muitas simulações seguidas. O resultado aparece, mas não foi salvo.");
      });
    }
  }

  function goToPassport() {
    persist();
    router.push("/cadastro?origem=index-lab");
  }

  if (!version) {
    return (
      <div role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-5 text-sm text-mist-100">
        A tabela oficial de índices está indisponível agora. Por segurança, não mostramos números sem a fonte confirmada.
        Tente novamente em instantes.
      </div>
    );
  }

  return (
    <div className={clsx("grid gap-6", !compact && "lg:grid-cols-[1.05fr_1fr] lg:gap-8")}>
      <form onSubmit={onSubmit} noValidate className="rounded-xl border border-white/10 bg-night-850/70 p-5 sm:p-7" aria-describedby={`${id}-privacy`}>
        <div className="flex items-center justify-between gap-3">
          <span className="label-mono text-volt">Boston Index Lab</span>
          <span className="label-mono text-mist-400">Simulação</span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id={`${id}-birth`} label="Data de nascimento" error={errors.birthDate}>
            <input id={`${id}-birth`} type="date" required value={form.birthDate} max={today}
              onChange={(e) => update("birthDate", e.target.value)} className={inputClass(!!errors.birthDate)}
              aria-invalid={!!errors.birthDate} aria-describedby={errors.birthDate ? `${id}-birth-err` : undefined} autoComplete="bday" />
          </Field>
          <Field id={`${id}-time`} label={form.distance === "HALF" ? "Tempo da meia (h:mm:ss)" : "Tempo da maratona (h:mm:ss)"} error={errors.seconds}
            hint={durationPreview(form.time) ? `Vai ficar ${durationPreview(form.time)}` : form.distance === "HALF" ? "Digite só os números: 013240 (ou 13240) vira 1:32:40." : "Digite só os números: 031230 (ou 31230) vira 3:12:30."}>
            <input id={`${id}-time`} inputMode="numeric" placeholder={form.distance === "HALF" ? "1:32:40" : "3:12:30"} required
              value={form.time} onChange={(e) => update("time", typingDigits(e.target.value))}
              onFocus={(e) => { update("time", typingDigits(form.time)); selectAllSoon(e.currentTarget); }} onBlur={() => update("time", maskDuration(form.time))}
              className={clsx(inputClass(!!errors.seconds), "tabular")} aria-invalid={!!errors.seconds}
              aria-describedby={errors.seconds ? `${id}-time-err` : `${id}-time-hint`} />
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-mist-100">Categoria de referência do índice</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {(["F", "M", "X", "OTHER"] as const).map((c) => (
              <label key={c} className={clsx(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-center text-sm transition-colors",
                form.category === c ? "border-volt bg-volt/10 text-volt" : "border-white/12 text-mist-200 hover:border-white/30",
              )}>
                <input type="radio" name={`${id}-cat`} value={c} checked={form.category === c} onChange={() => update("category", c)} className="sr-only" />
                {c === "OTHER" ? "Para-atleta / especial" : CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
          {errors.category && <p className="mt-2 text-sm text-danger" role="alert">{errors.category}</p>}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-mist-100">Sua marca recente</legend>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
            {([["MARATHON", "Maratona"], ["HALF", "Meia maratona"]] as const).map(([v, label]) => (
              <label key={v} className={clsx(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-3 text-sm transition-colors",
                form.distance === v ? "border-volt bg-volt/10 text-volt" : "border-white/12 text-mist-200 hover:border-white/30",
              )}>
                <input type="radio" name={`${id}-dist`} value={v} checked={form.distance === v} onChange={() => update("distance", v)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id={`${id}-date`} label="Data da prova" error={errors.markDate}>
            <input id={`${id}-date`} type="date" required value={form.markDate} max={today}
              onChange={(e) => update("markDate", e.target.value)} className={inputClass(!!errors.markDate)} aria-invalid={!!errors.markDate} />
          </Field>
          <Field id={`${id}-race`} label="Prova (opcional)">
            <input id={`${id}-race`} value={form.raceName} maxLength={120} placeholder="Ex.: Maratona de Porto Alegre"
              onChange={(e) => update("raceName", e.target.value)} className={inputClass(false)} />
          </Field>
        </div>

        {"form" in errors && errors.form && <p className="mt-4 text-sm text-danger" role="alert">{errors.form}</p>}

        <Button type="submit" size="lg" className="mt-7 w-full">
          Calcular meu índice
        </Button>
        <p id={`${id}-privacy`} className="mt-3 text-xs leading-relaxed text-mist-400">
          Simulação anônima: não pedimos nome nem contato aqui. Guardamos só os números da simulação, sem identificar você.
        </p>
      </form>

      <div aria-live="polite" className="min-h-[18rem]">
        {result && result.ok ? (
          <LabResultCard result={result} version={version} distance={form.distance} onPassport={goToPassport} saving={pending} saveError={saveError} />
        ) : (
          <LabIdle version={version} />
        )}
      </div>
    </div>
  );
}

function LabIdle({ version }: { version: StandardsVersion }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-dashed border-white/12 p-6 sm:p-7">
      <div>
        <p className="label-mono text-mist-400">Como calculamos</p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mist-200">
          <li>Sua idade é a que você terá no dia da Boston Marathon 2028 ({formatDateBR(version.raceDate)}), como faz a B.A.A.</li>
          <li>O índice vem da tabela oficial vigente, com fonte e data da consulta logo abaixo.</li>
          <li>Com meia maratona, usamos o tempo × 2 apenas como triagem interna da BORA.</li>
        </ul>
      </div>
      <SourceNote version={version} />
    </div>
  );
}

function LabResultCard({ result, version, distance, onPassport, saving, saveError }: {
  result: Extract<ReturnType<typeof runIndexLab>, { ok: true }>;
  version: StandardsVersion; distance: "MARATHON" | "HALF"; onPassport: () => void; saving: boolean; saveError: string | null;
}) {
  const copy = FIT_COPY[result.fit];
  const gap = result.gapSeconds;
  return (
    <div className="rise flex h-full flex-col rounded-xl border border-white/10 bg-linear-to-b from-night-800 to-night-850 p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <span className="label-mono text-mist-300">Resultado da simulação</span>
        <span className="label-mono rounded-sm border border-white/15 px-2 py-1 text-mist-200">Faixa {result.ageGroup ?? "—"}</span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat label="Índice oficial da faixa" value={result.standardSeconds !== null ? formatDuration(result.standardSeconds) : "—"} strong />
        <Stat label={distance === "HALF" ? "Sua meia × 2" : "Seu tempo"} value={formatDuration(result.projectedMarathonSeconds)} />
        <Stat label="Diferença para o índice" value={gap !== null ? formatDuration(gap, { sign: true }) : "—"} tone={gap !== null && gap <= 0 ? "good" : undefined} />
        <Stat label="Idade no dia da prova" value={`${result.age} anos`} />
        <Stat label="Ritmo necessário" value={result.requiredPace ?? "—"} />
        <Stat label="Seu ritmo hoje" value={result.currentPace} />
      </dl>

      <div className={clsx("mt-6 rounded-lg border p-4",
        result.fit === "WITHIN" ? "border-volt/40 bg-volt/[0.07]" : "border-white/10 bg-white/[0.03]")}>
        <p className={clsx("font-semibold", result.fit === "WITHIN" ? "text-volt" : "text-mist-50")}>{copy.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist-200">{copy.body}</p>
        {result.officialQualifies && (
          <p className="mt-2 text-sm leading-relaxed text-mist-100">
            Seu tempo de maratona já está no índice oficial da faixa. Lembre: isso dá direito a pedir inscrição, não garante a vaga.
          </p>
        )}
      </div>

      {result.notes.map((n) => (
        <p key={n} className="mt-3 flex gap-2 text-sm leading-relaxed text-mist-200">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-300" aria-hidden /> {n}
        </p>
      ))}

      <p className="mt-3 flex gap-2 text-sm leading-relaxed text-mist-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        Atingir o índice não garante inscrição na Boston Marathon: a B.A.A. pode aplicar corte adicional (em 2027, 5min17s abaixo do índice).
      </p>

      <div className="mt-auto pt-6">
        <Button type="button" size="lg" className="w-full" onClick={onPassport}>
          Criar meu Boston Passport <ArrowRight className="size-4" aria-hidden />
        </Button>
        <p className="mt-2 text-center text-xs text-mist-400">
          {saving ? "Guardando a simulação…" : saveError ?? "Sua simulação segue com você depois do login."}
        </p>
        <SourceNote version={version} className="mt-5" />
      </div>
    </div>
  );
}

function SourceNote({ version, className }: { version: StandardsVersion; className?: string }) {
  return (
    <p className={clsx("text-xs leading-relaxed text-mist-400", className)}>
      Fonte: <a className="underline decoration-white/30 underline-offset-2 hover:text-volt" href={version.sourceUrl} target="_blank" rel="noopener noreferrer">
        {version.label}</a> · consultada em {formatDateBR(version.consultedAt)} · idade no dia {formatDateBR(version.raceDate)}.
    </p>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" }) {
  return (
    <div>
      <dt className="text-xs text-mist-300">{label}</dt>
      <dd className={clsx("tabular mt-1 font-mono text-xl", strong ? "text-mist-50" : "text-mist-100", tone === "good" && "text-volt")}>{value}</dd>
    </div>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-mist-100">{label}</label>
      <div className="mt-2">{children}</div>
      {error ? <p id={`${id}-err`} className="mt-2 text-sm text-danger" role="alert">{error}</p>
        : hint && <p id={`${id}-hint`} className="mt-2 text-xs text-mist-400" aria-live="polite">{hint}</p>}
    </div>
  );
}

function inputClass(invalid: boolean) {
  return clsx(
    "block min-h-12 w-full rounded-md border bg-night-950/60 px-3.5 text-mist-50 placeholder:text-mist-500",
    "outline-none transition-colors focus:border-volt [color-scheme:dark]",
    invalid ? "border-danger" : "border-white/12",
  );
}
