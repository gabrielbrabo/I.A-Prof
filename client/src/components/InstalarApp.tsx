import { useInstalarApp } from "../lib/useInstalarApp";

// So no celular: variante "cartao" (tela de login/cadastro, some no computador) e "menu".
// variante "topo": botao compacto no cabecalho do app
// variante "menu": item do menu hamburguer (celular)
export default function InstalarApp({ variante, onClique }: { variante: "cartao" | "topo" | "menu"; onClique?: () => void }) {
  const { disponivel, instalar, mostrarIos, fecharIos } = useInstalarApp();
  if (!disponivel) return null;

  return (
    <>
      {variante === "cartao" ? (
        <button
          type="button"
          onClick={instalar}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100 md:hidden"
        >
          <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-indigo-900">Instalar o app I.A Prof</span>
            <span className="block text-xs text-indigo-800">Abra direto da tela inicial, como um aplicativo.</span>
          </span>
          <span className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Instalar</span>
        </button>
      ) : variante === "menu" ? (
        <button
          type="button"
          onClick={() => {
            onClique?.();
            instalar();
          }}
          data-tour="instalar"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <span className="text-base">📲</span>
          <span className="flex-1">Instalar app</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={instalar}
          title="Instalar o I.A Prof como aplicativo"
          aria-label="Instalar app"
          className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 md:px-3"
        >
          📲<span className="hidden lg:inline"> Instalar app</span>
        </button>
      )}

      {mostrarIos && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" onClick={fecharIos}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
              <p className="text-base font-semibold text-slate-800">Instalar no iPhone / iPad</p>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Abra este site no <b>Safari</b>.
              </li>
              <li>
                Toque em <b>Compartilhar</b> <span aria-hidden>(⬆️ o quadrado com a seta)</span>.
              </li>
              <li>
                Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.
              </li>
            </ol>
            <button onClick={fecharIos} className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
