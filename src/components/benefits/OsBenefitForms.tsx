"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  addBrandPermission, approveManual, cancelRedemption, duplicateBenefit, loadCodes, saveBenefit, savePartner, setBenefitStatus,
  validateRedemption, type BenefitResult,
} from "@/lib/actions/benefits";
import { CATEGORY_LABEL, MODE_LABEL, SCOPE_LABEL } from "./labels";

const input = "block min-h-10 w-full rounded-[3px] border border-white/12 bg-[#060f20] px-3 text-sm text-mist-50 outline-none focus:border-volt [color-scheme:dark]";
const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-semibold transition-colors disabled:opacity-50";
const label = "grid gap-1.5 text-sm text-mist-200";

function Result({ r }: { r: BenefitResult | null }) {
  if (!r) return null;
  return r.ok ? <p role="status" className="text-sm text-volt">{r.message}</p> : <p role="alert" className="text-sm text-danger">{r.error}</p>;
}

export type PartnerValues = {
  id?: string; name: string; slug: string; description: string; category: string; websiteUrl: string; contactName: string;
  contactEmail: string; contactPhone: string; status: string; brandAuthorized: boolean;
};

export function PartnerForm({ initial }: { initial?: PartnerValues }) {
  const router = useRouter();
  const [f, setF] = useState<PartnerValues>(initial ?? { name: "", slug: "", description: "", category: "equipment", websiteUrl: "", contactName: "", contactEmail: "", contactPhone: "", status: "DRAFT", brandAuthorized: false });
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  const logoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof PartnerValues>(k: K, v: PartnerValues[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      const file = logoRef.current?.files?.[0];
      if (file) fd.set("logo", file);
      start(async () => { const o = await savePartner(f, file ? fd : null); setR(o); if (o.ok) router.refresh(); });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Nome<input required className={input} value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className={label}>Identificador (slug)<input required className={input} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="loja-exemplo" /></label>
        <label className={label}>Categoria<select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={label}>Status<select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {["DRAFT", "PENDING", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={label}>Site (https)<input className={input} value={f.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} /></label>
        <label className={label}>Contato<input className={input} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
        <label className={label}>E-mail do contato<input type="email" className={input} value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></label>
        <label className={label}>Telefone (+55…)<input className={input} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></label>
      </div>
      <label className={label}>Descrição<textarea rows={2} className={clsx(input, "py-2")} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className={label}>Logo (JPG, PNG ou WEBP)<input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm text-mist-300" /></label>
      <label className="flex items-center gap-2 text-sm text-mist-200">
        <input type="checkbox" checked={f.brandAuthorized} onChange={(e) => set("brandAuthorized", e.target.checked)} className="size-4 accent-[#ceff00]" />
        Uso da marca autorizado (registre a autorização abaixo; sem isso o logo não aparece para atletas)
      </label>
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "bg-volt text-night-950")}>{pending ? "Salvando…" : "Salvar parceiro"}</button><Result r={r} /></div>
    </form>
  );
}

export function BrandPermissionForm({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [f, setF] = useState({ scope: "", grantedOn: "", expiresOn: "", note: "" });
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  const docRef = useRef<HTMLInputElement>(null);
  return (
    <form className="grid gap-2" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      const file = docRef.current?.files?.[0];
      if (file) fd.set("doc", file);
      start(async () => { const o = await addBrandPermission(partnerId, f.scope, f.grantedOn, f.expiresOn, f.note, file ? fd : null); setR(o); if (o.ok) router.refresh(); });
    }}>
      <input required className={input} placeholder="Escopo (ex.: logo na vitrine do Passport)" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} aria-label="Escopo" />
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Concedida em<input required type="date" className={input} value={f.grantedOn} onChange={(e) => setF({ ...f, grantedOn: e.target.value })} /></label>
        <label className={label}>Vence em<input type="date" className={input} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></label>
      </div>
      <input className={input} placeholder="Observação" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Observação" />
      <label className={label}>Comprovante (PDF ou imagem)<input ref={docRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm text-mist-300" /></label>
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Registrar autorização</button><Result r={r} /></div>
    </form>
  );
}

