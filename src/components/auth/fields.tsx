"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatCpf } from "@/lib/cpf";

export const authInput =
  "block min-h-12 w-full rounded-md border border-white/12 bg-night-950/60 px-3.5 text-mist-50 placeholder:text-mist-500 outline-none focus:border-volt";

type Base = { id: string; name: string; label: string; error?: string; help?: string; autoFocus?: boolean };

function Message({ id, error, help }: { id: string; error?: string; help?: string }) {
  if (error) return <p id={`${id}-err`} role="alert" className="mt-2 text-sm text-danger">{error}</p>;
  if (help) return <p id={`${id}-help`} className="mt-2 text-xs text-mist-400">{help}</p>;
  return null;
}

const describedBy = (id: string, error?: string, help?: string) => (error ? `${id}-err` : help ? `${id}-help` : undefined);

/** CPF com máscara 000.000.000-00 enquanto a pessoa digita. O servidor guarda só os 11 números. */
export function CpfField({ id, name, label, error, help, autoFocus, defaultValue = "" }: Base & { defaultValue?: string }) {
  const [value, setValue] = useState(formatCpf(defaultValue));
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-mist-100">{label}</label>
      <input id={id} name={name} inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" required
        value={value} onChange={(e) => setValue(formatCpf(e.target.value))} maxLength={14} autoFocus={autoFocus}
        className={`${authInput} mt-2 font-mono tabular tracking-wide`} aria-invalid={!!error} aria-describedby={describedBy(id, error, help)} />
      <Message id={id} error={error} help={help} />
    </div>
  );
}

/** Senha com botão de mostrar/esconder. */
export function PasswordField({ id, name, label, error, help, autoFocus, autoComplete }: Base & { autoComplete: "current-password" | "new-password" }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-mist-100">{label}</label>
      <div className="relative mt-2">
        <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required autoFocus={autoFocus}
          maxLength={72} className={`${authInput} pr-12`} aria-invalid={!!error} aria-describedby={describedBy(id, error, help)} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
          aria-label={show ? `Esconder ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-mist-400 hover:text-volt focus-visible:text-volt">
          {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      <Message id={id} error={error} help={help} />
    </div>
  );
}

/** Campo-isca para robôs (fica escondido para pessoas e leitores de tela). */
export function Honeypot() {
  return (
    <div className="hidden" aria-hidden>
      <label htmlFor="website">Não preencha</label>
      <input id="website" name="website" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-mist-50">{children}</p>;
}
