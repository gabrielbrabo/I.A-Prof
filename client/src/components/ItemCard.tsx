import { useState } from "react";
import { HabilidadeItem, ItemRegistro, Opcao } from "../api/registroAula";

interface Props {
  item: ItemRegistro;
  ano: string;
  uf: string | null;
  habilidadesPeriodo: Array<Opcao & { componente: string }>; // todas do plano do periodo escolhido
  habilidadesOutros?: Array<Opcao & { componente: string; periodo: number }>; // outros periodos: so escolha manual
  nomePeriodo?: string; // "trimestre", "bimestre"...
  onChange: (item: ItemRegistro) => void;
  onRemove: () => void;
}

const MAX_HABILIDADES = 5;

const sem = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Card de um componente da aula: professor ajusta o conteudo e as habilidades (1 a 5, do plano do periodo)
export default function ItemCard({ item, habilidadesPeriodo, habilidadesOutros = [], nomePeriodo = "período", onChange, onRemove }: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Opcao[] | null>(null);
  const [verOutros, setVerOutros] = useState(false); // mostrar habilidades de outros periodos (escolha manual)
  const periodoDe = (codigo: string) => habilidadesOutros.find((x) => x.codigo === codigo)?.periodo;
  // Outros periodos, do mesmo componente primeiro
  const outrosDoComponente = habilidadesOutros
    .filter((h) => !item.habilidades.some((x) => x.codigo === h.codigo))
    .sort((a, b) => Number(b.componente === item.componente) - Number(a.componente === item.componente) || a.periodo - b.periodo);

  const escolhidos = new Set(item.habilidades.map((h) => h.codigo));
  const opcoes = (resultados ?? item.candidatas).filter((o) => !escolhidos.has(o.codigo));
  const cheio = item.habilidades.length >= MAX_HABILIDADES;
  // Palpite da I.A (texto generico): o card pisca ate o professor conferir
  const palpite = item.confianca === "baixa" && item.habilidades.length > 0;

  // Qualquer edicao das habilidades exige confirmar de novo: o card volta a piscar com o botao de confirmar
  // e so fica concluido depois do clique.
  function atualizar(habilidades: HabilidadeItem[]) {
    onChange({
      ...item,
      habilidades,
      revisar: !habilidades.length,
      confianca: habilidades.length ? "baixa" : item.confianca,
      alterada: habilidades.length > 0,
    });
  }

  function adicionar(codigo: string) {
    if (!codigo || cheio || escolhidos.has(codigo)) return;
    const op = [...(resultados ?? []), ...item.candidatas, ...habilidadesOutros].find((o) => o.codigo === codigo);
    if (!op) return;
    atualizar([...item.habilidades, { codigo: op.codigo, habilidade: op.habilidade, fonte: op.fonte }]);
  }

  function remover(codigo: string) {
    atualizar(item.habilidades.filter((h) => h.codigo !== codigo));
  }

  // Busca entre as habilidades do plano do periodo (e dos outros periodos, se o professor marcar)
  function buscar() {
    const termos = sem(busca).split(/\s+/).filter(Boolean);
    const achadas = [...habilidadesPeriodo, ...(verOutros ? habilidadesOutros : [])]
      .filter((h) => termos.every((t) => sem(`${h.codigo} ${h.habilidade} ${h.componente}`).includes(t)))
      .sort((a, b) => Number(b.componente === item.componente) - Number(a.componente === item.componente));
    setResultados(achadas.map(({ codigo, habilidade, fonte }) => ({ codigo, habilidade, fonte })));
  }

  return (
    <div
      className={`min-w-0 rounded-xl border-2 bg-white p-3 shadow-sm sm:p-4 ${
        palpite ? "border-amber-400 motion-safe:animate-alerta" : item.revisar ? "border-amber-400" : "border-slate-200"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase text-indigo-700">{item.componente}</span>
          {item.confianca === "memoria" && !item.alterada && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">igual ao seu registro anterior</span>
          )}
          {palpite && (
            <span className="rounded-full bg-amber-100 whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {item.alterada ? "alterada — confirme" : "palpite — confira"}
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {palpite && (
            <button
              onClick={() => onChange({ ...item, confianca: "alta", alterada: false })}
              className="whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
              title="Marcar as habilidades como conferidas"
            >
              {item.alterada ? "✓ Confirmar" : "✓ Conferi"}
            </button>
          )}
          <button onClick={onRemove} className="text-xs text-slate-400 hover:text-rose-600">
            remover
          </button>
        </span>
      </div>

      <label className="block text-xs font-medium text-slate-500">Conteúdo</label>
      <input
        value={item.conteudo}
        onChange={(e) => onChange({ ...item, conteudo: e.target.value })}
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />

      <label className="block text-xs font-medium text-slate-500">
        Habilidades ({item.habilidades.length}/{MAX_HABILIDADES})
      </label>
      {item.habilidades.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {item.habilidades.map((h) => {
            // Habilidade que nao esta no plano do periodo (ex.: aula antiga aberta pelo Historico): nao pode ser salva
            const outro = periodoDe(h.codigo); // escolhida a mao de outro periodo do plano
            const fora = habilidadesPeriodo.length > 0 && !outro && !habilidadesPeriodo.some((x) => x.codigo === h.codigo);
            return (
            <li key={h.codigo} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs ${fora ? "bg-rose-50 ring-1 ring-rose-300" : "bg-slate-50"}`}>
              <span className="shrink-0 font-mono font-semibold text-slate-700">{h.codigo}</span>
              <span className="flex-1 leading-relaxed text-slate-600">
                {h.habilidade}
                {h.fonte === "RECOMPOSIÇÃO" && <span className="ml-1 text-violet-700">(recomposição)</span>}
                {outro && <span className="ml-1 font-medium text-indigo-700">— do {outro}º {nomePeriodo} (escolhida por você)</span>}
                {fora && <span className="ml-1 font-semibold text-rose-700">— não está no plano de curso: troque ou remova</span>}
              </span>
              <button onClick={() => remover(h.codigo)} className="shrink-0 text-slate-400 hover:text-rose-600" title="Tirar">
                ✕
              </button>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-amber-700">
          Nenhuma habilidade do plano deste período corresponde a esse conteúdo. Adicione uma abaixo ou deixe sem habilidade.
        </p>
      )}

      <select
        value=""
        disabled={cheio || !opcoes.length}
        onChange={(e) => adicionar(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">{cheio ? `Máximo de ${MAX_HABILIDADES} habilidades` : resultados ? `+ Adicionar (${opcoes.length} encontradas)` : "+ Adicionar habilidade do plano"}</option>
        {opcoes.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.codigo} {periodoDe(o.codigo) ? `[${periodoDe(o.codigo)}º ${nomePeriodo}]` : ""} {o.fonte === "RECOMPOSIÇÃO" ? "[recomposição]" : ""} — {o.habilidade.slice(0, 110)}
            {o.habilidade.length > 110 ? "…" : ""}
          </option>
        ))}
      </select>

      <div className="mt-2 flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder={verOutros ? "Buscar no plano do ano todo (ex.: ideia central)" : "Buscar no plano do período (ex.: ideia central)"}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
        />
        <button onClick={buscar} className="rounded-lg bg-slate-100 px-3 text-xs font-medium text-slate-700 hover:bg-slate-200">
          Buscar
        </button>
      </div>

      {/* Outros periodos: so escolha manual do professor (a I.A usa apenas o periodo da aula) */}
      {habilidadesOutros.length > 0 && (
        <div className="mt-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100">
            <input
              type="checkbox"
              className="accent-orange-500"
              checked={verOutros}
              onChange={(e) => {
                setVerOutros(e.target.checked);
                setResultados(null);
              }}
            />
            Escolher habilidade de outro {nomePeriodo} (manual)
          </label>
          {verOutros && (
            <select
              value=""
              disabled={cheio || !outrosDoComponente.length}
              onChange={(e) => adicionar(e.target.value)}
              className="mt-1 w-full rounded-lg border border-orange-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="">{cheio ? `Máximo de ${MAX_HABILIDADES} habilidades` : `+ Adicionar de outro ${nomePeriodo}`}</option>
              {[...new Set(outrosDoComponente.map((h) => h.periodo))].sort().map((n) => (
                <optgroup key={n} label={`${n}º ${nomePeriodo}`}>
                  {outrosDoComponente
                    .filter((h) => h.periodo === n)
                    .map((o) => (
                      <option key={o.codigo} value={o.codigo}>
                        {o.codigo} {o.componente !== item.componente ? `(${o.componente})` : ""} — {o.habilidade.slice(0, 100)}
                        {o.habilidade.length > 100 ? "…" : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