export type BenefitValues = {
  id?: string; partnerId: string; slug: string; title: string; summary: string; description: string; rules: string; category: string;
  audienceNote: string; journeyScope: string; requiresActiveMember: boolean; cities: string; ufs: string; polos: string; startsAt: string;
  endsAt: string; totalQuantity: string; perMemberLimit: string; restockOnExpiry: boolean; redemptionInstructions: string; mode: string;
  generateCodes: boolean; codeTtlHours: string; terms: string; cancellationPolicy: string; visibility: string; status: string;
  isHealthRelated: boolean; couponCode: string; externalUrl: string;
};

export const EMPTY_BENEFIT: BenefitValues = {
  partnerId: "", slug: "", title: "", summary: "", description: "", rules: "", category: "equipment", audienceNote: "", journeyScope: "ANY",
  requiresActiveMember: true, cities: "", ufs: "", polos: "", startsAt: "", endsAt: "", totalQuantity: "", perMemberLimit: "1",
  restockOnExpiry: false, redemptionInstructions: "", mode: "QR_VALIDATION", generateCodes: true, codeTtlHours: "720", terms: "",
  cancellationPolicy: "", visibility: "VISIBLE", status: "DRAFT", isHealthRelated: false, couponCode: "", externalUrl: "",
};

export function BenefitForm({ initial, partners }: { initial: BenefitValues; partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState<BenefitValues>(initial);
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  const imgRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof BenefitValues>(k: K, v: BenefitValues[K]) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      const file = imgRef.current?.files?.[0];
      if (file) fd.set("image", file);
      start(async () => {
        const o = await saveBenefit({
          ...f, totalQuantity: f.totalQuantity === "" ? null : Number(f.totalQuantity), perMemberLimit: Number(f.perMemberLimit || 1),
          codeTtlHours: Number(f.codeTtlHours || 720),
        }, file ? fd : null);
        setR(o);
        if (o.ok) { const id = (o.data as { id: string }).id; router.push(`/os/beneficios/${id}`); router.refresh(); }
      });
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="label-mono mb-2 text-[0.6rem] text-mist-500">Identificação</legend>
        <label className={label}>Parceiro<select required className={input} value={f.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
          <option value="">Escolha</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={label}>Categoria<select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={label}>Título<input required className={input} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className={label}>Identificador (slug)<input required className={input} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></label>
        <label className={clsx(label, "sm:col-span-2")}>Resumo (aparece no card)<input required maxLength={240} className={input} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></label>
        <label className={clsx(label, "sm:col-span-2")}>Descrição<textarea rows={3} className={clsx(input, "py-2")} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label className={label}>Imagem (JPG, PNG ou WEBP)<input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm text-mist-300" /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="label-mono mb-2 text-[0.6rem] text-mist-500">Elegibilidade</legend>
        <label className={label}>Jornada<select className={input} value={f.journeyScope} onChange={(e) => set("journeyScope", e.target.value)}>
          {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={label}>UFs (vírgula)<input className={input} value={f.ufs} onChange={(e) => set("ufs", e.target.value)} placeholder="DF, MG" /></label>
        <label className={label}>Cidades (vírgula)<input className={input} value={f.cities} onChange={(e) => set("cities", e.target.value)} /></label>
        <label className={label}>Polos (vírgula)<input className={input} value={f.polos} onChange={(e) => set("polos", e.target.value)} /></label>
        <label className={label}>Público-alvo (texto)<input className={input} value={f.audienceNote} onChange={(e) => set("audienceNote", e.target.value)} /></label>
        <label className="flex items-center gap-2 self-end text-sm text-mist-200"><input type="checkbox" checked={f.requiresActiveMember} onChange={(e) => set("requiresActiveMember", e.target.checked)} className="size-4 accent-[#ceff00]" />Exige matrícula ativa verificada</label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="label-mono mb-2 text-[0.6rem] text-mist-500">Período e estoque</legend>
        <label className={label}>Início<input type="datetime-local" className={input} value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
        <label className={label}>Fim<input type="datetime-local" className={input} value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></label>
        <label className={label}>Quantidade total (vazio = sem limite)<input inputMode="numeric" className={input} value={f.totalQuantity} onChange={(e) => set("totalQuantity", e.target.value.replace(/\D/g, ""))} /></label>
        <label className={label}>Limite por pessoa<input inputMode="numeric" className={input} value={f.perMemberLimit} onChange={(e) => set("perMemberLimit", e.target.value.replace(/\D/g, ""))} /></label>
        <label className={label}>Validade do código (horas)<input inputMode="numeric" className={input} value={f.codeTtlHours} onChange={(e) => set("codeTtlHours", e.target.value.replace(/\D/g, ""))} /></label>
        <label className="flex items-center gap-2 self-end text-sm text-mist-200"><input type="checkbox" checked={f.restockOnExpiry} onChange={(e) => set("restockOnExpiry", e.target.checked)} className="size-4 accent-[#ceff00]" />Devolver ao estoque se vencer sem uso</label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="label-mono mb-2 text-[0.6rem] text-mist-500">Resgate</legend>
        <label className={label}>Modalidade<select className={input} value={f.mode} onChange={(e) => set("mode", e.target.value)}>
          {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {f.mode === "COUPON" && <label className={label}>Código do cupom (privado até o resgate)<input className={input} value={f.couponCode} onChange={(e) => set("couponCode", e.target.value)} /></label>}
        {f.mode === "EXTERNAL_URL" && <label className={label}>URL do parceiro (privada até o resgate)<input className={input} value={f.externalUrl} onChange={(e) => set("externalUrl", e.target.value)} placeholder="https://" /></label>}
        {f.mode === "ONE_TIME_CODE" && <label className="flex items-center gap-2 self-end text-sm text-mist-200"><input type="checkbox" checked={f.generateCodes} onChange={(e) => set("generateCodes", e.target.checked)} className="size-4 accent-[#ceff00]" />Gerar código BORA quando o lote acabar</label>}
        <label className={clsx(label, "sm:col-span-2")}>Instruções de resgate<textarea rows={2} className={clsx(input, "py-2")} value={f.redemptionInstructions} onChange={(e) => set("redemptionInstructions", e.target.value)} /></label>
        <label className={clsx(label, "sm:col-span-2")}>Regras<textarea rows={2} className={clsx(input, "py-2")} value={f.rules} onChange={(e) => set("rules", e.target.value)} /></label>
        <label className={label}>Termos<textarea rows={2} className={clsx(input, "py-2")} value={f.terms} onChange={(e) => set("terms", e.target.value)} /></label>
        <label className={label}>Política de cancelamento<textarea rows={2} className={clsx(input, "py-2")} value={f.cancellationPolicy} onChange={(e) => set("cancellationPolicy", e.target.value)} /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="label-mono mb-2 text-[0.6rem] text-mist-500">Publicação</legend>
        <label className={label}>Visibilidade<select className={input} value={f.visibility} onChange={(e) => set("visibility", e.target.value)}>
          <option value="VISIBLE">Visível só para elegíveis</option><option value="VISIBLE_LOCKED">Visível bloqueado (com motivo)</option><option value="HIDDEN">Oculto</option></select></label>
        <label className={label}>Status<select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {["DRAFT", "PENDING", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="flex items-center gap-2 self-end text-sm text-mist-200"><input type="checkbox" checked={f.isHealthRelated} onChange={(e) => set("isHealthRelated", e.target.checked)} className="size-4 accent-[#ceff00]" />Benefício de saúde</label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3"><button disabled={pending} className={clsx(btn, "bg-volt text-night-950")}>{pending ? "Salvando…" : "Salvar benefício"}</button><Result r={r} /></div>
    </form>
  );
}

export function BenefitActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<BenefitResult>) => start(async () => { const o = await fn(); setR(o); if (o.ok) router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "ACTIVE" && <button disabled={pending} onClick={() => act(() => setBenefitStatus(id, "ACTIVE"))} className={clsx(btn, "border border-volt/50 text-volt")}>Ativar</button>}
      {status === "ACTIVE" && <button disabled={pending} onClick={() => act(() => setBenefitStatus(id, "PAUSED"))} className={clsx(btn, "border border-white/15 text-mist-100")}>Pausar</button>}
      {status !== "ARCHIVED" && <button disabled={pending} onClick={() => act(() => setBenefitStatus(id, "ARCHIVED"))} className={clsx(btn, "border border-white/15 text-mist-300")}>Arquivar</button>}
      <button disabled={pending} onClick={() => start(async () => { const o = await duplicateBenefit(id); setR(o); if (o.ok) router.push(`/os/beneficios/${(o.data as { id: string }).id}`); })} className={clsx(btn, "border border-white/15 text-mist-100")}>Duplicar</button>
      <Result r={r} />
    </div>
  );
}

export function CodesLoader({ benefitId }: { benefitId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await loadCodes(benefitId, text); setR(o); if (o.ok) { setText(""); router.refresh(); } }); }}>
      <textarea aria-label="Códigos do parceiro" rows={4} className={clsx(input, "py-2 font-mono")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Um código por linha" />
      <div className="flex items-center gap-3"><button disabled={pending} className={clsx(btn, "border border-white/15 text-mist-100 hover:border-volt")}>Carregar códigos</button><Result r={r} /></div>
    </form>
  );
}

