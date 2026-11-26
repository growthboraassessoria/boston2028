"use client";

// Formulários e peças interativas das páginas do atleta (perfil, configurações, notificações, testes e evolução).
// Padrão: useTransition + server action; retorno na própria tela (role="status" para sucesso, role="alert" para erro).
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CheckCheck, Trash2 } from "lucide-react";
import {
  markNotificationsRead, removeAvatar, requestMyData, savePrivacy, submitTestResult, updateContact, updateMembershipClaim, uploadAvatar,
  type AthleteResult,
} from "@/lib/actions/athlete";
import { formatCep } from "@/lib/domain/cep";
import { durationPreview, formatDuration, maskDuration, parseDuration, selectAllSoon, typingDigits, validateMark, type Distance } from "@/lib/domain/time";
import { UF_LIST } from "@/lib/validation/profile";
import { Button } from "@/components/ui/Button";
import { CheckRow, ChoiceCards, FieldShell, SelectInput, TextInput } from "@/components/forms/fields";
import { useCepLookup, type CepFound } from "@/components/forms/useCepLookup";

// Um pouco abaixo do limite de 1 MB do corpo das server actions (o multipart adiciona alguns KB).
const MAX_ACTION_FILE = 950_000;

function Feedback({ r }: { r: AthleteResult | null }) {
  const ok = r?.ok ? r.message ?? "" : "";
  return (
    <>
      <p role="status" className={clsx("text-sm text-volt", ok && "mt-3")}>{ok}</p>
      {r && !r.ok && <p role="alert" className="mt-3 text-sm text-danger">{r.error}</p>}
    </>
  );
}

const textareaClass = "block w-full rounded-md border bg-night-950/60 p-3 text-mist-50 outline-none placeholder:text-mist-500 focus:border-volt";

