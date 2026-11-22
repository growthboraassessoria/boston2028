// Seções editoriais da landing (server components). Texto direto, sem promessa de vaga e sem afiliação à B.A.A.
import { clsx } from "clsx";
import { ArrowRight, CalendarClock, Check, Flag, Gauge, HeartPulse, Route, ShieldCheck, Sparkles, Stethoscope, Timer, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { BoraShield } from "@/components/brand/Bora";
import { ElevationLine, SplitTicks } from "@/components/graphics/Course";
import type { CalendarItem, PublicRace } from "@/lib/data/public";
import { formatDateBR, type StandardsVersion } from "@/lib/domain/standards";
import { formatDuration } from "@/lib/domain/time";

export function Container({ className, children, ...rest }: React.ComponentProps<"div">) {
  return <div className={clsx("safe-x mx-auto w-full max-w-7xl", className)} {...rest}>{children}</div>;
}

// Marcações de movimento (GSAP): ver src/components/motion/MotionRoot.tsx. `intro` = é a abertura da página.
const motionItem = (intro?: boolean) => (intro ? { "data-hero-item": "" } : { "data-reveal": "" });
const heroIf = (intro?: boolean) => (intro ? { "data-hero": "" } : {});

export function SectionHead({ eyebrow, title, lead, light, id, intro }: {
  eyebrow: string; title: React.ReactNode; lead?: React.ReactNode; light?: boolean; id?: string; intro?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className={clsx("label-mono", light ? "text-blue-700" : "text-volt")} {...motionItem(intro)}>{eyebrow}</p>
      <h2 id={id} className={clsx("display mt-3 text-[clamp(2.1rem,1.2rem+3.6vw,4.4rem)]", light ? "text-ink" : "text-mist-50")}
        {...(intro ? { "data-hero-split": "" } : { "data-split": "" })}>{title}</h2>
      {lead && <p className={clsx("mt-5 text-lg leading-relaxed", light ? "text-mist-700" : "text-mist-200")} {...motionItem(intro)}>{lead}</p>}
    </div>
  );
}

export function Hero({ version }: { version: StandardsVersion | null }) {
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-hidden bg-night-900" data-hero>
      <div className="hairline-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[38rem] rounded-full bg-blue-700/40 blur-3xl" aria-hidden data-float />
      <Container className="relative grid gap-12 pb-10 pt-14 sm:pt-20 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:pb-16 lg:pt-28">
        <div>
          <p className="label-mono text-mist-300" data-hero-item>BORA apresenta · projeto independente</p>
          <h1 id="hero-title" className="display mt-5 text-[clamp(2.75rem,1.1rem+8.4vw,6.9rem)] text-mist-50" data-hero-split>
            Road to<br />Boston <span className="text-volt">2028</span>
          </h1>
          <p className="mt-6 text-[clamp(1.25rem,1rem+0.9vw,1.6rem)] font-medium text-mist-50" data-hero-item>Seu próximo índice começa aqui.</p>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-mist-200" data-hero-item>
            Um ciclo de desenvolvimento da BORA para quem quer buscar o índice da Boston Marathon 2028: avaliação técnica humana,
            metas por etapa e o seu Boston Passport para guardar cada conquista.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row" data-hero-item>
            <ButtonLink href="/calculadora" size="lg" data-magnetic>Descobrir meu índice <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            <ButtonLink href="/projeto" size="lg" variant="outline" data-magnetic>Conhecer o projeto</ButtonLink>
          </div>
        </div>
        <RaceBib version={version} />
      </Container>
      <div className="relative">
        <Container>
          <ElevationLine className="h-28 sm:h-36" />
        </Container>
      </div>
      <Container className="relative grid grid-cols-2 gap-px border-t border-white/10 sm:grid-cols-4" data-stagger>
        {[
          ["17.04.2028", "Data da prova usada para a idade"],
          ["42.195 km", "Só maratona certificada qualifica"],
          ["3 dias úteis", "Retorno da coordenação técnica"],
          ["R$ 0 extra", "Para aluno BORA ativo"],
        ].map(([k, v]) => (
          <div key={k} className="py-5 pr-4">
            {/* Os números rodam como cronômetro; o leitor de tela lê o texto fixo. */}
            <p className="tabular font-mono text-lg text-mist-50"><span className="sr-only">{k}</span><span aria-hidden data-scramble>{k}</span></p>
            <p className="mt-1 text-xs leading-snug text-mist-400">{v}</p>
          </div>
        ))}
      </Container>
    </section>
  );
}

