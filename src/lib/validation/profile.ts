import { z } from "zod";

export const POLICY_VERSION = "2026-11-20-rascunho";

/** Telefone para E.164. Sem DDI, assume Brasil (+55). */
export function toE164(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return null;
}

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;
export const UF_LIST = UFS;

/** CEP obrigatório (cadastro e perfil): 8 números, com ou sem hífen. */
export const CepSchema = z
  .string({ error: "Informe o CEP." })
  .trim()
  .min(1, "Informe o CEP.")
  .regex(/^\d{5}-?\d{3}$/, "O CEP tem 8 números.");

export const ProfileSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo.").max(120).refine((v) => v.split(/\s+/).length >= 2, "Informe nome e sobrenome."),
  preferredName: z.string().trim().max(40).optional().or(z.literal("")),
  birthDate: z.iso.date({ error: "Informe a data de nascimento." }).refine((v) => v >= "1920-01-01" && v <= "2015-12-31", "Confira a data de nascimento."),
  phone: z.string().trim().min(1, "Informe seu WhatsApp.").refine((v) => toE164(v) !== null, "Use DDD + número, ex.: (61) 99999-0000."),
  cep: CepSchema,
  city: z.string().trim().min(2, "Informe a cidade.").max(80),
  uf: z.enum(UFS, { error: "Escolha a UF." }),
  category: z.enum(["M", "F", "X", "OTHER"], { error: "Escolha a categoria de referência." }),
  categoryNote: z.string().trim().max(300).optional().or(z.literal("")),
  membership: z.enum(["SIM_ATUAL", "NAO", "EX_ALUNO"], { error: "Responda se você já é aluno BORA." }),
  coachName: z.string().trim().max(120).optional().or(z.literal("")),
  supportPoint: z.string().trim().max(120).optional().or(z.literal("")),
  noPolo: z.boolean().optional(),
  originCoach: z.string().trim().max(120).optional().or(z.literal("")),
  acceptTerms: z.literal(true, { error: "É preciso aceitar os termos e o aviso de privacidade." }),
  marketingEmail: z.boolean(),
  marketingWhatsapp: z.boolean(),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;