/** Seletor de arquivo com texto em português (o botão nativo fala a língua do navegador). O input continua real e focável. */
function FilePicker({ id, inputRef, accept, buttonLabel, fileName, invalid, describedBy, onChange }: {
  id: string; inputRef: React.RefObject<HTMLInputElement | null>; accept: string; buttonLabel: string; fileName: string | null;
  invalid?: boolean; describedBy?: string; onChange: (file: File | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <input ref={inputRef} id={id} type="file" accept={accept} className="peer sr-only"
        aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <label htmlFor={id}
        className={clsx("inline-flex min-h-11 cursor-pointer select-none items-center justify-center rounded-md border px-4 text-sm font-semibold text-mist-50 transition-colors hover:border-volt hover:text-volt",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-volt peer-focus-visible:[outline-style:solid]",
          invalid ? "border-danger" : "border-mist-200/30")}>
        {buttonLabel}
      </label>
      <span className="min-w-0 max-w-full truncate text-sm text-mist-300">{fileName ?? "Nenhum arquivo escolhido"}</span>
    </div>
  );
}

const PROFILE_PAGES = [
  { href: "/passport/perfil", label: "Perfil" },
  { href: "/passport/notificacoes", label: "Notificações" },
  { href: "/passport/configuracoes", label: "Configurações" },
];

const EVOLUTION_PAGES = [
  { href: "/passport/indicadores", label: "Evolução" },
  { href: "/passport/testes", label: "Testes" },
  { href: "/passport/conquistas", label: "Conquistas" },
];

/** Páginas irmãs da aba Perfil. */
export function ProfileTabs() {
  return <SubNav label="Seções do perfil" items={PROFILE_PAGES} />;
}

/** Páginas irmãs da aba Evolução. */
export function EvolutionTabs() {
  return <SubNav label="Seções da evolução" items={EVOLUTION_PAGES} />;
}

/** Navegação entre páginas irmãs de uma aba. */
function SubNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="mb-5">
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const active = path === it.href;
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={active ? "page" : undefined}
                className={clsx("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                  active ? "border-volt/60 bg-volt/10 text-volt" : "border-white/10 text-mist-200 hover:border-white/25 hover:text-mist-50")}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ───────────────────────── Perfil: contato ─────────────────────────

type Contact = { preferredName: string; phone: string; cep: string; city: string; uf: string };

export function ContactForm({ initial }: { initial: Contact }) {
  const [f, setF] = useState<Contact>(initial);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const errors = r && !r.ok ? r.fieldErrors ?? {} : {};
  const set = <K extends keyof Contact>(k: K, v: Contact[K]) => setF((s) => ({ ...s, [k]: v }));
  // Só consulta o CEP quando ele muda (não sobrescreve a cidade que a pessoa corrigiu à mão).
  const cep = useCepLookup(initial.cep);
  const fillFromCep = (x: CepFound) =>
    setF((s) => ({ ...s, city: x.city, uf: (UF_LIST as readonly string[]).includes(x.uf) ? x.uf : s.uf }));

  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => {
      e.preventDefault();
      setR(null);
      start(async () => setR(await updateContact(f)));
    }}>
      <FieldShell id="preferredName" label="Como prefere ser chamado" optional error={errors.preferredName}>
        <TextInput id="preferredName" autoComplete="nickname" maxLength={40} value={f.preferredName}
          onChange={(e) => set("preferredName", e.target.value)} invalid={!!errors.preferredName}
          describedBy={errors.preferredName ? "preferredName-err" : undefined} />
      </FieldShell>
      <FieldShell id="phone" label="WhatsApp" hint="Só para contato sobre o projeto." error={errors.phone}>
        <TextInput id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(61) 99999-0000" value={f.phone}
          onChange={(e) => set("phone", e.target.value)} invalid={!!errors.phone} describedBy={errors.phone ? "phone-err" : "phone-hint"} />
      </FieldShell>
      <FieldShell id="cep" label="CEP" live error={errors.cep} hint={cep.hint}>
        <TextInput id="cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" className="sm:max-w-48" value={f.cep}
          onChange={(e) => {
            const v = formatCep(e.target.value);
            set("cep", v);
            void cep.check(v, fillFromCep);
          }}
          onBlur={(e) => void cep.check(e.target.value, fillFromCep)} invalid={!!errors.cep}
          describedBy={errors.cep ? "cep-err" : "cep-hint"} />
      </FieldShell>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <FieldShell id="city" label="Cidade" error={errors.city}>
          <TextInput id="city" autoComplete="address-level2" maxLength={80} value={f.city} onChange={(e) => set("city", e.target.value)}
            invalid={!!errors.city} describedBy={errors.city ? "city-err" : undefined} />
        </FieldShell>
        <FieldShell id="uf" label="UF" error={errors.uf}>
          <SelectInput id="uf" autoComplete="address-level1" value={f.uf} onChange={(e) => set("uf", e.target.value)} invalid={!!errors.uf}
            aria-describedby={errors.uf ? "uf-err" : undefined}>
            <option value="">—</option>
            {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
          </SelectInput>
        </FieldShell>
      </div>
      <div>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Salvando…" : "Salvar contato"}</Button>
        <Feedback r={r} />
      </div>
    </form>
  );
}

// ───────────────────────── Perfil: vínculo (autodeclaração) ─────────────────────────

type Membership = "SIM_ATUAL" | "NAO" | "EX_ALUNO";
type Claim = { membership: Membership | ""; coachName: string; supportPoint: string; noPolo: boolean };

export function MembershipForm({ initial }: { initial: Claim }) {
  const [f, setF] = useState<Claim>(initial);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const errors = r && !r.ok ? r.fieldErrors ?? {} : {};
  const set = <K extends keyof Claim>(k: K, v: Claim[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => {
      e.preventDefault();
      setR(null);
      start(async () => setR(await updateMembershipClaim({
        membership: f.membership || undefined, coachName: f.coachName, supportPoint: f.supportPoint, noPolo: f.noPolo,
      })));
    }}>
      <ChoiceCards name="membership" legend="Você já é aluno BORA?" value={f.membership} onChange={(v) => set("membership", v)} columns={3}
        invalid={!!errors.membership} error={errors.membership}
        options={[{ value: "SIM_ATUAL", label: "Sim, atualmente" }, { value: "NAO", label: "Não" }, { value: "EX_ALUNO", label: "Já fui aluno" }]} />
      {f.membership === "SIM_ATUAL" && (
        <div className="grid gap-5 rounded-lg border border-white/10 p-4 sm:grid-cols-2">
          <FieldShell id="coachName" label="Nome do seu treinador" optional error={errors.coachName}>
            <TextInput id="coachName" maxLength={120} value={f.coachName} onChange={(e) => set("coachName", e.target.value)} invalid={!!errors.coachName} />
          </FieldShell>
          <FieldShell id="supportPoint" label="Ponto de apoio" optional error={errors.supportPoint}>
            <TextInput id="supportPoint" maxLength={120} placeholder="Ex.: Parque da Cidade" value={f.supportPoint}
              onChange={(e) => set("supportPoint", e.target.value)} invalid={!!errors.supportPoint} />
          </FieldShell>
          <div className="sm:col-span-2">
            <CheckRow id="noPolo" checked={f.noPolo} onChange={(v) => set("noPolo", v)}>Treino sem polo (online ou por conta própria)</CheckRow>
          </div>
        </div>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={pending || !f.membership} className="w-full sm:w-auto">
          {pending ? "Registrando…" : "Atualizar resposta"}
        </Button>
        <Feedback r={r} />
      </div>
    </form>
  );
}

// ───────────────────────── Perfil: foto com consentimento ─────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

/** Reduz a foto no aparelho (até 1000 px, JPEG). Além de caber no envio, descarta metadados como a localização (EXIF). */
async function shrinkPhoto(file: File, maxSide = 1000): Promise<File | null> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.86, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= MAX_ACTION_FILE) return new File([blob], "foto.jpg", { type: "image/jpeg" });
    }
    return null;
  } catch {
    return null;
  }
}

