// Conexao com o D.E.V caiu (o professor ja usava o D.E.V e hoje esta desconectado):
// janela com fundo desfocado para ele NAO lancar achando que vai para o diario.
// So fecha pelos botoes (clicar fora nao fecha).
export default function AvisoDevCaiu({ onEntendi, onConectar }: { onEntendi: () => void; onConectar: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="dev-caiu-titulo">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">📒</div>
        <h2 id="dev-caiu-titulo" className="mt-3 text-lg font-bold text-slate-900">
          Sua conexão com o D.E.V caiu
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          O I.A Prof não está mais conectado ao seu diário D.E.V. <b>Enquanto você não conectar de novo, as aulas, atividades e notas que salvar aqui NÃO vão para o
          D.E.V.</b>
        </p>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Para voltar a lançar no D.E.V:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>
              Toque em <b>Conectar agora</b>
            </li>
            <li>Digite o CPF e a senha que você usa no D.E.V</li>
            <li>Pronto: o que você salvar volta a ir para o diário</li>
          </ol>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onEntendi} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
            Entendi
          </button>
          <button onClick={onConectar} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            Conectar agora
          </button>
        </div>
      </div>
    </div>
  );
}
