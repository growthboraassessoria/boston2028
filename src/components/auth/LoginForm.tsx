"use client";

import { useActionState, useEffect, useRef } from "react";
import { requestLoginCode, verifyLoginCode, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { gsap, useGSAP } from "@/components/motion/gsap";

const input =
  "block min-h-12 w-full rounded-md border border-white/12 bg-night-950/60 px-3.5 text-mist-50 placeholder:text-mist-500 outline-none focus:border-volt";

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [emailState, sendCode, sending] = useActionState<LoginState, FormData>(requestLoginCode, { step: "email" });
  const [codeState, verify, verifying] = useActionState<LoginState, FormData>(verifyLoginCode, { step: "email" });
  const codeRef = useRef<HTMLInputElement>(null);
  const step = codeState.step === "code" ? codeState : emailState;
  const devCode = emailState.step === "code" ? emailState.devCode : undefined;
  const info = emailState.step === "code" ? emailState.info : undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const shownStep = useRef(step.step);
  // Do e-mail para o código: o formulário novo entra deslizando (GSAP; parado se o sistema pede menos movimento).
  useGSAP(() => {
    if (shownStep.current === step.step) return;
    shownStep.current = step.step;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      if (formRef.current) {
        gsap.fromTo(formRef.current.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power3.out", clearProps: "transform" });
      }
    });
  }, { dependencies: [step.step], scope: formRef });

  useEffect(() => {
    if (step.step === "code") codeRef.current?.focus();
  }, [step.step]);

  if (step.step === "code") {
    return (
      <form ref={formRef} action={verify} className="grid gap-4" noValidate>
        <input type="hidden" name="email" value={step.email} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm leading-relaxed text-mist-200">{info ?? "Digite o código de 6 números que enviamos."}</p>
        <p className="text-sm text-mist-300">E-mail: <strong className="text-mist-50">{step.email}</strong></p>
        {devCode && (
          <p className="rounded-md border border-signal/40 bg-signal/10 p-3 font-mono text-sm text-signal" data-testid="dev-code">
            Código (só em desenvolvimento): <strong className="tabular">{devCode}</strong>
          </p>
        )}
        <div>
          <label htmlFor="code" className="text-sm font-medium text-mist-100">Código</label>
          <input ref={codeRef} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            required className={`${input} mt-2 text-center font-mono text-2xl tracking-[0.5em]`} aria-invalid={!!step.error}
            aria-describedby={step.error ? "code-err" : undefined} />
          {step.error && <p id="code-err" role="alert" className="mt-2 text-sm text-danger">{step.error}</p>}
        </div>
        <Button type="submit" size="lg" disabled={verifying}>{verifying ? "Conferindo…" : "Entrar"}</Button>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="text-center text-sm text-mist-300 underline underline-offset-4 hover:text-volt">
          Usar outro e-mail ou pedir novo código
        </a>
      </form>
    );
  }

  return (
    <form ref={formRef} action={sendCode} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Não preencha</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {linkError && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-mist-50">O link expirou ou já foi usado. Peça um novo código.</p>}
      <div>
        <label htmlFor="email" className="text-sm font-medium text-mist-100">Seu e-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={step.email}
          placeholder="voce@exemplo.com" className={`${input} mt-2`} aria-invalid={!!step.error} aria-describedby={step.error ? "email-err" : "email-help"} />
        <p id="email-help" className="mt-2 text-xs text-mist-400">Sem senha: enviamos um código de acesso. Se for seu primeiro acesso, sua conta é criada agora.</p>
        {step.error && <p id="email-err" role="alert" className="mt-2 text-sm text-danger">{step.error}</p>}
      </div>
      <Button type="submit" size="lg" disabled={sending}>{sending ? "Enviando…" : "Receber código"}</Button>
    </form>
  );
}