export function AvatarForm({ avatarUrl, initials }: { avatarUrl: string | null; initials: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const errors = r && !r.ok ? r.fieldErrors ?? {} : {};

  // Libera a prévia anterior da memória.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onPick(picked: File | null) {
    setR(null);
    setFile(null);
    setPreview(null);
    setPickedName(picked?.name ?? null);
    if (!picked) return;
    if (picked.type && !picked.type.startsWith("image/")) {
      setR({ ok: false, error: "Escolha uma foto (JPG, PNG ou WEBP).", fieldErrors: { avatar: "Escolha uma foto (JPG, PNG ou WEBP)." } });
      return;
    }
    setPreparing(true);
    // Sempre reprocessada no aparelho: garante o tamanho e tira os metadados (sem plano B com o arquivo original).
    const ready = await shrinkPhoto(picked);
    setPreparing(false);
    if (!ready) {
      setR({ ok: false, error: "Não conseguimos preparar essa foto. Tente outra imagem.", fieldErrors: { avatar: "Não conseguimos preparar essa foto." } });
      return;
    }
    setFile(ready);
    setPreview(URL.createObjectURL(ready));
  }

  function clearPick() {
    setFile(null);
    setPickedName(null);
    setPreview(null);
    setConsent(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const shown = preview ?? avatarUrl;
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-md border border-white/10 bg-night-800">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={preview ? "Prévia da nova foto" : "Sua foto no passaporte"} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-linear-to-b from-blue-700 to-night-900" aria-hidden>
              <span className="display text-3xl text-mist-50">{initials}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 text-sm leading-relaxed text-mist-300">
          {preview ? <p className="font-medium text-mist-50">Prévia da nova foto</p>
            : avatarUrl ? <p>Esta é a foto do seu passaporte.</p>
            : <p>Sem foto. O passaporte mostra suas iniciais.</p>}
          <p className="mt-1 text-xs text-mist-400">A foto é privada: aparece para você e para a equipe BORA autorizada.</p>
        </div>
      </div>

      <form noValidate className="mt-5 grid gap-4" onSubmit={(e) => {
        e.preventDefault();
        if (!file) {
          setR({ ok: false, error: "Escolha uma foto.", fieldErrors: { avatar: "Escolha uma foto." } });
          return;
        }
        if (!consent) {
          setR({ ok: false, error: "Para usar a foto, marque a autorização.", fieldErrors: { consent: "Marque a autorização para enviar a foto." } });
          return;
        }
        const fd = new FormData();
        fd.set("avatar", file, file.name || "foto.jpg");
        fd.set("consent", "1");
        start(async () => {
          const out = await uploadAvatar(fd);
          setR(out);
          if (out.ok) clearPick();
        });
      }}>
        <FieldShell id="avatar" label={avatarUrl ? "Trocar foto" : "Enviar foto"} hint="JPG, PNG ou WEBP. A foto é reduzida no seu aparelho antes do envio." error={errors.avatar}>
          <FilePicker id="avatar" inputRef={inputRef} accept="image/jpeg,image/png,image/webp" buttonLabel="Escolher foto"
            fileName={pickedName} invalid={!!errors.avatar} describedBy={errors.avatar ? "avatar-err" : "avatar-hint"}
            onChange={(f) => void onPick(f)} />
        </FieldShell>
        {preparing && <p role="status" className="text-sm text-mist-300">Preparando a foto…</p>}
        {file && (
          <>
            <CheckRow id="avatarConsent" checked={consent} onChange={setConsent} invalid={!!errors.consent}>
              Autorizo usar esta foto no meu Boston Passport. Posso retirar a autorização quando quiser em Configurações, e a foto sai do passaporte.
            </CheckRow>
            {errors.consent && <p role="alert" className="-mt-2 text-sm text-danger">{errors.consent}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={pending || !consent}>{pending ? "Enviando…" : "Usar esta foto"}</Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={clearPick}>Cancelar</Button>
            </div>
          </>
        )}
      </form>

      {avatarUrl && !file && (
        confirmRemove ? (
          <div className="mt-4 rounded-md border border-white/10 p-4">
            <p className="text-sm text-mist-100">Remover a foto do passaporte? Você pode enviar outra depois.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => {
                const out = await removeAvatar();
                setR(out);
                if (out.ok) setConfirmRemove(false);
              })}>Remover foto</Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmRemove(false)}>Manter</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)}
            className="mt-3 inline-flex min-h-11 w-fit items-center gap-2 text-sm text-mist-300 underline-offset-4 hover:text-mist-50 hover:underline">
            <Trash2 className="size-4" aria-hidden /> Remover foto
          </button>
        )
      )}
      <Feedback r={r} />
    </div>
  );
}

