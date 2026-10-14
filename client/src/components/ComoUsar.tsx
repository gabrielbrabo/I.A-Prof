import { useState } from "react";

// Pagina "Como usar": passo a passo do sistema, por assunto (abre e fecha cada um)
interface Secao {
  id: string;
  icone: string;
  titulo: string;
  passos: string[];
  dica?: string;
}

const SECOES: Secao[] = [
  {
    id: "comecar",
    icone: "🚀",
    titulo: "Primeiros passos",
    passos: [
      "Toque em 📚 Plano de aulas e depois em Plano de curso. Escolha a série, a UF, o ano letivo e a divisão do ano (bimestre, trimestre ou semestre).",
      "Envie o arquivo do plano (PDF, Word, Excel, CSV ou TXT). Pode ser o plano do ano todo ou de um período por vez.",
      "Confira as habilidades em cada aba de período. Se faltar alguma, use “+ Adicionar habilidade manualmente”.",
      "Clique em Salvar. Pronto: as aulas passam a usar as habilidades desse plano.",
    ],
    dica: "A leitura do plano não usa I.A e não gasta o seu limite do mês.",
  },
  {
    id: "gerar",
    icone: "✨",
    titulo: "Gerar uma aula",
    passos: [
      "Em 📚 Plano de aulas › Gerar aula, confira série, turma, UF, data e o período da aula.",
      "Ajuste o tamanho máximo do texto para o limite do campo do seu diário.",
      "Escreva como foi a aula, do seu jeito (ex.: “mat tabuada, port leitura de fábula”), ou toque em 🎤 Falar.",
      "Clique em ✨ Gerar aula. A I.A separa por matéria e escolhe as habilidades do plano do período.",
      "Confira cada card. Os que piscam em amarelo são palpites: veja as habilidades e clique em ✓ Conferi.",
      "Troque, remova ou adicione habilidades no card (até 5 por matéria). Para usar uma de outro período, marque a opção laranja.",
      "Revise o texto final. Se quiser, use ✏️ Editar texto. Depois clique em Aprovar e salvar.",
    ],
    dica: "Momentos sem matéria (Acolhida, Rotina diária…) aparecem no campo “Momentos da aula” e entram no início do texto.",
  },
  {
    id: "dia",
    icone: "📅",
    titulo: "Já tem aula salva no mesmo dia",
    passos: [
      "Ao salvar uma aula na mesma data e turma de outra, o sistema pergunta o que fazer.",
      "Substituir: a aula nova fica no lugar da antiga.",
      "Juntar: o conteúdo novo é acrescentado na aula do dia.",
      "Salvar como outra aula: ficam duas aulas no mesmo dia.",
    ],
  },
  {
    id: "salvas",
    icone: "🗂️",
    titulo: "Aulas salvas",
    passos: [
      "Todas as aulas aprovadas ficam em 📚 Plano de aulas › Aulas salvas.",
      "Use Copiar para colar o texto no diário, ou Abrir / editar para mudar algo.",
      "Aulas com palpite ainda não conferido piscam em amarelo até você conferir.",
    ],
  },
  {
    id: "dev",
    icone: "📒",
    titulo: "D.E.V",
    passos: [
      "Clique em “Conectar ao D.E.V” (embaixo do seu nome, no topo) e entre com o CPF e a senha do D.E.V.",
      "No campo Turma, escolha a turma da lista do D.E.V.",
      "Ao escolher turma e data, o sistema avisa se já existe aula lançada no D.E.V nesse dia ou se a data não é dia letivo.",
      "Ao salvar, a aula vai também para o D.E.V (dá para desmarcar). Se já houver aula lá, você escolhe substituir ou juntar.",
      "Em Aulas salvas aparece “✓ no D.E.V” ou o botão “Enviar ao D.E.V”.",
    ],
    dica: "Conectado ao D.E.V, o nome do professor nas aulas é o do seu cadastro no D.E.V.",
  },
  {
    id: "assinatura",
    icone: "💳",
    titulo: "Assinatura e uso da I.A",
    passos: [
      "A barra “Uso de I.A neste mês” mostra quanto você já usou. O limite renova todo dia 1º.",
      "No teste grátis você pode usar por alguns dias ou um número de aulas, o que acabar primeiro.",
      "Em 💳 Minha assinatura você escolhe o plano e paga com PIX (QR Code na tela) ou cartão (cobrança automática).",
    ],
  },
  {
    id: "app",
    icone: "📲",
    titulo: "Instalar no celular ou computador",
    passos: [
      "Toque em 📲 Instalar (ou em “Instalar o app” na tela de entrada).",
      "No iPhone: abra no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”.",
      "O I.A Prof abre direto da tela inicial, como um aplicativo.",
    ],
  },
];

export default function ComoUsar({ onFechar, onRever }: { onFechar: () => void; onRever: (qual: "inicio" | "plano") => void }) {
  const [aberta, setAberta] = useState<string | null>("comecar");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3 sm:p-6" onClick={onFechar}>
      <div className="mx-auto w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-slate-800">❓ Como usar o I.A Prof</p>
            <p className="text-sm text-slate-500">Toque em um assunto para ver o passo a passo.</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ×
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tour guiado (mostra na tela onde clicar)</p>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => onRever("inicio")}
            className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100"
          >
            <span className="text-2xl">✨</span>
            <span>
              <span className="block text-sm font-semibold text-indigo-900">Tour: Gerar aula</span>
              <span className="block text-xs text-indigo-800">Como registrar uma aula, do texto ao salvar.</span>
            </span>
          </button>
          <button
            onClick={() => onRever("plano")}
            className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100"
          >
            <span className="text-2xl">📘</span>
            <span>
              <span className="block text-sm font-semibold text-indigo-900">Tour: Plano de curso</span>
              <span className="block text-xs text-indigo-800">Como enviar, conferir e salvar o plano.</span>
            </span>
          </button>
        </div>

        <div className="space-y-2">
          {SECOES.map((s) => {
            const on = aberta === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-slate-200">
                <button
                  onClick={() => setAberta(on ? null : s.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={on}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="text-lg">{s.icone}</span>
                    {s.titulo}
                  </span>
                  <span className={`text-slate-400 transition-transform ${on ? "rotate-180" : ""}`}>▾</span>
                </button>
                {on && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    <ol className="space-y-2">
                      {s.passos.map((p, n) => (
                        <li key={n} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                            {n + 1}
                          </span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                    {s.dica && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">💡 {s.dica}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onFechar} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
