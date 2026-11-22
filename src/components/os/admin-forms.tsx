"use client";

// Formulários e controles das páginas de administração do OS (vínculo, comercial, jornadas, testes,
// comunicações, analytics, configurações). Cada envio chama uma Server Action que confere o papel de novo.
import { lazy, Suspense, useId, useState, useSyncExternalStore, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { scheduleReassessment, updateOpportunity, validateTestResult, type OsResult } from "@/lib/actions/os";
import {
  addHoliday, anonymizeAthlete, grantRole, handleDataRequest, processOutboxNow, removeHoliday, revokeRole, saveRace, saveSetting,
  saveTemplate, setFlag,
} from "@/lib/actions/admin";

const input = "block min-h-10 w-full rounded-[3px] border border-white/12 bg-[#060f20] px-3 text-sm text-mist-50 outline-none focus:border-volt [color-scheme:dark]";
const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-semibold transition-colors disabled:opacity-50";
const primary = clsx(btn, "bg-volt text-night-950 hover:bg-[#d8ff3d]");
const ghost = clsx(btn, "border border-white/15 text-mist-100 hover:border-volt");
const label = "grid gap-1.5 text-sm text-mist-200";
const check = "size-4 shrink-0 accent-[#ceff00]";

function Result({ r }: { r: OsResult | null }) {
  if (!r) return null;
  return r.ok ? <p role="status" className="text-sm text-volt">{r.message}</p> : <p role="alert" className="text-sm text-danger">{r.error}</p>;
}

/** Envio padrão: guarda o resultado e atualiza a página quando dá certo. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<OsResult | null>(null);
  function run(fn: () => Promise<OsResult>, onOk?: () => void) {
    start(async () => {
      try {
        const o = await fn();
        setR(o);
        if (o.ok) {
          onOk?.();
          router.refresh();
        }
      } catch (e) {
        unstable_rethrow(e); // redirecionamentos do Next (sessão expirada, papel sem acesso) seguem o fluxo normal
        setR({ ok: false, error: "Não foi possível falar com o servidor. Confira a conexão e tente de novo." });
      }
    });
  }
  return { pending, r, setR, run };
}

// ── Linha expansível (tabelas do OS) ─────────────────────────────────────────

/** Linha de tabela com detalhe embaixo. O detalhe só monta na primeira abertura e acompanha a rolagem horizontal no celular. */
export function ExpandRow({ cells, detail, colSpan, label: action, name }: {
  cells: React.ReactNode; detail: React.ReactNode; colSpan: number; label: string; name: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const id = useId();
  return (
    <>
      <tr className={clsx("hover:bg-white/[0.02]", open && "bg-white/[0.025]")}>
        {cells}
        <td className="px-3 py-2.5 text-right align-top">
          <button type="button" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Fechar" : action}: ${name}`}
            onClick={() => { setMounted(true); setOpen((o) => !o); }}
            className={clsx(btn, "min-h-9 whitespace-nowrap border px-2.5 text-xs", open ? "border-volt text-volt" : "border-white/15 text-mist-100 hover:border-volt")}>
            {open ? "Fechar" : action}
          </button>
        </td>
      </tr>
      <tr id={id} hidden={!open} className="bg-[#081428]">
        <td colSpan={colSpan} className="p-0">
          <div className="sticky left-0 max-w-[calc(100vw-2rem)] border-l-2 border-volt/60 p-4 lg:max-w-[calc(100vw-20rem)]">{mounted && detail}</div>
        </td>
      </tr>
    </>
  );
}

// ── Comercial ────────────────────────────────────────────────────────────────

const OPP_STATUS: [string, string][] = [
  ["OPEN", "Aberta"], ["CONTACTED", "Contato feito"], ["NEGOTIATING", "Em conversa"], ["ON_HOLD", "Em espera"],
  ["WON", "Ganha (matrícula verificada)"], ["LOST", "Perdida"],
];

export type OpportunityValues = { id: string; status: string; ownerId: string; nextAction: string; nextActionOn: string; lostReason: string };

export function OpportunityForm({ initial, owners, canWin }: { initial: OpportunityValues; owners: { id: string; name: string }[]; canWin: boolean }) {
  const { pending, r, setR, run } = useAction();
  const [f, setF] = useState({ ...initial, note: "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      if (f.status === "LOST" && f.lostReason.trim().length < 3) { setR({ ok: false, error: "Escreva o motivo da perda." }); return; }
      run(() => updateOpportunity({ id: f.id, status: f.status, ownerId: f.ownerId, nextAction: f.nextAction, nextActionOn: f.nextActionOn,
        note: f.note, lostReason: f.status === "LOST" ? f.lostReason : "" }), () => set("note", ""));
    }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className={label}>Status
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className={input}>
            {OPP_STATUS.map(([k, v]) => <option key={k} value={k} disabled={k === "WON" && !canWin && initial.status !== "WON"}>{v}</option>)}
          </select>
        </label>
        <label className={label}>Responsável
          <select value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={input}>
            <option value="">Sem responsável</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className={label}>Próxima ação
          <input value={f.nextAction} maxLength={300} onChange={(e) => set("nextAction", e.target.value)} className={input} placeholder="Ex.: ligar para explicar a matrícula" />
        </label>
        <label className={label}>Data da próxima ação
          <input type="date" value={f.nextActionOn} onChange={(e) => set("nextActionOn", e.target.value)} className={input} />
        </label>
      </div>
      {f.status === "LOST" && (
        <label className={label}>Motivo da perda (obrigatório)
          <input value={f.lostReason} maxLength={300} onChange={(e) => set("lostReason", e.target.value)} className={input} placeholder="Ex.: decidiu treinar sozinho por agora" />
        </label>
      )}
      <label className={label}>Nota para o histórico (opcional, sem dado de saúde)
        <textarea rows={2} maxLength={2000} value={f.note} onChange={(e) => set("note", e.target.value)} className={clsx(input, "py-2")} />
      </label>
      {!canWin && initial.status !== "WON" && (
        <p className="text-xs leading-relaxed text-mist-500">“Ganha” fica bloqueado: só vale com matrícula verificada pela equipe de vínculo. Quando a matrícula é confirmada lá, a oportunidade vira “Ganha” sozinha.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Salvando…" : "Salvar oportunidade"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

// ── Jornadas ─────────────────────────────────────────────────────────────────

export function ReassessmentForm({ userId, applicationId, minDate }: { userId: string; applicationId: string | null; minDate: string }) {
  const { pending, r, setR, run } = useAction();
  const [f, setF] = useState({ date: "", reason: "" });
  const ids = useId();
  return (
    <form className="grid gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (!f.date) { setR({ ok: false, error: "Escolha a data da reavaliação." }); return; }
      run(() => scheduleReassessment(userId, applicationId, f.date, f.reason.trim()), () => setF({ date: "", reason: "" }));
    }}>
      <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
        <label className={label} htmlFor={`${ids}-d`}>Data
          <input id={`${ids}-d`} type="date" required min={minDate} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={input} />
        </label>
        <label className={label} htmlFor={`${ids}-m`}>Motivo (o atleta vê)
          <input id={`${ids}-m`} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={input} placeholder="Ex.: reavaliar após o bloco de base" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={ghost}>{pending ? "Agendando…" : "Agendar reavaliação"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

// ── Testes ───────────────────────────────────────────────────────────────────

export function TestReviewForm({ resultId, athlete }: { resultId: string; athlete: string }) {
  const { pending, r, setR, run } = useAction();
  const [note, setNote] = useState("");
  const go = (status: "VALIDATED" | "REJECTED") => {
    if (status === "REJECTED" && note.trim().length < 3) { setR({ ok: false, error: "Para não validar, escreva o motivo (o atleta vê)." }); return; }
    run(() => validateTestResult(resultId, status, note.trim()), () => setNote(""));
  };
  return (
    <div className="grid min-w-[15rem] gap-2">
      <input aria-label={`Observação para ${athlete}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={clsx(input, "min-h-9")} placeholder="Observação (o atleta vê)" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => go("VALIDATED")} className={clsx(primary, "min-h-9 px-3 text-xs")}>Validar</button>
        <button type="button" disabled={pending} onClick={() => go("REJECTED")} className={clsx(ghost, "min-h-9 px-3 text-xs")}>Não validar</button>
      </div>
      <Result r={r} />
    </div>
  );
}

// ── Comunicações ─────────────────────────────────────────────────────────────

export type TemplateValues = { key: string; subject: string; preheader: string; body: string; ctaLabel: string; ctaPath: string; active: boolean };

export function TemplateForm({ initial, variables }: { initial: TemplateValues; variables: string[] }) {
  const { pending, r, run } = useAction();
  const [f, setF] = useState(initial);
  const set = <K extends keyof TemplateValues>(k: K, v: TemplateValues[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveTemplate(f)); }}>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className={label}>Assunto
          <input required minLength={3} maxLength={160} value={f.subject} onChange={(e) => set("subject", e.target.value)} className={input} />
        </label>
        <label className={label}>Pré-cabeçalho (aparece ao lado do assunto)
          <input maxLength={200} value={f.preheader} onChange={(e) => set("preheader", e.target.value)} className={input} />
        </label>
      </div>
      <label className={label}>Corpo (texto simples; linha em branco separa parágrafos)
        <textarea required minLength={10} maxLength={8000} rows={7} value={f.body} onChange={(e) => set("body", e.target.value)} className={clsx(input, "py-2 leading-relaxed")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Texto do botão
          <input maxLength={40} value={f.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} className={input} placeholder="Ex.: Abrir meu passaporte" />
        </label>
        <label className={label}>Caminho do botão (dentro do site)
          <input maxLength={300} value={f.ctaPath} onChange={(e) => set("ctaPath", e.target.value)} className={clsx(input, "font-mono")} placeholder="/passport" />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-mist-500">
        Variáveis deste modelo: {variables.length ? variables.map((v) => <code key={v} className="mr-1.5 font-mono text-mist-300">{`{{${v}}}`}</code>) : "nenhuma"}. O servidor escapa tudo e aplica o layout BORA.
      </p>
      <label className="flex items-center gap-2 text-sm text-mist-200">
        <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className={check} />
        Modelo ativo (inativo: nenhum e-mail novo é enfileirado com ele)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Salvando…" : "Salvar modelo"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

export function ProcessOutboxButton() {
  const { pending, r, run } = useAction();
  const skipped = r?.ok === true && !!(r.data as { skipped?: string } | undefined)?.skipped;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => run(() => processOutboxNow())} className={ghost}>{pending ? "Processando…" : "Processar fila agora"}</button>
      {skipped && r?.ok ? <p role="status" className="text-sm text-warn">{r.message}</p> : <Result r={r} />}
    </div>
  );
}

// ── Analytics (gráfico) ──────────────────────────────────────────────────────

export type ChartDatum = { label: string; value: number };

const noopSubscribe = () => () => {};
/** false no servidor e na hidratação, true depois: o gráfico só desenha no navegador (sem divergência de hidratação). */
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const nf = new Intl.NumberFormat("pt-BR");
const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ value?: unknown; payload?: unknown }>; metric: string };

function ChartTip({ active, payload, metric }: TipProps) {
  const item = payload?.[0];
  if (!active || !item) return null;
  const d = item.payload as ChartDatum | undefined;
  return (
    <div className="rounded-[3px] border border-white/10 bg-[#050c1a] px-3 py-2 text-xs shadow-xl">
      <p className="tabular font-mono text-base font-semibold text-mist-50">{nf.format(Number(item.value ?? 0))}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-mist-300"><span aria-hidden className="inline-block h-0.5 w-3 bg-volt" />{metric}</p>
      <p className="mt-1 max-w-[16rem] text-mist-400">{d?.label}</p>
    </div>
  );
}

// Recharts só carrega quando o gráfico aparece (fica fora do pacote das outras páginas do OS).
const FunnelBars = lazy(async () => {
  const R = await import("recharts");
  function Bars({ data, metric }: { data: ChartDatum[]; metric: string }) {
    const height = data.length * 34 + 40;
    // Largura do eixo pelo maior rótulo (até 22 caracteres): sobra espaço para as barras no celular.
    const axisWidth = Math.min(150, Math.max(56, Math.max(...data.map((d) => short(d.label).length)) * 7 + 12));
    return (
      <R.BarChart layout="vertical" data={data} width="100%" height={height} responsive margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
        barCategoryGap={8} accessibilityLayer>
        <R.CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.07)" />
        <R.XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#8392a8", fontSize: 11 }}
          tickFormatter={(v: number) => nf.format(v)} />
        <R.YAxis type="category" dataKey="label" width={axisWidth} axisLine={false} tickLine={false} tick={{ fill: "#cbd3df", fontSize: 12 }}
          tickFormatter={(v: string) => short(String(v))} />
        <R.Tooltip cursor={{ fill: "rgba(255,255,255,0.05)", stroke: "none" }} isAnimationActive={false}
          content={(p) => <ChartTip active={p.active} payload={p.payload} metric={metric} />} />
        <R.Bar dataKey="value" name={metric} fill="#ceff00" activeBar={{ fill: "#e2ff66" }} maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <R.LabelList dataKey="value" position="right" fill="#cbd3df" fontSize={11} formatter={(v: unknown) => nf.format(Number(v ?? 0))} />
        </R.Bar>
      </R.BarChart>
    );
  }
  return { default: Bars };
});

export function FunnelChart({ data, metric }: { data: ChartDatum[]; metric: string }) {
  const hydrated = useHydrated();
  const height = data.length * 34 + 40;
  if (!data.length) return <p className="py-6 text-center text-sm text-mist-400">Nada observado no período.</p>;
  // Um grupo só não vira gráfico de uma barra: o número basta.
  const only = data.length === 1 ? data[0] : undefined;
  if (only) {
    return (
      <div className="py-2">
        <p className="text-sm text-mist-300">Um grupo só no período: <span className="font-medium text-mist-50">{only.label}</span></p>
        <p className="mt-1 text-sm text-mist-400">{metric}: <span className="text-3xl font-semibold text-mist-50">{nf.format(only.value)}</span></p>
      </div>
    );
  }
  const placeholder = <div style={{ height }} className="grid place-items-center text-xs text-mist-500">Carregando gráfico…</div>;
  return (
    <figure aria-label={`${metric} por grupo (observado). Os mesmos números estão na tabela abaixo.`}>
      {hydrated ? <Suspense fallback={placeholder}><FunnelBars data={data} metric={metric} /></Suspense> : placeholder}
    </figure>
  );
}

// ── Configurações · Regras ───────────────────────────────────────────────────

const SETTING_STATUS: [string, string][] = [["approved", "Aprovada (valendo)"], ["proposed", "Proposta (a confirmar)"], ["pending", "Pendente (aguardando decisão)"]];

export function SettingForm({ settingKey, value, status }: { settingKey: string; value: string; status: string }) {
  const { pending, r, setR, run } = useAction();
  const [f, setF] = useState({ value, status });
  const ids = useId();
  return (
    <form className="grid gap-2" onSubmit={(e) => {
      e.preventDefault();
      try { JSON.parse(f.value); } catch { setR({ ok: false, error: "O valor não é um JSON válido. Confira vírgulas, aspas e chaves." }); return; }
      run(() => saveSetting({ key: settingKey, value: f.value, status: f.status }));
    }}>
      <label className={label} htmlFor={`${ids}-v`}>Valor (JSON)
        <textarea id={`${ids}-v`} rows={Math.min(12, f.value.split("\n").length + 1)} spellCheck={false} value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })} className={clsx(input, "py-2 font-mono text-[0.8rem] leading-relaxed")} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label} htmlFor={`${ids}-s`}>Status
          <select id={`${ids}-s`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={clsx(input, "w-64")}>
            {SETTING_STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button disabled={pending} className={primary}>{pending ? "Salvando…" : "Salvar regra"}</button>
      </div>
      <Result r={r} />
    </form>
  );
}

// ── Configurações · Flags ────────────────────────────────────────────────────

export function FlagToggle({ flagKey, enabled, locked, lockReason }: { flagKey: string; enabled: boolean; locked?: boolean; lockReason?: string }) {
  const { pending, r, run } = useAction();
  const hint = useId();
  return (
    <div className="grid justify-items-end gap-1.5">
      <button type="button" role="switch" aria-checked={enabled} aria-label={flagKey}
        aria-describedby={locked && lockReason ? hint : undefined} disabled={pending || locked}
        onClick={() => run(() => setFlag(flagKey, !enabled))}
        className={clsx("inline-flex min-h-10 items-center gap-2.5 rounded-[3px] px-1 text-xs disabled:cursor-not-allowed disabled:opacity-50")}>
        <span aria-hidden className={clsx("relative h-5 w-9 rounded-full border transition-colors", enabled ? "border-volt bg-volt/25" : "border-white/20 bg-white/[0.04]")}>
          <span className={clsx("absolute top-0.5 size-3.5 rounded-full transition-all", enabled ? "left-[1.1rem] bg-volt" : "left-0.5 bg-mist-400")} />
        </span>
        <span className="label-mono w-20 text-left text-[0.6rem] text-mist-300">{enabled ? "Ligado" : "Desligado"}</span>
      </button>
      {locked && lockReason && <p id={hint} className="max-w-[16rem] text-right text-[0.7rem] leading-snug text-mist-500">{lockReason}</p>}
      <Result r={r} />
    </div>
  );
}

// ── Configurações · Provas alvo ──────────────────────────────────────────────

export type RaceValues = {
  id: string; name: string; raceDate: string; raceDateConfirmed: boolean; enrollmentDeadline: string; deadlineConfirmed: boolean;
  sixteenWeeksChecked: boolean; status: string; officialUrl: string; notes: string;
};

export function RaceForm({ initial }: { initial: RaceValues }) {
  const { pending, r, run } = useAction();
  const [f, setF] = useState(initial);
  const set = <K extends keyof RaceValues>(k: K, v: RaceValues[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveRace(f)); }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className={clsx(label, "sm:col-span-2")}>Nome oficial
          <input required minLength={3} maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
        </label>
        <label className={label}>Status
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className={input}>
            <option value="provisional">Provisória (a confirmar)</option><option value="confirmed">Confirmada</option><option value="archived">Arquivada</option>
          </select>
        </label>
        <label className={label}>Link oficial (https)
          <input type="url" maxLength={500} value={f.officialUrl} onChange={(e) => set("officialUrl", e.target.value)} className={input} placeholder="https://" />
        </label>
        <label className={label}>Data da prova
          <input type="date" value={f.raceDate} onChange={(e) => set("raceDate", e.target.value)} className={input} />
        </label>
        <label className={label}>Prazo de inscrição
          <input type="date" value={f.enrollmentDeadline} onChange={(e) => set("enrollmentDeadline", e.target.value)} className={input} />
        </label>
      </div>
      <fieldset className="grid gap-2">
        <legend className="label-mono mb-1 text-[0.6rem] text-mist-500">Conferência na fonte oficial</legend>
        <label className="flex items-center gap-2 text-sm text-mist-200"><input type="checkbox" checked={f.raceDateConfirmed} onChange={(e) => set("raceDateConfirmed", e.target.checked)} className={check} />Data confirmada na fonte oficial</label>
        <label className="flex items-center gap-2 text-sm text-mist-200"><input type="checkbox" checked={f.deadlineConfirmed} onChange={(e) => set("deadlineConfirmed", e.target.checked)} className={check} />Prazo de inscrição confirmado</label>
        <label className="flex items-center gap-2 text-sm text-mist-200"><input type="checkbox" checked={f.sixteenWeeksChecked} onChange={(e) => set("sixteenWeeksChecked", e.target.checked)} className={check} />Regra de 16 semanas conferida</label>
      </fieldset>
      <label className={label}>Observação interna
        <textarea rows={2} maxLength={1000} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={clsx(input, "py-2")} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Salvando…" : "Salvar prova"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

// ── Configurações · Feriados ─────────────────────────────────────────────────

export function HolidayAddForm() {
  const { pending, r, run } = useAction();
  const [f, setF] = useState({ day: "", label: "", kind: "national" });
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addHoliday(f), () => setF({ day: "", label: "", kind: "national" })); }}>
      <div className="grid gap-2 sm:grid-cols-[11rem_1fr_12rem_auto] sm:items-end">
        <label className={label}>Data<input type="date" required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} className={input} /></label>
        <label className={label}>Nome<input required minLength={3} maxLength={80} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={input} placeholder="Ex.: Aniversário de Brasília" /></label>
        <label className={label}>Tipo
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input}>
            <option value="national">Nacional</option><option value="optional">Ponto facultativo</option><option value="local">Local</option>
          </select>
        </label>
        <button disabled={pending} className={ghost}>{pending ? "Incluindo…" : "Incluir"}</button>
      </div>
      <Result r={r} />
    </form>
  );
}

export function HolidayRemoveButton({ day, name }: { day: string; name: string }) {
  const { pending, r, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} aria-label={`Remover ${name}`} className="min-h-9 px-2 text-xs text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline">Remover</button>;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => removeHoliday(day))} className={clsx(btn, "min-h-9 border border-danger/60 px-2.5 text-xs text-danger hover:bg-danger/10")}>Confirmar remoção</button>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-9 px-2 text-xs text-mist-400 hover:text-mist-100">Cancelar</button>
      <Result r={r} />
    </div>
  );
}

// ── Configurações · Papéis ───────────────────────────────────────────────────

const ROLE_OPTIONS: [string, string][] = [
  ["technical_director", "Coordenação técnica"], ["coach", "Treinador"], ["membership_verifier", "Vínculo (verificação de matrícula)"],
  ["commercial", "Comercial"], ["growth", "Growth"], ["partner_operator", "Operador de parceiro"], ["super_admin", "Super admin"],
];

export function GrantRoleForm({ partners }: { partners: { id: string; name: string }[] }) {
  const { pending, r, run } = useAction();
  const empty = { account: "", role: "coach", scopePolo: "", partnerId: "", displayName: "", note: "" };
  const [f, setF] = useState(empty);
  const set = <K extends keyof typeof empty>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      run(() => grantRole({ ...f, partnerId: f.role === "partner_operator" ? f.partnerId : "" }), () => setF(empty));
    }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className={label}>E-mail da conta (ou ID)
          <input required autoComplete="off" value={f.account} onChange={(e) => set("account", e.target.value)} className={input} placeholder="pessoa@exemplo.com" />
        </label>
        <label className={label}>Papel
          <select value={f.role} onChange={(e) => set("role", e.target.value)} className={input}>
            {ROLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {f.role === "partner_operator" ? (
          <label className={label}>Parceiro
            <select required value={f.partnerId} onChange={(e) => set("partnerId", e.target.value)} className={input}>
              <option value="">Escolha o parceiro</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : (
          <label className={label}>Escopo de polo (opcional)
            <input maxLength={80} value={f.scopePolo} onChange={(e) => set("scopePolo", e.target.value)} className={input} placeholder="Vazio = todos os polos" />
          </label>
        )}
        <label className={label}>Nome de exibição (opcional)
          <input maxLength={80} value={f.displayName} onChange={(e) => set("displayName", e.target.value)} className={input} placeholder="Como aparece para a equipe e o atleta" />
        </label>
        <label className={clsx(label, "sm:col-span-2")}>Observação (obrigatória, fica na auditoria)
          <input required minLength={3} maxLength={500} value={f.note} onChange={(e) => set("note", e.target.value)} className={input} placeholder="Ex.: entrou na equipe de vínculo do DF" />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-mist-500">A pessoa precisa ter entrado no site pelo menos uma vez. O escopo de polo limita vínculo e comercial ao polo escolhido.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={primary}>{pending ? "Concedendo…" : "Conceder papel"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

function ConfirmDialog({ open, onOpenChange, kicker, title, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; kicker: string; title: string; children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed inset-x-3 top-[8vh] z-50 mx-auto max-h-[84vh] max-w-lg overflow-y-auto rounded-[4px] border border-white/10 bg-[#0a1630] p-5 text-mist-100 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-mono text-[0.6rem] text-mist-500">{kicker}</p>
              <Dialog.Title className="mt-1 text-lg font-semibold text-mist-50">{title}</Dialog.Title>
            </div>
            <Dialog.Close className="grid size-10 place-items-center text-mist-300 hover:text-mist-50" aria-label="Fechar"><X className="size-5" aria-hidden /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RevokeRoleButton({ roleId, person, role }: { roleId: string; person: string; role: string }) {
  const { pending, r, setR, run } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const ids = useId();
  return (
    <>
      <button type="button" onClick={() => { setR(null); setOpen(true); }} aria-label={`Revogar ${role} de ${person}`}
        className="min-h-9 px-2 text-xs text-mist-400 underline-offset-4 hover:text-danger hover:underline">Revogar</button>
      <ConfirmDialog open={open} onOpenChange={setOpen} kicker="Papéis · auditado" title="Revogar papel?">
        <Dialog.Description className="mt-2 text-sm leading-relaxed text-mist-300">
          {person} perde o papel <strong className="text-mist-50">{role}</strong> na hora. O registro não é apagado: fica no histórico e na auditoria.
        </Dialog.Description>
        <form className="mt-4 grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          run(() => revokeRole(roleId, note), () => { setNote(""); setTimeout(() => setOpen(false), 900); });
        }}>
          <label className={label} htmlFor={`${ids}-n`}>Motivo (obrigatório)
            <input id={`${ids}-n`} required minLength={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending || note.trim().length < 3} className={clsx(btn, "border border-danger/60 text-danger hover:bg-danger/10")}>{pending ? "Revogando…" : "Revogar papel"}</button>
            <Dialog.Close className={clsx(btn, "text-mist-300 hover:text-mist-50")}>Cancelar</Dialog.Close>
          </div>
          <Result r={r} />
        </form>
      </ConfirmDialog>
    </>
  );
}

// ── Configurações · LGPD ─────────────────────────────────────────────────────

const REQUEST_STATUS: [string, string][] = [["OPEN", "Aberto"], ["IN_PROGRESS", "Em andamento"], ["DONE", "Concluído"], ["REJECTED", "Recusado"]];

export function DataRequestForm({ id, status, response }: { id: string; status: string; response: string }) {
  const { pending, r, run } = useAction();
  const [f, setF] = useState({ status, response });
  const ids = useId();
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => handleDataRequest({ id, ...f })); }}>
      <div className="grid gap-2 sm:grid-cols-[13rem_1fr]">
        <label className={label} htmlFor={`${ids}-s`}>Status
          <select id={`${ids}-s`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={input}>
            {REQUEST_STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={label} htmlFor={`${ids}-r`}>Resposta ao atleta (aparece no Passport)
          <textarea id={`${ids}-r`} rows={2} maxLength={2000} value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} className={clsx(input, "py-2")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={ghost}>{pending ? "Salvando…" : "Salvar pedido"}</button>
        <Result r={r} />
      </div>
    </form>
  );
}

export function AnonymizeButton({ userId, requestId, athlete }: { userId: string; requestId: string; athlete: string }) {
  const { pending, r, setR, run } = useAction();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const ids = useId();
  const ready = word.trim() === "ANONIMIZAR";
  return (
    <>
      <button type="button" onClick={() => { setR(null); setWord(""); setOpen(true); }} className={clsx(btn, "border border-danger/60 text-danger hover:bg-danger/10")}>
        Anonimizar atleta…
      </button>
      <ConfirmDialog open={open} onOpenChange={setOpen} kicker="LGPD · exclusão · irreversível" title={`Anonimizar ${athlete}?`}>
        <Dialog.Description className="mt-2 text-sm leading-relaxed text-mist-300">
          Isto não tem volta. O que acontece:
        </Dialog.Description>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-mist-200">
          <li>Nome vira “Atleta removido”; e-mail, telefone, CEP, cidade e foto são apagados.</li>
          <li>A resposta de saúde é apagada; perfil público e opt-in do ranking são desligados.</li>
          <li>E-mails ainda na fila são cancelados.</li>
          <li>Decisões técnicas, testes e resgates ficam no histórico, sem identificação direta.</li>
          <li>O pedido é marcado como concluído e tudo vai para a auditoria.</li>
        </ul>
        <form className="mt-4 grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          run(() => anonymizeAthlete({ userId, requestId, confirm: word.trim() }), () => setTimeout(() => setOpen(false), 1200));
        }}>
          <label className={label} htmlFor={`${ids}-w`}>Para confirmar, digite ANONIMIZAR
            <input id={`${ids}-w`} autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} className={clsx(input, "font-mono uppercase")} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending || !ready} className={clsx(btn, "bg-danger text-white hover:bg-danger/90")}>{pending ? "Anonimizando…" : "Anonimizar agora"}</button>
            <Dialog.Close className={clsx(btn, "text-mist-300 hover:text-mist-50")}>Cancelar</Dialog.Close>
          </div>
          <Result r={r} />
        </form>
      </ConfirmDialog>
    </>
  );
}