// ───────────────────────── Configurações: privacidade ─────────────────────────

export type PrivacyPurpose = "public_profile" | "ranking_public" | "marketing_email" | "marketing_whatsapp" | "avatar_use";

const PRIVACY_ITEMS: { key: PrivacyPurpose; title: string; body: string }[] = [
  { key: "public_profile", title: "Perfil público",
    body: "Seu primeiro nome, cidade e carimbos podem aparecer em áreas públicas do projeto, como um mural, quando existirem." },
  { key: "ranking_public", title: "Aparecer no ranking",
    body: "Primeiro nome, inicial do sobrenome e cidade no ranking dos testes, quando o ranking público estiver no ar." },
  { key: "marketing_email", title: "Novidades por e-mail", body: "Convites e notícias da BORA. E-mails sobre sua conta e sua candidatura chegam sempre." },
  { key: "marketing_whatsapp", title: "Novidades pelo WhatsApp", body: "Convites e notícias da BORA no número cadastrado." },
  { key: "avatar_use", title: "Uso da minha foto", body: "Mostrar sua foto no Boston Passport. Se desligar, a foto sai do passaporte." },
];

export function PrivacyForm({ initial, hasAvatar }: { initial: Record<PrivacyPurpose, boolean>; hasAvatar: boolean }) {
  const [f, setF] = useState(initial);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const removingPhoto = hasAvatar && initial.avatar_use && !f.avatar_use;
  return (
    <form noValidate className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      setR(null);
      start(async () => setR(await savePrivacy(f)));
    }}>
      <fieldset className="grid gap-3">
        <legend className="sr-only">Preferências de privacidade</legend>
        {PRIVACY_ITEMS.map((it) => (
          <CheckRow key={it.key} id={`pv-${it.key}`} checked={f[it.key]} onChange={(v) => setF((s) => ({ ...s, [it.key]: v }))}>
            <span className="block font-medium text-mist-50">{it.title}</span>
            <span className="mt-0.5 block text-mist-300">{it.body}</span>
          </CheckRow>
        ))}
      </fieldset>
      {removingPhoto && (
        <p className="rounded-md border border-warn/40 bg-warn/[0.07] p-3 text-sm text-mist-100">Ao salvar, sua foto sai do passaporte.</p>
      )}
      <div className="mt-1">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Salvando…" : "Salvar preferências"}</Button>
        <Feedback r={r} />
      </div>
    </form>
  );
}

// ───────────────────────── Configurações: neste aparelho ─────────────────────────

