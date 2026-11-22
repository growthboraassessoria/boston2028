"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { ProfileSchema, UF_LIST, type ProfileInput } from "@/lib/validation/profile";
import { saveProfile } from "@/lib/actions/profile";
import { formatCep } from "@/lib/domain/cep";
import { LAB_STORAGE_KEY } from "@/components/landing/IndexLab";
import { Button } from "@/components/ui/Button";
import { CheckRow, ChoiceCards, FieldShell, SelectInput, TextInput } from "@/components/forms/fields";
import { useCepLookup, type CepFound } from "@/components/forms/useCepLookup";
import { gsap, useGSAP } from "@/components/motion/gsap";

const STEPS = [
  { key: "voce", label: "Você", fields: ["fullName", "preferredName", "birthDate", "phone", "cep", "city", "uf", "category", "categoryNote"] },
  { key: "vinculo", label: "Vínculo BORA", fields: ["membership", "coachName", "supportPoint", "noPolo", "originCoach"] },
  { key: "privacidade", label: "Privacidade", fields: ["acceptTerms", "marketingEmail", "marketingWhatsapp"] },
] as const;

type FormValues = Omit<ProfileInput, "acceptTerms" | "uf" | "category" | "membership"> & {
  acceptTerms: boolean; uf: ProfileInput["uf"] | ""; category: ProfileInput["category"] | ""; membership: ProfileInput["membership"] | "";
};