/** Número de peito inventado: identidade da BORA, sem nenhum elemento de credencial oficial. */
function RaceBib({ version }: { version: StandardsVersion | null }) {
  const example = version?.rows.find((r) => r.category === "M" && r.ageMin === 35);
  return (
    <div aria-hidden className="relative mx-auto hidden w-full max-w-sm rotate-[-3deg] sm:block" data-hero-bib>
      <div className="relative overflow-hidden rounded-lg bg-paper p-5 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]">
        <div className="flex items-center justify-between">
          <span className="label-mono text-mist-600">BORA · RTB 2028</span>
          <BoraShield className="h-7 w-auto text-ink" />
        </div>
        {/* Conta de 1897 (a primeira Boston Marathon) até 2028. */}
        <p className="display mt-4 text-center text-[5.5rem] leading-none tabular" data-count-from="1897">2028</p>
        <div className="mt-2 grid grid-cols-3 border-t border-ink/15 pt-3 text-center">
          <div><p className="label-mono text-mist-600">Faixa</p><p className="font-mono text-sm">35-39</p></div>
          <div><p className="label-mono text-mist-600">Índice</p><p className="font-mono text-sm">{example ? formatDuration(example.seconds) : "—"}</p></div>
          <div><p className="label-mono text-mist-600">Ciclo</p><p className="font-mono text-sm">2027</p></div>
        </div>
        <SplitTicks className="mt-4 h-4 text-ink" />
        <p className="label-mono mt-3 text-center text-[0.6rem] text-mist-600">Exemplo ilustrativo · M 35-39</p>
      </div>
      <span className="absolute -left-2 top-1/2 size-3 -translate-y-1/2 rounded-full bg-night-900" />
      <span className="absolute -right-2 top-1/2 size-3 -translate-y-1/2 rounded-full bg-night-900" />
    </div>
  );
}