// Mesmas chaves do livro do passaporte (src/components/passport/book/PassportBook.tsx).
const SOUND_KEY = "rtb.passport.sound";
const OPENED_KEY = "rtb.passport.opened.v1";
const LOCAL_EVENT = "rtb:local-settings";

function subscribeLocal(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LOCAL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LOCAL_EVENT, cb);
  };
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(LOCAL_EVENT));
    return true;
  } catch {
    return false;
  }
}

function useLocalValue(key: string): string | null {
  return useSyncExternalStore(subscribeLocal, () => readLocal(key), () => null);
}

export function DeviceSettings() {
  const sound = useLocalValue(SOUND_KEY) === "1";
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [replayReady, setReplayReady] = useState(false);

  return (
    <div className="grid gap-3">
      <CheckRow id="passportSound" checked={sound} onChange={(v) => {
        setErr("");
        if (writeLocal(SOUND_KEY, v ? "1" : null)) setMsg(v ? "Som ligado neste aparelho." : "Som desligado neste aparelho.");
        else setErr("Este navegador não deixou salvar a preferência.");
      }}>
        <span className="block font-medium text-mist-50">Som do passaporte</span>
        <span className="mt-0.5 block text-mist-300">Um leve som de papel ao abrir e folhear. Vem desligado e vale só neste aparelho.</span>
      </CheckRow>
      <div className="rounded-md border border-white/10 p-3.5 text-sm leading-relaxed">
        <p className="font-medium text-mist-50">Rever a abertura do passaporte</p>
        <p className="mt-0.5 text-mist-300">A capa volta a aparecer fechada na próxima visita, para você abrir de novo.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setErr("");
            if (writeLocal(OPENED_KEY, null)) {
              setReplayReady(true);
              setMsg("Pronto. A capa do passaporte vai aparecer fechada.");
            } else {
              setErr("Este navegador não deixou salvar a preferência.");
            }
          }}>Rever abertura</Button>
          {replayReady && <Link href="/passport" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-mist-50 underline underline-offset-4">Ir para o passaporte</Link>}
        </div>
      </div>
      <p role="status" className="text-sm text-volt">{msg}</p>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}

// ───────────────────────── Configurações: pedidos LGPD ─────────────────────────

type Kind = "ACCESS" | "RECTIFICATION" | "PORTABILITY" | "OBJECTION" | "DELETION";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "ACCESS", label: "Ver meus dados", hint: "Receber uma cópia do que guardamos sobre você." },
  { value: "RECTIFICATION", label: "Corrigir dados", hint: "Nome, nascimento, categoria ou uma resposta." },
  { value: "PORTABILITY", label: "Levar meus dados", hint: "Receber em arquivo para usar em outro serviço." },
  { value: "OBJECTION", label: "Parar um uso", hint: "Interromper um uso específico dos seus dados." },
  { value: "DELETION", label: "Excluir meus dados", hint: "Apagar seus dados pessoais." },
];

