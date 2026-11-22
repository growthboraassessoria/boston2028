"use client";
// Campos acessíveis com erro por campo (aria-invalid + aria-describedby) e 16px+ (sem zoom no iPhone).
import { clsx } from "clsx";
import { forwardRef, type ComponentProps, type ReactNode } from "react";

export const inputBase =
  "block min-h-12 w-full rounded-md border bg-night-950/60 px-3.5 text-mist-50 placeholder:text-mist-500 outline-none transition-colors focus:border-volt [color-scheme:dark] disabled:opacity-60";

// live: a dica muda sozinha (ex.: resultado da busca de CEP) e o leitor de tela anuncia.
export function FieldShell({ id, label, hint, error, children, optional, live }: {
  id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; optional?: boolean; live?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-mist-100">
        {label} {optional && <span className="font-normal text-mist-400">(opcional)</span>}
      </label>
      <div className="mt-2">{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} aria-live={live ? "polite" : undefined} className="mt-1.5 text-xs leading-relaxed text-mist-400">{hint}</p>
      )}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, ComponentProps<"input"> & { invalid?: boolean; describedBy?: string }>(
  function TextInput({ invalid, describedBy, className, ...props }, ref) {
    return <input ref={ref} className={clsx(inputBase, invalid ? "border-danger" : "border-white/12", className)}
      aria-invalid={invalid || undefined} aria-describedby={describedBy} {...props} />;
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, ComponentProps<"select"> & { invalid?: boolean }>(
  function SelectInput({ invalid, className, children, ...props }, ref) {
    return <select ref={ref} className={clsx(inputBase, "appearance-none", invalid ? "border-danger" : "border-white/12", className)}
      aria-invalid={invalid || undefined} {...props}>{children}</select>;
  },
);

export function ChoiceCards<T extends string>({ name, value, onChange, options, columns = 2, invalid, legend, error }: {
  name: string; value: T | "" | undefined; onChange: (v: T) => void; options: { value: T; label: ReactNode; hint?: ReactNode }[];
  columns?: 2 | 3 | 4; invalid?: boolean; legend: ReactNode; error?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-mist-100">{legend}</legend>
      <div role="radiogroup" className={clsx("mt-2 grid gap-2", columns === 2 && "grid-cols-1 sm:grid-cols-2", columns === 3 && "grid-cols-1 sm:grid-cols-3", columns === 4 && "grid-cols-2 sm:grid-cols-4")}>
        {options.map((o) => (
          <label key={o.value} className={clsx(
            "flex min-h-12 cursor-pointer flex-col justify-center rounded-md border px-3.5 py-2.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-volt",
            value === o.value ? "border-volt bg-volt/10 text-volt" : invalid ? "border-danger/60 text-mist-200" : "border-white/12 text-mist-200 hover:border-white/30",
          )}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="mt-0.5 text-xs text-mist-400">{o.hint}</span>}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1.5 text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

export function CheckRow({ id, checked, onChange, children, invalid }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; invalid?: boolean }) {
  return (
    <label htmlFor={id} className={clsx("flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3.5 text-sm leading-relaxed text-mist-200",
      invalid ? "border-danger/60" : "border-white/10")}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[#ceff00]" aria-invalid={invalid || undefined} />
      <span>{children}</span>
    </label>
  );
}
