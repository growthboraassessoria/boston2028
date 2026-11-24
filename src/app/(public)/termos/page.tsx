import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <LegalPage title="Termos de uso" updated="2026-11-20 (rascunho)">
      <p>O Road to Boston 2028 é um projeto independente da BORA Assessoria. Não é afiliado, patrocinado nem endossado pela Boston Athletic Association (B.A.A.), organizadora da Boston Marathon.</p>
      <h2>Sem garantia de vaga</h2>
      <p>Atingir o índice permite pedir inscrição na Boston Marathon, mas não garante aceitação. A B.A.A. define o corte, as regras de homologação e a aceitação. A BORA não vende, reserva nem intermedeia vagas.</p>
      <h2>Resultados preliminares</h2>
      <p>A calculadora e a triagem são preliminares. A aprovação técnica para o Road to Boston e a indicação ao BORA NEXT dependem de decisão humana da coordenação técnica da BORA, com registro e justificativa.</p>
      <h2>Custos</h2>
      <p>A candidatura e o Boston Passport são gratuitos. O treino do Road to Boston é feito no Plano Elite da BORA, com valores e condições informados pela equipe. O BORA NEXT segue na mensalidade normal da BORA, sem plano separado. Benefícios de membro exigem matrícula ativa na BORA.</p>
      <h2>Benefícios de parceiros</h2>
      <p>Cada benefício tem regras, validade, estoque e limite por pessoa próprios, informados antes do resgate. O código é pessoal e vale uma única vez.</p>
    </LegalPage>
  );
}