export function DataRequestForm({ openKinds }: { openKinds: string[] }) {
  const [kind, setKind] = useState<Kind | "">("");
  const [details, setDetails] = useState("");
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const errors = r && !r.ok ? r.fieldErrors ?? {} : {};
  const alreadyOpen = !!kind && openKinds.includes(kind);
  const detailsRequired = kind === "RECTIFICATION" || kind === "OBJECTION";
  const detailsLabel = kind === "RECTIFICATION" ? "O que precisa ser corrigido?" : kind === "OBJECTION" ? "Qual uso você quer interromper?" : "Detalhes";

  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => {
      e.preventDefault();
      setR(null);
      start(async () => {
        const out = await requestMyData({ kind: kind || undefined, details, confirmDeletion });
        setR(out);
        if (out.ok) {
          setKind("");
          setDetails("");
          setConfirmDeletion(false);
        }
      });
    }}>
      <ChoiceCards name="dataRequestKind" legend="O que você quer pedir?" value={kind} columns={2}
        onChange={(v) => { setKind(v); setR(null); }} invalid={!!errors.kind} error={errors.kind}
        options={KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))} />
      {alreadyOpen && (
        <p className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-100">
          Você já tem um pedido desse tipo em andamento. Acompanhe na lista abaixo.
        </p>
      )}
      {kind && !alreadyOpen && (
        <>
          <FieldShell id="dataRequestDetails" label={detailsLabel} optional={!detailsRequired} error={errors.details}
            hint={kind === "RECTIFICATION" ? "Diga o dado certo. Se for nome, nascimento ou categoria, o índice da sua faixa pode mudar." : undefined}>
            <textarea id="dataRequestDetails" rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)}
              aria-invalid={!!errors.details || undefined}
              aria-describedby={errors.details ? "dataRequestDetails-err" : kind === "RECTIFICATION" ? "dataRequestDetails-hint" : undefined}
              className={clsx(textareaClass, errors.details ? "border-danger" : "border-white/12")} />
          </FieldShell>
          {kind === "DELETION" && (
            <div className="grid gap-3 rounded-md border border-warn/40 bg-warn/[0.07] p-4 text-sm leading-relaxed text-mist-100">
              <p>
                A exclusão apaga seus dados pessoais (nome, contato, foto e a resposta de saúde) e encerra o acesso ao Passport.
                O histórico técnico e de resgates fica guardado sem identificação. Depois de concluída, não dá para desfazer.
              </p>
              <CheckRow id="confirmDeletion" checked={confirmDeletion} onChange={setConfirmDeletion} invalid={!!errors.confirmDeletion}>
                Entendi o que acontece na exclusão.
              </CheckRow>
              {errors.confirmDeletion && <p role="alert" className="text-sm text-danger">{errors.confirmDeletion}</p>}
            </div>
          )}
          <div>
            <Button type="submit" variant={kind === "DELETION" ? "danger" : "volt"} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Enviando…" : kind === "DELETION" ? "Pedir exclusão" : "Enviar pedido"}
            </Button>
          </div>
        </>
      )}
      <div className="-mt-5"><Feedback r={r} /></div>
    </form>
  );
}

// ───────────────────────── Notificações ─────────────────────────

export function MarkAllReadButton() {
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button type="button" variant="outline" size="sm" disabled={pending}
        onClick={() => start(async () => setR(await markNotificationsRead({})))}>
        <CheckCheck className="size-4" aria-hidden /> {pending ? "Marcando…" : "Marcar todas como lidas"}
      </Button>
      <Feedback r={r} />
    </div>
  );
}

