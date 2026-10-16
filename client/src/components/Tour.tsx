import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Tour guiado: destaca um elemento da tela (marcado com data-tour="...") e mostra um card explicando.
// Passos cujo elemento nao existe/nao esta visivel sao pulados.
export interface PassoTour {
  alvo: string | string[]; // valor do atributo data-tour (lista: usa o primeiro que estiver na tela)
  titulo: string;
  texto: string;
}

function acharAlvo(alvo: string | string[]): HTMLElement | null {
  for (const a of Array.isArray(alvo) ? alvo : [alvo]) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${a}"]`));
    const el = els.find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
    if (el) return el;
  }
  return null;
}

const PAD = 6;

export default function Tour({ passos, onFim }: { passos: PassoTour[]; onFim: () => void }) {
  // so os passos que existem na tela agora
  const [lista] = useState(() => passos.filter((p) => acharAlvo(p.alvo)));
  const [i, setI] = useState(0);
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const passo = lista[i];

  const medir = useCallback(() => {
    if (!passo) return;
    const el = acharAlvo(passo.alvo);
    setCaixa(el ? el.getBoundingClientRect() : null);
  }, [passo]);

  // leva o elemento para o meio da tela e mede de novo depois da rolagem
  useLayoutEffect(() => {
    if (!passo) return;
    const el = acharAlvo(passo.alvo);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    medir();
    const t1 = window.setTimeout(medir, 350);
    const t2 = window.setTimeout(medir, 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [passo, medir]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFim();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, lista.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [medir, onFim, lista.length]);

  useEffect(() => {
    if (!lista.length) onFim();
  }, [lista.length, onFim]);
  if (!passo) return null;

  const ultimo = i === lista.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largura = Math.min(320, vw - 24);
  // card abaixo do elemento; se nao couber, acima
  let top = caixa ? caixa.bottom + PAD + 10 : vh / 2 - 90;
  const alturaCard = 190;
  if (caixa && top + alturaCard > vh - 70) top = Math.max(12, caixa.top - PAD - 10 - alturaCard);
  const left = caixa ? Math.min(Math.max(12, caixa.left + caixa.width / 2 - largura / 2), vw - largura - 12) : (vw - largura) / 2;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Como usar o I.A Prof">
      {/* fundo escuro com "buraco" no elemento destacado */}
      {caixa ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-amber-400 transition-all duration-300"
          style={{
            top: caixa.top - PAD,
            left: caixa.left - PAD,
            width: caixa.width + PAD * 2,
            height: caixa.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/60" />
      )}
      {/* bloqueia cliques na tela durante o tour */}
      <div className="fixed inset-0" />

      <div className="fixed rounded-xl bg-white p-4 shadow-2xl transition-all duration-300" style={{ top, left, width: largura }}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">{passo.titulo}</p>
          <span className="shrink-0 text-[11px] text-slate-400">
            {i + 1} de {lista.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{passo.texto}</p>
        <div className="mt-2 flex gap-1">
          {lista.map((_, n) => (
            <span key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-indigo-500" : "bg-slate-200"}`} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={onFim} className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
            Pular tour
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                Voltar
              </button>
            )}
            <button
              onClick={() => (ultimo ? onFim() : setI(i + 1))}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              autoFocus
            >
              {ultimo ? "Começar a usar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Passos do tour da primeira entrada (tela Gerar aula)
export const PASSOS_INICIO: PassoTour[] = [
  {
    alvo: "menu",
    titulo: "O menu",
    texto: "Toque em ☰ para abrir o menu: Plano de aulas, Atividades, Minha assinatura, Como usar, Instalar app e Sair.",
  },
  {
    alvo: "ferramenta-aulas",
    titulo: "Plano de aulas",
    texto: "Esta é a ferramenta de aulas. Dentro dela ficam os botões Gerar aula, Plano de curso e Aulas salvas.",
  },
  {
    alvo: "aba-plano",
    titulo: "1º passo: o plano de curso",
    texto: "Antes de gerar aulas, envie o plano de curso da sua série neste botão. As habilidades (códigos BNCC) das aulas vêm dele.",
  },
  { alvo: "serie", titulo: "Série e turma", texto: "Escolha a série e a turma da aula. Fica guardado para as próximas vezes." },
  {
    alvo: "periodo",
    titulo: "Período da aula",
    texto: "Escolha o bimestre/trimestre. A I.A usa só as habilidades do plano desse período.",
  },
  {
    alvo: "config-barra",
    titulo: "Suas configurações",
    texto: "Seu nome, estado e o tamanho do texto do diário ficam aqui. Para mudar, toque em ⚙️ Alterar.",
  },
  {
    alvo: "texto",
    titulo: "Conte como foi a aula",
    texto: "Escreva do seu jeito, abreviado mesmo. Ex.: “mat tabuada do 7, port leitura de fábula, acolhida”.",
  },
  { alvo: "falar", titulo: "Prefere falar?", texto: "Toque em 🎤 Falar e dite a aula. O texto aparece no campo para você conferir." },
  {
    alvo: "gerar",
    titulo: "Gerar aula",
    texto: "A I.A separa por matéria e coloca os códigos. Confira os cards (os que piscam pedem ✓ Conferi) e clique em Aprovar e salvar.",
  },
  {
    alvo: "ferramenta-atividades",
    titulo: "Atividades",
    texto: "Gere atividades com gabarito, imprima, corrija com foto ou à mão e lance as notas (no D.E.V ou numa lista aqui).",
  },
  { alvo: "uso", titulo: "Uso do mês", texto: "Aqui você acompanha quanto já usou da I.A. O limite renova todo mês no dia da sua assinatura." },
  {
    alvo: "dev",
    titulo: "Diário D.E.V",
    texto: "Se sua escola usa o D.E.V, conecte aqui com seu CPF e senha do D.E.V: a aula salva vai direto para o diário da turma.",
  },
  { alvo: "aba-historico", titulo: "Aulas salvas", texto: "Todas as aulas ficam aqui para copiar, editar ou enviar ao D.E.V." },
  { alvo: "ajuda", titulo: "Ficou com dúvida?", texto: "Em ❓ Como usar você vê o passo a passo e pode rever este tour quando quiser." },
  { alvo: "config", titulo: "Configurações", texto: "Em ⚙️ você muda seu nome, estado, tamanho do texto, conecta o D.E.V e troca o tema." },
];

// Passos do tour da tela Plano de curso. Partes que so aparecem depois (envio, revisao) usam o
// cabecalho como alternativa, para o passo ser explicado mesmo antes de o professor preencher.
export const PASSOS_PLANO: PassoTour[] = [
  {
    alvo: "pc-serie",
    titulo: "Série",
    texto: "Escolha a série do plano. Cada série tem o seu plano de curso.",
  },
  { alvo: "pc-uf", titulo: "UF", texto: "Escolha o estado (ou BNCC). Assim os códigos do currículo do seu estado são reconhecidos." },
  { alvo: "pc-ano", titulo: "Ano letivo", texto: "Confira o ano do plano. Ele vale para as aulas desse ano." },
  {
    alvo: "pc-divisao",
    titulo: "Divisão do ano",
    texto: "Escolha bimestre, trimestre ou semestre. É obrigatório antes de enviar o arquivo.",
  },
  {
    alvo: ["pc-modo", "pc-cabecalho"],
    titulo: "Como é o seu arquivo?",
    texto: "Escolha uma opção: “Um arquivo com o plano do ano inteiro” (um PDF com 1º, 2º e 3º trimestre dentro) ou “Um arquivo com o plano de cada período” (um PDF para cada trimestre).",
  },
  {
    alvo: ["pc-exemplo", "pc-modo", "pc-cabecalho"],
    titulo: "Exemplo: ano inteiro",
    texto: "Ano inteiro: envie o arquivo UMA vez. Ele precisa ter títulos como “1º TRIMESTRE”, “2º TRIMESTRE”… antes das habilidades — o sistema separa cada uma no seu período.",
  },
  {
    alvo: ["pc-exemplo", "pc-modo", "pc-cabecalho"],
    titulo: "Exemplo: um arquivo por período",
    texto: "Um por período: escolha o trimestre na lista (ex.: 2º trimestre) e envie o arquivo dele. Repita para cada trimestre. Se o arquivo não combinar com a opção escolhida, o sistema avisa.",
  },
  {
    alvo: ["pc-arquivo", "pc-envio", "pc-cabecalho"],
    titulo: "Enviar o arquivo",
    texto: "Toque na área 📎 (ou arraste o arquivo) e escolha o PDF, Word, Excel, CSV ou TXT. A leitura é automática, sem I.A e sem gastar o seu limite.",
  },
  {
    alvo: ["pc-periodos", "pc-cabecalho"],
    titulo: "Confira cada período",
    texto: "Depois de ler o arquivo, confira as habilidades em cada aba de período. Dá para editar o texto, mover ou remover.",
  },
  {
    alvo: ["pc-adicionar", "pc-cabecalho"],
    titulo: "Faltou alguma?",
    texto: "Use “+ Adicionar habilidade manualmente” para incluir no período certo: buscando na base ou digitando o código.",
  },
  {
    alvo: ["pc-salvar", "pc-cabecalho"],
    titulo: "Salvar o plano",
    texto: "Clique em Salvar. Pronto: as aulas em Gerar aula passam a usar as habilidades deste plano.",
  },
];

// Passos do tour da tela Gerar atividade (primeira vez em Atividades)
// Depois da 1a aula gerada: como conferir, editar, trocar habilidades e salvar
export const PASSOS_AULA_PRONTA: PassoTour[] = [
  { alvo: "aula-momentos", titulo: "Sua aula foi gerada! 🎉", texto: "Agora confira antes de salvar. Aqui ficam os momentos sem habilidade (acolhida, rotina…). Pode escrever, mudar ou apagar." },
  { alvo: "aula-conteudo", titulo: "Conteúdo de cada matéria", texto: "Cada card é uma matéria. Toque no texto para corrigir o conteúdo do jeito que você trabalhou." },
  { alvo: "aula-habilidades", titulo: "Habilidades", texto: "Estas são as habilidades que a I.A escolheu do seu plano de curso. Toque no ✕ para tirar uma." },
  { alvo: "aula-add-hab", titulo: "Adicionar habilidade", texto: "Faltou alguma? Escolha aqui outra habilidade do plano deste período." },
  { alvo: "aula-conferi", titulo: "Card em amarelo", texto: "A I.A ficou em dúvida neste card. Confira as habilidades e toque em ✓ Conferi." },
  { alvo: "aula-remover", titulo: "Remover matéria", texto: "Se um card não faz parte da aula, toque em remover." },
  { alvo: "aula-texto", titulo: "Texto para o diário", texto: "Este é o texto final, montado a partir dos cards. Ele se atualiza quando você muda os cards." },
  { alvo: "aula-editar", titulo: "Editar o texto", texto: "Quer mudar alguma palavra no texto final? Toque em ✏️ Editar texto." },
  { alvo: "aula-copiar", titulo: "Copiar", texto: "Copia o texto para colar em outro lugar." },
  { alvo: "aula-dev", titulo: "Enviar ao D.E.V", texto: "Deixe marcado para a aula ir direto para o seu diário no D.E.V ao salvar." },
  { alvo: "aula-salvar", titulo: "Aprovar e salvar", texto: "Tudo certo? Toque em Aprovar e salvar. A aula fica em Aulas salvas. Gerar de novo usa I.A e consome do seu limite." },
];

// Depois da 1a atividade gerada: conferir, ajustar, aprovar o gabarito e salvar
export const PASSOS_ATIV_PRONTA: PassoTour[] = [
  { alvo: "ativ-pronta", titulo: "Sua atividade foi gerada! 🎉", texto: "Ela ainda NÃO está salva. Siga os passos: ver a folha, conferir o gabarito e aprovar e salvar." },
  { alvo: "ativ-ver", titulo: "Ver a folha", texto: "Mostra a folha do jeito que vai sair na impressão, antes de salvar." },
  { alvo: "ativ-ajuste", titulo: "Pedir ajuste à I.A", texto: "Não gostou de algo? Escreva o que mudar (ex.: melhore as imagens, letra maior). Cada ajuste consome do seu limite de I.A." },
  { alvo: "ativ-editar", titulo: "Editar à mão", texto: "Aqui você muda questões, imagens, cabeçalho e o visual da folha, sem gastar I.A." },
  { alvo: "ativ-questao", titulo: "Confira cada questão", texto: "Leia o enunciado e as alternativas. Pode trocar o tipo, mudar o texto ou apagar a questão." },
  { alvo: "ativ-gabarito", titulo: "Aprove o gabarito", texto: "Confira a resposta certa de cada questão (a marcada em verde). É por ela que os alunos são corrigidos." },
  { alvo: "ativ-valor-q", titulo: "Valor de cada questão", texto: "Ajuste quanto cada questão vale. A soma é o valor total da atividade." },
  { alvo: "ativ-salvar", titulo: "Aprovar e salvar", texto: "Com o gabarito conferido, toque em Aprovar e salvar. A atividade vai para Atividades e correção." },
  { alvo: "ativ-salvar-corrigir", titulo: "Ou salvar e corrigir", texto: "Se já tem as folhas dos alunos, salve e vá direto corrigir." },
];

export const PASSOS_ATIVIDADE: PassoTour[] = [
  {
    alvo: ["ferramenta-atividades", "menu"],
    titulo: "Atividades",
    texto: "Aqui você gera atividades com gabarito, corrige (com foto ou à mão) e lança as notas.",
  },
  { alvo: "ativ-serie", titulo: "Série", texto: "Escolha a série da turma." },
  {
    alvo: "ativ-turma",
    titulo: "Turma",
    texto: "Turmas do D.E.V aparecem sozinhas se você estiver conectado. Sem D.E.V, crie a turma colando a lista de alunos (ou deixe para a hora de corrigir).",
  },
  { alvo: "ativ-periodo", titulo: "Período", texto: "Escolha o bimestre/trimestre. As habilidades vêm do plano de curso desse período." },
  {
    alvo: "ativ-materia",
    titulo: "Matéria",
    texto: "Conectado ao D.E.V, escolha a matéria da lista do D.E.V. Sem D.E.V, digite a matéria.",
  },
  {
    alvo: "ativ-habilidades",
    titulo: "Habilidades",
    texto: "Marque as habilidades do plano de curso que a atividade vai trabalhar. A I.A monta as questões em cima delas.",
  },
  { alvo: "ativ-valor", titulo: "Valor total", texto: "Quanto a atividade vale. A I.A divide entre as questões e você pode ajustar depois." },
  {
    alvo: "ativ-detalhes",
    titulo: "Como deve ser a atividade",
    texto: "Diga o tema, a quantidade e os tipos de questão: marcar X, V ou F, discursiva ou completar.",
  },
  {
    alvo: "ativ-gerar",
    titulo: "Gerar",
    texto: "A I.A cria as questões e o gabarito. Confira, ajuste os valores e clique em Aprovar e salvar. Dá para imprimir ou salvar em PDF.",
  },
  {
    alvo: ["aba-plano-ativ", "menu"],
    titulo: "Plano de curso",
    texto: "É o mesmo plano das aulas. Sem ele, não aparecem habilidades para escolher.",
  },
  {
    alvo: ["aba-atividades", "menu"],
    titulo: "Atividades e correção",
    texto: "Suas atividades salvas ficam aqui: veja, edite, imprima ou corrija. Para corrigir, escolha a atividade, toque no aluno e corrija com foto (I.A) ou à mão. Aprove e lance as notas no D.E.V ou salve a lista aqui.",
  },
  { alvo: ["aba-turmas", "menu"], titulo: "Turmas e alunos", texto: "Suas turmas com a lista de alunos (para quem não usa o D.E.V)." },
];