export function RedemptionRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [r, setR] = useState<BenefitResult | null>(null);
  const [pending, start] = useTransition();
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "RESERVED" && <button disabled={pending} onClick={() => start(async () => { const o = await approveManual(id, ""); setR(o); if (o.ok) router.refresh(); })} className={clsx(btn, "min-h-9 border border-volt/50 px-2.5 text-volt")}>Aprovar</button>}
        {(status === "RESERVED" || status === "ISSUED") && <button onClick={() => setCancel((v) => !v)} className={clsx(btn, "min-h-9 border border-white/15 px-2.5 text-mist-200")}>Cancelar</button>}
      </div>
      {cancel && (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const o = await cancelRedemption(id, reason, restock); setR(o); if (o.ok) router.refresh(); }); }}>
          <input aria-label="Motivo do cancelamento" required minLength={3} className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (fica na auditoria)" />
          <label className="flex items-center gap-2 text-xs text-mist-300"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="accent-[#ceff00]" />Devolver ao estoque</label>
          <button disabled={pending} className={clsx(btn, "min-h-9 bg-danger text-white")}>Confirmar cancelamento</button>
        </form>
      )}
      <Result r={r} />
    </div>
  );
}

type ValidationOut = { status: "REDEEMED" | "REJECTED"; reason?: string; benefit?: string; member?: string; redeemed_at?: string; replayed?: boolean };
const REJECT: Record<string, string> = {
  already_redeemed: "Este código já foi usado.", expired: "Código vencido.", cancelled: "Resgate cancelado.", reserved: "Resgate ainda não aprovado.",
};