/** Abre o link da notificação; se ela ainda não foi lida, marca como lida antes de navegar. */
export function NotificationLink({ id, href, unread, className, children }: {
  id: string; href: string; unread: boolean; className?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Link href={href} className={clsx(className, pending && "opacity-70")} aria-busy={pending || undefined} onClick={(e) => {
      if (!unread || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      start(async () => {
        await markNotificationsRead({ ids: [id] }).catch(() => null);
        router.push(href);
      });
    }}>
      {children}
    </Link>
  );
}

// ───────────────────────── Testes: envio de resultado ─────────────────────────

export function TestResultForm({ testId, distanceKey, placeholder, resubmit }: {
  testId: string; distanceKey: Distance | null; placeholder: string; resubmit: boolean;
}) {
  const [time, setTime] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [r, setR] = useState<AthleteResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const long = distanceKey === "HALF" || distanceKey === "MARATHON";
  const timeError = localError ?? (r && !r.ok ? r.fieldErrors?.seconds : undefined);
  const proofError = r && !r.ok ? r.fieldErrors?.proof : undefined;
  const timeId = `time-${testId}`;
  const proofId = `proof-${testId}`;

  async function prepareProof(file: File | undefined): Promise<File | null | "too_big"> {
    if (!file || file.size === 0) return null;
    if (file.size <= MAX_ACTION_FILE) return file;
    if (file.type.startsWith("image/")) return (await shrinkPhoto(file, 1600)) ?? "too_big";
    return "too_big";
  }

  return (
    <form noValidate className="mt-4 grid gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4" onSubmit={(e) => {
      e.preventDefault();
      setR(null);
      setLocalError(null);
      const t = parseDuration(time, long ? "hours" : "auto");
      if (!t.ok) { setLocalError(t.error); return; }
      const bad = distanceKey ? validateMark(distanceKey, t.seconds) : t.seconds < 420 || t.seconds > 32400 ? "Confira o tempo informado." : null;
      if (bad) { setLocalError(bad); return; }
      const seconds = t.seconds;
      start(async () => {
        const proof = await prepareProof(fileRef.current?.files?.[0]);
        if (proof === "too_big") {
          setR({ ok: false, error: "Comprovante grande demais. Envie uma imagem ou um PDF de até 1 MB.", fieldErrors: { proof: "Arquivo acima de 1 MB." } });
          return;
        }
        let fd: FormData | null = null;
        if (proof) {
          fd = new FormData();
          fd.set("proof", proof, proof.name);
        }
        const out = await submitTestResult({ testId, seconds }, fd);
        setR(out);
        if (out.ok) {
          setTime("");
          setProofName(null);
          if (fileRef.current) fileRef.current.value = "";
        }
      });
    }}>
      <p className="text-sm font-medium text-mist-50">{resubmit ? "Enviar outro tempo" : "Enviar meu resultado"}</p>
      <FieldShell id={timeId} label={long ? "Seu tempo (h:mm:ss)" : "Seu tempo (mm:ss)"} error={timeError} live
        hint={durationPreview(time) ? `Vai ficar ${durationPreview(time)}` : `Tempo líquido do relógio ou do app. Digite só os números (ex.: ${placeholder.replace(/:/g, "")} vira ${placeholder}).`}>
        <TextInput id={timeId} inputMode="numeric" autoComplete="off" placeholder={placeholder} value={time} className="tabular"
          onChange={(e) => {
            setTime(typingDigits(e.target.value));
            setLocalError(null);
            if (r && !r.ok) setR(null);
          }} onFocus={(e) => { setTime(typingDigits(time)); selectAllSoon(e.currentTarget); }} onBlur={() => setTime(maskDuration(time))} invalid={!!timeError}
          describedBy={timeError ? `${timeId}-err` : `${timeId}-hint`} />
      </FieldShell>
      <FieldShell id={proofId} label="Comprovante" optional error={proofError} hint="Print do relógio ou do app (imagem ou PDF até 1 MB).">
        <FilePicker id={proofId} inputRef={fileRef} accept="image/jpeg,image/png,image/webp,application/pdf" buttonLabel="Escolher arquivo"
          fileName={proofName} invalid={!!proofError} describedBy={proofError ? `${proofId}-err` : `${proofId}-hint`}
          onChange={(f) => setProofName(f?.name ?? null)} />
      </FieldShell>
      <div>
        <Button type="submit" disabled={pending || !time.trim()} className="w-full sm:w-auto">{pending ? "Enviando…" : "Enviar resultado"}</Button>
        <Feedback r={r} />
      </div>
    </form>
  );
}

// ───────────────────────── Evolução: gráfico ─────────────────────────

export type EvolutionPoint = { date: string; dateLabel: string; seconds: number; kind: "mark" | "test"; label: string };

const W = 340;
const H = 200;
const M = { top: 18, right: 14, bottom: 30, left: 46 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

function niceTicks(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const span = Math.max(max - min, 60);
  const step = [300, 600, 900, 1800, 3600].find((s) => span / s <= 4) ?? 3600;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi - lo < step * 2) { lo -= step; hi += step; }
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

const tickLabel = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};

function Marker({ kind, cx, cy }: { kind: EvolutionPoint["kind"]; cx: number; cy: number }) {
  // Anel de 2 px na cor da superfície mantém o ponto legível sobre a linha.
  return kind === "test"
    ? <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`} fill="#ceff00" stroke="#09224a" strokeWidth={2} />
    : <circle cx={cx} cy={cy} r={5} fill="#ceff00" stroke="#09224a" strokeWidth={2} />;
}

/** Tempo equivalente de maratona no tempo (mais rápido fica mais alto). Cada ponto aceita mouse, toque e teclado. */
export function EvolutionChart({ points, reference, referenceLabel }: { points: EvolutionPoint[]; reference: number | null; referenceLabel: string | null }) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return null;
  const values = points.map((p) => p.seconds).concat(reference ? [reference] : []);
  const { lo, hi, ticks } = niceTicks(Math.min(...values), Math.max(...values));
  const pad = (hi - lo) * 0.1; // folga: nada encosta na borda do gráfico
  const times = points.map((p) => new Date(`${p.date}T12:00:00Z`).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (i: number) => (t1 === t0 ? M.left + PLOT_W / 2 : M.left + ((times[i]! - t0) / (t1 - t0)) * PLOT_W);
  const y = (s: number) => M.top + ((s - (lo - pad)) / (hi - lo + 2 * pad)) * PLOT_H; // menor tempo = mais alto
  const hasTests = points.some((p) => p.kind === "test");
  const hasMarks = points.some((p) => p.kind === "mark");
  const a = active !== null ? points[active] : undefined;
  const ax = active !== null ? x(active) : 0;
  const ay = a ? y(a.seconds) : 0;
  const side = ax > W * 0.62 ? "right" : ax < W * 0.38 ? "left" : "center";
  const below = ay < H * 0.45; // ponto no alto: a caixa vai para baixo dele

  return (
    <figure className="mt-4">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y" role="group"
          aria-label="Gráfico da evolução: tempo equivalente de maratona por data. Mais rápido fica mais alto."
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="rgb(255 255 255 / 0.08)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8392a8" fontFamily="var(--font-mono)">{tickLabel(t)}</text>
            </g>
          ))}
          {reference && (
            <g>
              <line x1={M.left} x2={W - M.right} y1={y(reference)} y2={y(reference)} stroke="#a9b4c6" strokeDasharray="5 4" strokeWidth={1.5} />
              <text x={W - M.right} y={y(reference) - 6} textAnchor="end" fontSize="10" fill="#cbd3df" fontFamily="var(--font-mono)">
                {referenceLabel ?? `Índice ${formatDuration(reference)}`}
              </text>
            </g>
          )}
          {a && <line x1={ax} x2={ax} y1={M.top} y2={H - M.bottom} stroke="rgb(255 255 255 / 0.22)" strokeWidth={1} />}
          {points.length > 1 && (
            <polyline fill="none" stroke="#ceff00" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.seconds)}`).join(" ")} />
          )}
          {points.map((p, i) => <Marker key={`m-${i}`} kind={p.kind} cx={x(i)} cy={y(p.seconds)} />)}
          {points.map((p, i) => (
            <circle key={`h-${i}`} cx={x(i)} cy={y(p.seconds)} r={14} fill="transparent" tabIndex={0} role="img"
              aria-label={`${p.label}, ${p.dateLabel}: ${formatDuration(p.seconds)}`}
              onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              className="cursor-pointer outline-none" />
          ))}
          <text x={x(0)} y={H - 10} textAnchor={points.length > 1 ? "start" : "middle"} fontSize="10" fill="#8392a8" fontFamily="var(--font-mono)">
            {points[0]!.dateLabel}
          </text>
          {points.length > 1 && (
            <text x={x(points.length - 1)} y={H - 10} textAnchor="end" fontSize="10" fill="#8392a8" fontFamily="var(--font-mono)">
              {points[points.length - 1]!.dateLabel}
            </text>
          )}
        </svg>
        {a && (
          <div className={clsx("pointer-events-none absolute z-10 w-max max-w-[11rem] rounded-md border border-white/12 bg-night-950/95 px-3 py-2 shadow-lg",
            side === "right" ? "-translate-x-full" : side === "center" ? "-translate-x-1/2" : "")}
            style={{ left: `${(ax / W) * 100}%`, top: `${(ay / H) * 100}%`, marginTop: below ? "0.9rem" : "-4.6rem" }}
            aria-hidden>
            <p className="tabular text-sm font-semibold text-mist-50">{formatDuration(a.seconds)}</p>
            <p className="text-xs text-mist-300">{a.label}</p>
            <p className="text-xs text-mist-400">{a.dateLabel}</p>
          </div>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-mist-300">
        <span className="w-full text-mist-400">Quanto mais alto no gráfico, mais rápido. Toque em um ponto para ver o tempo.</span>
        {hasMarks && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden><circle cx="6" cy="6" r="4.5" fill="#ceff00" /></svg> Marca de prova
          </span>
        )}
        {hasTests && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden><rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill="#ceff00" /></svg> Teste validado
          </span>
        )}
        {reference && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 16 4" className="h-1 w-4" aria-hidden><line x1="0" x2="16" y1="2" y2="2" stroke="#a9b4c6" strokeWidth="2" strokeDasharray="4 3" /></svg> Índice da sua faixa
          </span>
        )}
      </figcaption>
    </figure>
  );
}
