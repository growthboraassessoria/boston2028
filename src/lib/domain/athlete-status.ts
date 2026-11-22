// O que o ATLETA vê sobre a própria situação. Regra absoluta: o BORA NEXT só aparece quando existe
// uma jornada NEXT criada por decisão técnica humana. "Quase lá" é triagem interna: o atleta vê "em análise".

export type ApplicationStatus =
  | "DRAFT" | "SUBMITTED" | "PRELIM_ELIGIBLE" | "PRELIM_ALMOST" | "PRELIM_NOT_NOW" | "UNDER_REVIEW" | "NEEDS_INFO"
  | "TECH_APPROVED" | "TECH_NOT_APPROVED" | "REASSESSMENT_PENDING" | "WITHDRAWN";
export type MembershipVerified = "PENDENTE" | "ATIVO_CONFIRMADO" | "EX_ALUNO_CONFIRMADO" | "NAO_ALUNO_CONFIRMADO" | "DIVERGENCIA";
export type AccessStatus = "CANDIDATE_ONLY" | "PENDING_ENROLLMENT" | "ACTIVE_MEMBER" | "SUSPENDED";
export type JourneyStatus = "NONE" | "ROAD_TO_BOSTON" | "BORA_NEXT" | "PAUSED" | "COMPLETED";
export type EnrollmentStatus = "OFFERED" | "PENDING_ENROLLMENT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type AthleteSituation = {
  applicationStatus: ApplicationStatus | null;
  slaDueAt: string | null;
  nextReassessmentOn: string | null;
  membershipVerified: MembershipVerified;
  accessStatus: AccessStatus;
  journeyStatus: JourneyStatus;
  enrollment: { id: string; journey: "ROAD_TO_BOSTON" | "BORA_NEXT"; status: EnrollmentStatus } | null;
  openInfoRequest: boolean;
};

export type Tone = "neutral" | "progress" | "success" | "attention" | "calm";

export type StatusView = {
  key: string;
  label: string; // etiqueta curta (página 1 do passaporte)
  headline: string;
  body: string;
  tone: Tone;
  action?: { label: string; href: string };
};

function dateBR(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
}