export function SignupForm({ email }: { email: string }) {
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cep = useCepLookup();
  const formRef = useRef<HTMLFormElement>(null);
  const shownStep = useRef(step);
  // Troca de etapa: a etapa nova entra deslizando (GSAP; parada se o sistema pede menos movimento).
  useGSAP(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const parts = formRef.current?.querySelectorAll("[data-step] > *");
      if (parts?.length) gsap.fromTo(parts, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.035, ease: "power3.out", clearProps: "transform" });
    });
  }, { dependencies: [step], scope: formRef });

  const { register, control, handleSubmit, trigger, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({
    // O schema final exige acceptTerms=true; o formulário guarda boolean até o envio.
    resolver: zodResolver(ProfileSchema) as never,
    mode: "onTouched",
    defaultValues: {
      fullName: "", preferredName: "", birthDate: "", phone: "", cep: "", city: "", uf: "", category: "", categoryNote: "",
      membership: "", coachName: "", supportPoint: "", noPolo: false, originCoach: "", acceptTerms: false,
      marketingEmail: false, marketingWhatsapp: false,
    },
  });

  // Traz o que foi informado no Boston Index Lab (mesmo aparelho).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_STORAGE_KEY);
      if (!raw) return;
      const lab = JSON.parse(raw) as { birthDate?: string; category?: string };
      if (lab.birthDate) setValue("birthDate", lab.birthDate);
      if (lab.category && ["M", "F", "X", "OTHER"].includes(lab.category)) setValue("category", lab.category as FormValues["category"]);
    } catch {
      /* sem armazenamento local */
    }
  }, [setValue]);

  const membership = watch("membership");
  const category = watch("category");

  async function next() {
    const ok = await trigger(STEPS[step]!.fields as unknown as (keyof FormValues)[]);
    if (ok) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function fillFromCep(r: CepFound) {
    setValue("city", r.city, { shouldValidate: true });
    if ((UF_LIST as readonly string[]).includes(r.uf)) setValue("uf", r.uf as FormValues["uf"], { shouldValidate: true });
  }

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const r = await saveProfile(values);
      if (r && !r.ok) {
        setServerError(r.error);
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof FormValues, { message: v });
        const firstStep = STEPS.findIndex((s) => Object.keys(r.fieldErrors ?? {}).some((k) => (s.fields as readonly string[]).includes(k)));
        if (firstStep >= 0) setStep(firstStep);
      }
    });
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-8">
      <ol className="grid grid-cols-3 gap-2" aria-label="Etapas do cadastro">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === step ? "step" : undefined}
            className={clsx("rounded-md border px-3 py-2.5", i === step ? "border-volt text-volt" : i < step ? "border-white/15 text-mist-200" : "border-white/8 text-mist-500")}>
            <span className="label-mono flex items-center gap-1.5">{i < step ? <Check className="size-3.5" aria-hidden /> : `0${i + 1}`}</span>
            <span className="mt-1 block text-sm font-medium">{s.label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section aria-labelledby="etapa-voce" className="grid gap-5" data-step>
          <h2 id="etapa-voce" className="sr-only">Seus dados</h2>
          <p className="text-sm text-mist-300">Conta: <strong className="text-mist-50">{email}</strong></p>
          <FieldShell id="fullName" label="Nome completo" error={errors.fullName?.message}>
            <TextInput id="fullName" autoComplete="name" invalid={!!errors.fullName} describedBy={errors.fullName ? "fullName-err" : undefined} {...register("fullName")} />
          </FieldShell>
          <div className="grid gap-5 sm:grid-cols-2">
            <FieldShell id="preferredName" label="Como prefere ser chamado" optional>
              <TextInput id="preferredName" autoComplete="nickname" {...register("preferredName")} />
            </FieldShell>
            <FieldShell id="birthDate" label="Data de nascimento" error={errors.birthDate?.message}>
              <TextInput id="birthDate" type="date" autoComplete="bday" invalid={!!errors.birthDate} {...register("birthDate")} />
            </FieldShell>
          </div>
          <FieldShell id="phone" label="WhatsApp" hint="Só para contato sobre o projeto. Não pedimos código por SMS." error={errors.phone?.message}>
            <TextInput id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(61) 99999-0000"
              invalid={!!errors.phone} describedBy={errors.phone ? "phone-err" : "phone-hint"} {...register("phone")} />
          </FieldShell>
          <FieldShell id="cep" label="CEP" live error={errors.cep?.message} hint={cep.hint}>
            <Controller control={control} name="cep" render={({ field }) => (
              <TextInput id="cep" ref={field.ref} name={field.name} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
                className="sm:max-w-48" value={field.value ?? ""} invalid={!!errors.cep} describedBy={errors.cep ? "cep-err" : "cep-hint"}
                onChange={(e) => {
                  const v = formatCep(e.target.value);
                  field.onChange(v);
                  if (errors.cep) void trigger("cep");
                  void cep.check(v, fillFromCep);
                }}
                onBlur={(e) => {
                  field.onBlur();
                  void cep.check(e.target.value, fillFromCep);
                }} />
            )} />
          </FieldShell>
          <div className="grid gap-5 sm:grid-cols-[1.6fr_0.8fr]">
            <FieldShell id="city" label="Cidade" error={errors.city?.message}>
              <TextInput id="city" autoComplete="address-level2" invalid={!!errors.city} {...register("city")} />
            </FieldShell>
            <FieldShell id="uf" label="UF" error={errors.uf?.message}>
              <SelectInput id="uf" invalid={!!errors.uf} {...register("uf")}>
                <option value="">—</option>
                {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
              </SelectInput>
            </FieldShell>
          </div>
          <Controller control={control} name="category" render={({ field }) => (
            <ChoiceCards name="category" legend="Categoria de referência do índice" value={field.value} onChange={field.onChange} columns={4}
              invalid={!!errors.category} error={errors.category?.message}
              options={[{ value: "F", label: "Feminino" }, { value: "M", label: "Masculino" }, { value: "X", label: "Não binário" },
                { value: "OTHER", label: "Para-atleta / especial", hint: "Avaliação humana" }]} />
          )} />
          {category === "OTHER" && (
            <FieldShell id="categoryNote" label="Conte rapidamente o seu caso" optional hint="Para-atletas seguem regras próprias da B.A.A. A coordenação técnica avalia com você.">
              <TextInput id="categoryNote" maxLength={300} {...register("categoryNote")} />
            </FieldShell>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="etapa-vinculo" className="grid gap-5" data-step>
          <h2 id="etapa-vinculo" className="text-lg font-semibold text-mist-50">Você já é aluno BORA?</h2>
          <Controller control={control} name="membership" render={({ field }) => (
            <ChoiceCards name="membership" legend={<span className="sr-only">Você já é aluno BORA?</span>} value={field.value} onChange={field.onChange} columns={3}
              invalid={!!errors.membership} error={errors.membership?.message}
              options={[{ value: "SIM_ATUAL", label: "Sim, atualmente" }, { value: "NAO", label: "Não" }, { value: "EX_ALUNO", label: "Já fui aluno" }]} />
          )} />
          {membership === "SIM_ATUAL" && (
            <div className="grid gap-5 rounded-lg border border-white/10 p-4 sm:grid-cols-2">
              <FieldShell id="coachName" label="Nome do seu treinador" optional>
                <TextInput id="coachName" maxLength={120} {...register("coachName")} />
              </FieldShell>
              <FieldShell id="supportPoint" label="Ponto de apoio" optional>
                <TextInput id="supportPoint" maxLength={120} placeholder="Ex.: Parque da Cidade" {...register("supportPoint")} />
              </FieldShell>
              <div className="sm:col-span-2">
                <Controller control={control} name="noPolo" render={({ field }) => (
                  <CheckRow id="noPolo" checked={!!field.value} onChange={field.onChange}>Treino sem polo (online ou por conta própria)</CheckRow>
                )} />
              </div>
            </div>
          )}
          <p className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-mist-200">
            O que você informar aqui fica como <strong className="text-mist-50">autodeclaração</strong>. A equipe da BORA confirma o vínculo antes de liberar
            qualquer recurso de aluno. Isso não muda nada na sua candidatura.
          </p>
          <FieldShell id="originCoach" label="Algum professor ou código te indicou?" optional>
            <TextInput id="originCoach" maxLength={120} {...register("originCoach")} />
          </FieldShell>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="etapa-privacidade" className="grid gap-4" data-step>
          <h2 id="etapa-privacidade" className="text-lg font-semibold text-mist-50">Privacidade, do seu jeito</h2>
          <Controller control={control} name="acceptTerms" render={({ field }) => (
            <CheckRow id="acceptTerms" checked={!!field.value} onChange={field.onChange} invalid={!!errors.acceptTerms}>
              Li e aceito os <Link href="/termos" target="_blank" className="text-volt underline underline-offset-2">termos de uso</Link> e o{" "}
              <Link href="/privacidade" target="_blank" className="text-volt underline underline-offset-2">aviso de privacidade</Link>.
            </CheckRow>
          )} />
          {errors.acceptTerms && <p role="alert" className="text-sm text-danger">{errors.acceptTerms.message}</p>}
          <Controller control={control} name="marketingEmail" render={({ field }) => (
            <CheckRow id="marketingEmail" checked={!!field.value} onChange={field.onChange}>Quero receber novidades da BORA por e-mail (opcional).</CheckRow>
          )} />
          <Controller control={control} name="marketingWhatsapp" render={({ field }) => (
            <CheckRow id="marketingWhatsapp" checked={!!field.value} onChange={field.onChange}>Quero receber novidades pelo WhatsApp (opcional).</CheckRow>
          )} />
          <p className="text-xs leading-relaxed text-mist-400">
            E-mails sobre sua conta e sua candidatura chegam sempre. Novidades só com o seu aceite, que você pode mudar em Configurações.
          </p>
        </section>
      )}

      {serverError && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-mist-50">{serverError}</p>}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}><ArrowLeft className="size-4" aria-hidden /> Voltar</Button>
        ) : <span />}
        {step < STEPS.length - 1 ? (
          <Button type="button" size="lg" onClick={next}>Continuar <ArrowRight className="size-4" aria-hidden /></Button>
        ) : (
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Emitindo…" : "Emitir meu Boston Passport"}</Button>
        )}
      </div>
    </form>
  );
}