export function Narrative() {
  const items = [
    { k: "01", t: "Boston atrai", b: "O sonho de correr Boston dá direção ao treino. O índice vira uma meta concreta, com data e número." },
    { k: "02", t: "A BORA desenvolve", b: "Coordenação técnica, treinador e metas por etapa. Quem ainda precisa evoluir segue pelo BORA NEXT." },
    { k: "03", t: "A evolução retém", b: "Cada teste, carimbo e marca fica no seu Boston Passport. A conquista é a jornada inteira, não só o dia da prova." },
  ];
  return (
    <section aria-labelledby="narrativa" className="light grain">
      <Container className="py-20 sm:py-28">
        <SectionHead light id="narrativa" eyebrow="A ideia" title={<>Um sonho com<br />método por trás</>}
          lead="O Road to Boston 2028 não vende a vaga em Boston. Ele organiza o caminho até o índice, com quem entende de corrida acompanhando você." />
        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 md:grid-cols-3" data-reveal>
          {items.map((i) => (
            <article key={i.k} className="bg-paper p-7">
              <p className="tabular font-mono text-sm text-mist-500">{i.k}</p>
              <h3 className="display mt-4 text-3xl text-ink">{i.t}</h3>
              <p className="mt-3 leading-relaxed text-mist-700">{i.b}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function IndexExplainer({ version }: { version: StandardsVersion | null }) {
  return (
    <section aria-labelledby="o-que-e" className="bg-night-900">
      <Container className="grid gap-12 py-20 sm:py-28 lg:grid-cols-2">
        <SectionHead id="o-que-e" eyebrow="O que é o índice" title={<>Tempo mínimo.<br />Não é vaga.</>}
          lead="O índice é o tempo de maratona que a Boston Athletic Association (B.A.A.) exige para você poder pedir inscrição. Ele muda conforme a categoria e a idade que você terá no dia da prova." />
        <div className="grid content-start gap-4" data-stagger>
          {[
            { icon: CalendarClock, t: "Idade no dia da prova", b: version ? `Para 2028, conta a idade em ${formatDateBR(version.raceDate)}. Mínimo de ${version.minAge} anos.` : "Para 2028, conta a idade no dia da prova." },
            { icon: Route, t: "Só maratona certificada", b: "A B.A.A. aceita maratonas em percurso certificado, com tempo líquido (chip). Meia maratona não qualifica." },
            { icon: ShieldCheck, t: "Índice dá direito a pedir", b: "Com mais candidatos que vagas, a B.A.A. aceita os mais rápidos de cada faixa. Em 2027, o corte foi de 5min17s abaixo do índice." },
          ].map(({ icon: Icon, t, b }) => (
            <div key={t} className="flex gap-4 rounded-lg border border-white/10 bg-night-850 p-5">
              <Icon className="mt-0.5 size-5 shrink-0 text-volt" aria-hidden />
              <div>
                <h3 className="font-semibold text-mist-50">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist-200">{b}</p>
              </div>
            </div>
          ))}
          {version && (
            <p className="text-xs leading-relaxed text-mist-400">
              Fonte: <a className="underline underline-offset-2 hover:text-volt" href={version.sourceUrl} target="_blank" rel="noopener noreferrer">baa.org</a>,
              consultada em {formatDateBR(version.consultedAt)}. Confira sempre a fonte oficial antes de planejar sua prova.
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

export function StandardsTable({ version }: { version: StandardsVersion | null }) {
  if (!version) return null;
  const groups = Array.from(new Set(version.rows.map((r) => r.ageMin))).sort((a, b) => a - b);
  const cell = (cat: "M" | "F" | "X", min: number) => version.rows.find((r) => r.category === cat && r.ageMin === min);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10" data-reveal>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Índices oficiais da B.A.A. para 2027 e 2028 por faixa etária e categoria</caption>
        <thead className="bg-night-800">
          <tr>
            <th scope="col" className="label-mono px-4 py-3 text-mist-300">Faixa</th>
            <th scope="col" className="label-mono px-4 py-3 text-mist-300">Masc.</th>
            <th scope="col" className="label-mono px-4 py-3 text-mist-300">Fem.</th>
            <th scope="col" className="label-mono px-4 py-3 text-mist-300">Não bin.</th>
          </tr>
        </thead>
        <tbody data-stagger="fade">
          {groups.map((g) => {
            const m = cell("M", g); const f = cell("F", g); const x = cell("X", g);
            return (
              <tr key={g} className="border-t border-white/5 even:bg-white/[0.02]">
                <th scope="row" className="tabular px-4 py-2.5 font-mono font-normal text-mist-200">{m?.ageMax ? `${g}–${m.ageMax}` : `${g}+`}</th>
                <td className="tabular px-4 py-2.5 font-mono text-mist-50">{m ? formatDuration(m.seconds) : "—"}</td>
                <td className="tabular px-4 py-2.5 font-mono text-mist-50">{f ? formatDuration(f.seconds) : "—"}</td>
                <td className="tabular px-4 py-2.5 font-mono text-mist-50">{x ? formatDuration(x.seconds) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-white/5 bg-night-850 px-4 py-3 text-xs leading-relaxed text-mist-400">
        {version.label}. Fonte: <a className="underline underline-offset-2 hover:text-volt" href={version.sourceUrl} target="_blank" rel="noopener noreferrer">baa.org</a> ·
        consultada em {formatDateBR(version.consultedAt)}. Para-atletas têm regras próprias da B.A.A.
      </p>
    </div>
  );
}

export function HowSelection() {
  const steps = [
    { t: "Simule no Index Lab", b: "Descubra o índice da sua faixa no dia da prova e quanto falta." },
    { t: "Crie seu Passport", b: "Gratuito para todo cadastrado. Guarda sua jornada, aprovado ou não." },
    { t: "Candidate-se", b: "Prova alvo, marca recente, frequência de treino e saúde. Todas as perguntas, sempre." },
    { t: "Triagem preliminar", b: "Organiza a fila da coordenação. Não aprova nem reprova ninguém." },
    { t: "Avaliação técnica humana", b: "A coordenação técnica da BORA analisa cada caso. Retorno em até 3 dias úteis para quem está perto." },
    { t: "Seu caminho", b: "Road to Boston para quem está pronto. BORA NEXT para quem ainda precisa evoluir, por decisão técnica." },
  ];
  return (
    <section aria-labelledby="selecao" className="light">
      <Container className="py-20 sm:py-28">
        <SectionHead light id="selecao" eyebrow="Como funciona a seleção" title={<>Seis etapas,<br />uma pessoa decide</>}
          lead="Nenhuma decisão técnica é automática. O resultado da calculadora e da triagem é preliminar; quem aprova é a coordenação técnica." />
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
          {steps.map((s, i) => (
            <li key={s.t} className="relative rounded-xl border border-ink/10 bg-white/60 p-6">
              <span className="tabular font-mono text-sm text-mist-500">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{s.t}</h3>
              <p className="mt-2 leading-relaxed text-mist-700">{s.b}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function Criteria({ races, intro }: { races: PublicRace[]; intro?: boolean }) {
  const rules = [
    { icon: Timer, t: "Marca recente", b: "Maratona até 15 minutos acima do índice da sua faixa, ou meia maratona cujo tempo × 2 fique até 5 minutos acima." },
    { icon: Gauge, t: "Rotina de treino", b: "Mínimo de quatro treinos por semana." },
    { icon: HeartPulse, t: "Saúde em primeiro lugar", b: "Quem está em tratamento de lesão recebe orientação e reavaliação, nunca oferta automática de treino." },
    { icon: Flag, t: "Prova alvo em 2027", b: "Escolher uma das provas alvo. Exceções só por decisão técnica." },
  ];
  return (
    <section aria-labelledby="criterios" className="bg-night-900" {...heroIf(intro)}>
      <Container className="py-20 sm:py-28">
        <SectionHead id="criterios" eyebrow="Critérios e provas alvo" title={<>A régua interna<br />da BORA</>} intro={intro}
          lead="É a triagem do projeto, diferente da qualificação oficial. Ela é preliminar e sempre revisada por uma pessoa." />
        <div className="mt-14 grid gap-4 md:grid-cols-2" data-stagger>
          {rules.map(({ icon: Icon, t, b }) => (
            <div key={t} className="flex gap-4 rounded-xl border border-white/10 bg-night-850 p-6">
              <Icon className="mt-0.5 size-5 shrink-0 text-volt" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold text-mist-50">{t}</h3>
                <p className="mt-2 leading-relaxed text-mist-200">{b}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-signal/30 bg-signal/[0.06] p-5 text-sm leading-relaxed text-mist-100" data-reveal>
          A meia maratona serve só para a triagem interna da BORA. Para pedir inscrição em Boston, a B.A.A. exige maratona certificada.
        </div>
        <h3 className="label-mono mt-14 text-mist-300" data-reveal>Provas alvo de 2027</h3>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3" data-stagger>
          {races.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10 p-6">
              <p className="label-mono text-mist-400">{r.city} · {r.country}</p>
              <p className="display mt-3 text-3xl text-mist-50">{r.city}</p>
              <p className="mt-2 text-sm text-mist-200">{r.name}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-sm border border-white/15 px-2 py-1 text-xs text-mist-200">
                <CalendarClock className="size-3.5" aria-hidden />
                {r.raceDateConfirmed && r.raceDate ? formatDateBR(r.raceDate) : "Data a confirmar"}
              </p>
            </li>
          ))}
          {races.length === 0 && <li className="text-sm text-mist-300">Provas alvo indisponíveis no momento.</li>}
        </ul>
      </Container>
    </section>
  );
}

export function ProgramVsBoston() {
  return (
    <section aria-labelledby="diferenca" className="light grain">
      <Container className="grid gap-10 py-20 sm:py-28 lg:grid-cols-2">
        <SectionHead light id="diferenca" eyebrow="Para não confundir" title={<>Programa da BORA<br />≠ aprovação em Boston</>} />
        <div className="grid gap-4" data-stagger>
          {[
            ["Elegível preliminar", "É só a triagem do projeto. Ainda depende da coordenação técnica."],
            ["Aprovação técnica", "É a decisão da coordenação da BORA para você entrar no ciclo Road to Boston."],
            ["Índice B.A.A.", "É o tempo oficial de maratona que permite pedir inscrição na Boston Marathon."],
            ["Inscrição em Boston", "É decidida pela B.A.A., com corte e regras próprias. A BORA não tem vagas nem parceria oficial."],
          ].map(([t, b]) => (
            <div key={t} className="flex gap-4 border-b border-ink/10 pb-4">
              <Check className="mt-1 size-4 shrink-0 text-blue-700" aria-hidden />
              <p className="leading-relaxed text-mist-700"><strong className="text-ink">{t}:</strong> {b}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  previsto: "Previsto",
  a_definir: "A definir",
  a_confirmar: "A confirmar",
  confirmado: "Confirmado",
  oficial_baa: "Data oficial B.A.A.",
};

export function CalendarSection({ items, intro }: { items: CalendarItem[]; intro?: boolean }) {
  return (
    <section aria-labelledby="calendario" className="bg-night-900" {...heroIf(intro)}>
      <Container className="py-20 sm:py-28">
        <SectionHead id="calendario" eyebrow="Calendário" title={<>Etapa por etapa<br />até abril de 2028</>} intro={intro}
          lead="Datas marcadas como previstas ou a confirmar ainda podem mudar. Nada aqui é cronograma fechado até a coordenação confirmar." />
        <ol className="relative mt-14 border-l border-white/10" data-timeline>
          {/* Linha que acompanha a rolagem (GSAP). Sem movimento, fica só o trilho da borda. */}
          <span aria-hidden data-timeline-line className="pointer-events-none absolute -left-px top-0 h-full w-px origin-top bg-volt/70"
            style={{ transform: "scaleY(0)" }} />
          {items.map((i) => (
            <li key={i.key} className="relative grid gap-1 py-4 pl-6 sm:grid-cols-[14rem_1fr_auto] sm:items-baseline sm:gap-6" data-reveal>
              <span className={clsx("absolute -left-[5px] top-6 size-[9px] rounded-full",
                i.status === "em_andamento" ? "bg-volt" : i.status === "oficial_baa" ? "bg-signal" : "bg-mist-500")} aria-hidden data-timeline-dot />
              <span className="tabular font-mono text-sm text-mist-300">{i.when}</span>
              <span className="text-mist-50">{i.label}</span>
              <span className="label-mono text-mist-400">{STATUS_LABEL[i.status] ?? i.status}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function TestsGamification() {
  const tests = [["Jan", "3 km"], ["Fev", "5 km"], ["Mar", "10 km"], ["Abr", "21 km"], ["Mai", "BORA 42K"]];
  return (
    <section aria-labelledby="testes" className="light">
      <Container className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[1fr_1.1fr]">
        <SectionHead light id="testes" eyebrow="Testes e gamificação" title={<>Um teste por mês,<br />um carimbo por etapa</>}
          lead="O ranking compara você com o índice da sua própria faixa, não pelo tempo bruto. Participar do mural é opcional." />
        <div>
          <ol className="grid grid-cols-5 gap-2" data-stagger>
            {tests.map(([m, d]) => (
              <li key={m} className="rounded-lg border border-ink/10 bg-white/60 p-3 text-center">
                <p className="label-mono text-mist-500">{m}</p>
                <p className="mt-2 font-mono text-sm font-semibold text-ink">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-mist-600">Meses do plano original. Datas e o formato do BORA 42K ainda serão confirmados pela coordenação.</p>
          <div className="mt-8 grid gap-3" data-stagger>
            {[
              ["Na rota", "até 3% acima da referência da sua faixa"],
              ["Índice", "na referência"],
              ["Boston seguro", "3% ou mais abaixo da referência (nome interno: não garante vaga)"],
            ].map(([t, b]) => (
              <div key={t} className="flex items-baseline justify-between gap-4 border-b border-ink/10 pb-3">
                <span className="font-semibold text-ink">{t}</span>
                <span className="text-right text-sm text-mist-700">{b}</span>
              </div>
            ))}
            <p className="text-xs text-mist-600">Fórmula e fronteiras em validação pela coordenação técnica antes de ligar o ranking.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function BenefitsSection() {
  const cats = [
    { icon: Sparkles, t: "Calçados e equipamentos" },
    { icon: Stethoscope, t: "Saúde e avaliações" },
    { icon: HeartPulse, t: "Nutrição e recuperação" },
    { icon: Users, t: "Experiências e serviços" },
  ];
  return (
    <section aria-labelledby="beneficios" className="bg-night-900">
      <Container className="py-20 sm:py-28">
        <SectionHead id="beneficios" eyebrow="Quem participa" title={<>O que muda<br />para você</>}
          lead="Aluno BORA ativo confirmado mantém a mensalidade atual e não paga nada a mais pelo projeto. O BORA NEXT também não é plano separado." />
        <div className="mt-14 grid gap-4 md:grid-cols-3" data-stagger>
          {[
            ["Boston Passport", "Gratuito para todo cadastrado. Guarda simulações, candidatura, carimbos e evolução, mesmo sem aprovação."],
            ["Acompanhamento técnico", "Metas por etapa, testes mensais e reavaliação com a coordenação. Recursos completos com matrícula ativa."],
            ["Benefícios de parceiros", "Vitrine no Passport com regras claras e resgate único. Só parceiros cadastrados e confirmados."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-night-850 p-6">
              <h3 className="text-lg font-semibold text-mist-50">{t}</h3>
              <p className="mt-2 leading-relaxed text-mist-200">{b}</p>
            </div>
          ))}
        </div>
        <ul className="mt-8 flex flex-wrap gap-2" aria-label="Categorias de benefícios" data-stagger>
          {cats.map(({ icon: Icon, t }) => (
            <li key={t} className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-mist-200">
              <Icon className="size-4 text-volt" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-mist-400">Nutrição, fortalecimento e outros serviços são opcionais e nunca condição de entrada.</p>
      </Container>
    </section>
  );
}

export const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "A BORA garante minha vaga na Boston Marathon?", a: "Não. A inscrição é decidida pela Boston Athletic Association, com regras e corte próprios. Atingir o índice dá o direito de pedir inscrição, não garante a vaga. O Road to Boston 2028 é um projeto independente da BORA, sem afiliação ou parceria com a B.A.A." },
  { q: "Quanto custa?", a: "Se você é aluno BORA ativo confirmado, continua pagando só a sua mensalidade atual: o projeto não tem cobrança adicional. Quem não é aluno pode se candidatar e ter o Passport de graça; os recursos completos de treino e os benefícios de membro dependem da matrícula normal na BORA." },
  { q: "Já sou aluno. Por que preciso esperar a verificação?", a: "Porque o vínculo informado no cadastro é conferido pela equipe antes de liberar qualquer recurso de membro. Isso protege você e os outros alunos." },
  { q: "Minha meia maratona conta para Boston?", a: "Não. A meia maratona serve apenas para a triagem interna da BORA (tempo × 2). Para pedir inscrição, a B.A.A. exige uma maratona em percurso certificado." },
  { q: "Que idade vale para o índice?", a: "A idade que você terá no dia da Boston Marathon 2028, 17 de abril de 2028, como a B.A.A. define. A calculadora já faz essa conta." },
  { q: "O que é o BORA NEXT?", a: "É o caminho de desenvolvimento para quem ainda precisa evoluir antes do Road to Boston. Ele só é indicado depois da avaliação da coordenação técnica, nunca automaticamente, e não é uma assinatura separada." },
  { q: "Estou em tratamento de lesão. Posso me candidatar?", a: "Pode, e sua saúde vem primeiro. Você recebe orientação e uma reavaliação; não há oferta automática de treino enquanto o tratamento estiver em curso." },
  { q: "Quanto tempo demora o retorno?", a: "Para quem está perto da régua, a meta da coordenação técnica é fazer contato em até 3 dias úteis. Você acompanha tudo pelo Passport." },
  { q: "Meus dados de saúde ficam visíveis?", a: "Não. Perguntamos só se há lesão em tratamento (sim ou não), com acesso restrito à coordenação técnica e prazo de guarda definido. Nada disso vai para o perfil público, o ranking ou os parceiros." },
];

export function FaqSection({ items = FAQ_ITEMS, limit, intro }: { items?: { q: string; a: string }[]; limit?: number; intro?: boolean }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <section aria-labelledby="faq" className="light" {...heroIf(intro)}>
      <Container className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHead light id="faq" eyebrow="Perguntas frequentes" title={<>Antes de<br />começar</>} intro={intro} />
        <div className="divide-y divide-ink/10 border-y border-ink/10" data-stagger>
          {list.map((i) => (
            <details key={i.q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-lg font-medium text-ink">
                {i.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-ink/15 text-mist-600 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="pb-5 pr-10 leading-relaxed text-mist-700">{i.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-final" className="grain relative overflow-hidden bg-night-900">
      <div className="pointer-events-none absolute -bottom-32 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-blue-700/40 blur-3xl" aria-hidden data-float />
      <Container className="relative py-24 text-center sm:py-32">
        <div data-reveal><BoraShield className="mx-auto h-14 w-auto text-volt" /></div>
        <h2 id="cta-final" className="display mx-auto mt-8 max-w-4xl text-[clamp(2.4rem,1.2rem+5vw,5.6rem)] text-mist-50" data-split>
          Seu índice tem data.<br />Sua jornada começa hoje.
        </h2>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row" data-reveal>
          <ButtonLink href="/calculadora" size="lg" data-magnetic>Descobrir meu índice <ArrowRight className="size-4" aria-hidden /></ButtonLink>
          <ButtonLink href="/cadastro" size="lg" variant="outline" data-magnetic>Criar meu Boston Passport</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