export function athleteStatusView(s: AthleteSituation): StatusView {
  const e = s.enrollment;

  // Jornadas (só existem depois de decisão técnica humana).
  if (e && e.journey === "ROAD_TO_BOSTON" && e.status === "ACTIVE") {
    return { key: "road_active", label: "Road to Boston 2028", tone: "success", headline: "Você está no Road to Boston 2028",
      body: "Aprovação técnica confirmada. Metas, testes e carimbos aparecem aqui conforme o ciclo avança.",
      action: { label: "Ver minha jornada", href: "/passport/jornada" } };
  }
  if (e && e.journey === "BORA_NEXT" && e.status === "ACTIVE") {
    return { key: "next_active", label: "BORA NEXT", tone: "success", headline: "Você está no BORA NEXT",
      body: "Seu caminho de desenvolvimento, com metas intermediárias e reavaliação com a coordenação técnica.",
      action: { label: "Ver minhas metas", href: "/passport/indicadores" } };
  }
  if (e && e.journey === "BORA_NEXT" && e.status === "OFFERED") {
    return { key: "next_offered", label: "Convite BORA NEXT", tone: "progress", headline: "A coordenação técnica indicou o BORA NEXT para você",
      body: "Depois de analisar sua candidatura, a coordenação definiu seu caminho de desenvolvimento. Como aluno BORA ativo, você entra sem cobrança adicional.",
      action: { label: "Ver convite", href: "/passport/jornada" } };
  }
  if (e && e.status === "PENDING_ENROLLMENT") {
    const journey = e.journey === "BORA_NEXT" ? "o BORA NEXT" : "o Road to Boston 2028";
    return { key: `${e.journey === "BORA_NEXT" ? "next" : "road"}_pending_enrollment`, label: "Aguardando matrícula", tone: "progress",
      headline: e.journey === "BORA_NEXT" ? "Recomendação da coordenação técnica" : "Aprovação técnica: falta a matrícula",
      body: `Para começar ${journey}, o próximo passo é a matrícula normal na BORA. O projeto não tem cobrança extra além da mensalidade.`,
      action: { label: "Ver próximos passos", href: "/passport/jornada" } };
  }
  if (e && e.status === "PAUSED") {
    return { key: "journey_paused", label: "Jornada pausada", tone: "attention", headline: "Sua jornada está pausada",
      body: "O vínculo com a BORA mudou. Seu histórico continua guardado; ao confirmar a matrícula, a jornada volta.",
      action: { label: "Ver detalhes", href: "/passport/jornada" } };
  }

  switch (s.applicationStatus) {
    case null:
    case "DRAFT":
      return { key: "no_application", label: "Passaporte emitido", tone: "neutral", headline: "Seu passaporte está pronto",
        body: "Quando quiser, faça sua candidatura ao Road to Boston 2028. Leva poucos minutos.",
        action: { label: "Fazer candidatura", href: "/passport/candidatura" } };
    case "SUBMITTED":
    case "PRELIM_ELIGIBLE":
    case "PRELIM_ALMOST":
    case "UNDER_REVIEW": {
      const due = dateBR(s.slaDueAt);
      return { key: "under_review", label: "Em análise", tone: "calm",
        headline: "Sua candidatura está em análise pela coordenação técnica",
        body: due ? `A coordenação técnica avalia cada caso pessoalmente. Previsão de retorno: até ${due}.`
          : "A coordenação técnica avalia cada caso pessoalmente. Você recebe o retorno aqui e por e-mail.",
        action: { label: "Acompanhar candidatura", href: "/passport/candidatura" } };
    }
    case "NEEDS_INFO":
      return { key: "needs_info", label: "Informação pendente", tone: "attention", headline: "A coordenação pediu mais informações",
        body: "Responda pelo Passport para seguirmos com a análise. Se quiser, anexe um comprovante.",
        action: { label: "Responder", href: "/passport/candidatura" } };
    case "PRELIM_NOT_NOW":
      return { key: "not_now", label: "Cuidando da saúde", tone: "calm", headline: "Agora, o foco é a sua recuperação",
        body: "Sua saúde vem primeiro. A coordenação técnica vai orientar e combinar uma reavaliação; não há oferta de treino durante o tratamento.",
        action: { label: "Ver candidatura", href: "/passport/candidatura" } };
    case "TECH_APPROVED":
      return { key: "approved", label: "Aprovado tecnicamente", tone: "success", headline: "Aprovação técnica registrada",
        body: "Veja na sua jornada o próximo passo para começar o ciclo.", action: { label: "Ver jornada", href: "/passport/jornada" } };
    case "TECH_NOT_APPROVED":
      return { key: "not_approved", label: "Parecer registrado", tone: "neutral", headline: "Parecer técnico registrado",
        body: "A coordenação técnica deixou uma orientação para você. Seu passaporte continua guardando sua evolução.",
        action: { label: "Ver parecer", href: "/passport/candidatura" } };
    case "REASSESSMENT_PENDING": {
      const on = dateBR(s.nextReassessmentOn);
      return { key: "monitoring", label: "Em acompanhamento", tone: "calm", headline: "Em acompanhamento pela coordenação técnica",
        body: on ? `Próxima reavaliação prevista para ${on}.` : "A coordenação técnica vai acompanhar sua evolução e marcar uma reavaliação.",
        action: { label: "Ver candidatura", href: "/passport/candidatura" } };
    }
    case "WITHDRAWN":
      return { key: "withdrawn", label: "Candidatura retirada", tone: "neutral", headline: "Você retirou sua candidatura",
        body: "Seu passaporte e seu histórico continuam aqui. Você pode se candidatar de novo quando quiser.",
        action: { label: "Nova candidatura", href: "/passport/candidatura" } };
  }
}

export const MEMBERSHIP_LABEL: Record<MembershipVerified, string> = {
  PENDENTE: "Vínculo em verificação",
  ATIVO_CONFIRMADO: "Aluno BORA ativo (verificado)",
  EX_ALUNO_CONFIRMADO: "Ex-aluno BORA (verificado)",
  NAO_ALUNO_CONFIRMADO: "Ainda não é aluno BORA",
  DIVERGENCIA: "Vínculo em conferência",
};

/** Etiquetas do OS (equipe). Aqui "Quase lá" aparece, porque é a fila do Lucas. */
export const APPLICATION_STATUS_OS: Record<ApplicationStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviada",
  PRELIM_ELIGIBLE: "Elegível preliminar",
  PRELIM_ALMOST: "Quase lá",
  PRELIM_NOT_NOW: "Agora não",
  UNDER_REVIEW: "Em análise",
  NEEDS_INFO: "Aguardando informação",
  TECH_APPROVED: "Aprovado tecnicamente",
  TECH_NOT_APPROVED: "Não aprovado tecnicamente",
  REASSESSMENT_PENDING: "Reavaliação pendente",
  WITHDRAWN: "Retirada",
};
