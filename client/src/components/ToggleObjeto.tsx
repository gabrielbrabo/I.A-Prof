import { useMostrarObjeto } from "../lib/objetos";

// Liga/desliga o objeto de conhecimento junto das habilidades (mesma opcao de Configuracoes)
export default function ToggleObjeto({ className = "" }: { className?: string }) {
  const [mostrar, setMostrar] = useMostrarObjeto();
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-600 ${className}`}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-600" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
      Mostrar objeto de conhecimento
    </label>
  );
}
