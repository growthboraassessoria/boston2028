import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Aviso de privacidade" };

export default function PrivacidadePage() {
  return (
    <LegalPage title="Aviso de privacidade" updated="2026-11-20 (rascunho)">
      <p>Este aviso explica como o projeto Road to Boston 2028, iniciativa independente da BORA Assessoria, trata seus dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h2>O que coletamos e para quê</h2>
      <ul>
        <li><strong>Simulação no Boston Index Lab:</strong> data de nascimento, categoria, distância, tempo e data da marca, sem nome nem contato, para mostrar o resultado e gerar estatísticas agregadas.</li>
        <li><strong>Cadastro e Boston Passport:</strong> nome, data de nascimento, e-mail, WhatsApp, CEP, cidade, UF e categoria de referência, para criar sua conta e o passaporte.</li>
        <li><strong>Vínculo com a BORA:</strong> se você é aluno, treinador e ponto de apoio informados, para a equipe confirmar o vínculo. A autodeclaração não libera recursos pagos.</li>
        <li><strong>Candidatura:</strong> prova alvo, marca recente, frequência de treino e se há lesão em tratamento (apenas sim ou não), para a avaliação técnica.</li>
        <li><strong>Foto:</strong> só se você enviar e autorizar.</li>
      </ul>
      <h2>Dados de saúde</h2>
      <p>A pergunta sobre lesão é a única de saúde. Ela fica separada, com acesso restrito à coordenação técnica, nunca aparece em perfil público, ranking, analytics ou para parceiros, e é guardada pelo prazo definido nas configurações do programa (proposta: 24 meses).</p>
      <h2>Com quem compartilhamos</h2>
      <p>Parceiros de benefícios recebem só o mínimo para validar um resgate (por exemplo, primeiro nome e inicial), conforme seu consentimento. Não vendemos dados.</p>
      <p>Para preencher cidade e UF, o CEP digitado (só os números, sem nome nem contato) é consultado em serviços públicos de CEP: ViaCEP, BrasilAPI ou OpenCEP.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção, portabilidade, oposição ou exclusão dos seus dados em Passport › Configurações. Também pode retirar consentimentos a qualquer momento.</p>
      <h2>Contato</h2>
      <p>Encarregado de dados: a definir pela BORA antes da publicação.</p>
    </LegalPage>
  );
}
