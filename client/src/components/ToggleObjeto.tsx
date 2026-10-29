import { useMostrarObjeto, useObjetoNoTexto } from "../lib/objetos";

// Liga/desliga o objeto de conhecimento junto das habilidades (mesma opcao de Configuracoes)
export default function ToggleObjeto({ className = "", noTexto = false }: { className?: string; noTexto?: boolean }) {
  const [mostrar, setMostrar] = useMostrarObjeto();
  const [texto, setTexto] = useObjetoNoTexto();
  const v = noTexto ? texto : mostrar;
  const set = noTexto ? setTexto : setMostrar;
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-600 ${className}`}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-600" checked={v} onChange={(e) => set(e.target.checked)} />
      {noTexto ? "Incluir objeto de conhecimento no texto do diário" : "Mostrar objeto de conhecimento"}
    </label>
  );
}