export function ValidateRedemption({ token, benefits }: { token: string | null; benefits: { id: string; title: string }[] }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [code, setCode] = useState("");
  const [benefitId, setBenefitId] = useState(benefits[0]?.id ?? "");
  const [out, setOut] = useState<ValidationOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(t: string | null) {
    setError(null);
    start(async () => {
      key.current ??= (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
      const r = await validateRedemption({ token: t ?? "", code: t ? "" : code, benefitId: t ? "" : benefitId, idempotencyKey: key.current });
      if (r.ok) { setOut(r.data as ValidationOut); router.refresh(); }
      else setError(r.error);
      key.current = null; // próxima leitura = nova chave
    });
  }
  return (
    <div className="grid gap-4">
      {token && !out && (
        <div className="rounded-[4px] border border-white/10 p-4">
          <p className="text-sm text-mist-200">QR lido. Confirme a validação: depois de confirmada, o código não pode ser usado de novo.</p>
          <button disabled={pending} onClick={() => run(token)} className={clsx(btn, "mt-3 bg-volt text-night-950")}>{pending ? "Validando…" : "Confirmar uso"}</button>
        </div>
      )}
      {!token && (
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(null); }}>
          <select aria-label="Benefício" className={input} value={benefitId} onChange={(e) => setBenefitId(e.target.value)}>
            {benefits.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <input aria-label="Código" required className={clsx(input, "font-mono uppercase tracking-wider")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código do atleta" />
          <button disabled={pending} className={clsx(btn, "bg-volt text-night-950")}>Validar</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {out && (
        <div role="status" className={clsx("rounded-[6px] border p-6 text-center", out.status === "REDEEMED" ? "border-volt/50 bg-volt/[0.08]" : "border-danger/50 bg-danger/[0.08]")}>
          <p className={clsx("text-3xl font-semibold", out.status === "REDEEMED" ? "text-volt" : "text-danger")}>{out.status === "REDEEMED" ? (out.replayed ? "Já validado (mesma leitura)" : "Uso confirmado") : "Não validado"}</p>
          <p className="mt-2 text-mist-100">{out.benefit}{out.member ? ` · ${out.member}` : ""}</p>
          {out.status === "REJECTED" && <p className="mt-1 text-mist-200">{REJECT[out.reason ?? ""] ?? "Código inválido."}</p>}
        </div>
      )}
    </div>
  );
}
