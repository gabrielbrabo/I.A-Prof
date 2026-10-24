import { gravarPref } from "../lib/prefs";
import { Divisao, divisaoDaUf } from "../lib/divisao";

// Sem plano de curso do professor: mostra a divisao do ano em uso (vinda da UF) junto do Periodo,
// para ele conferir na hora de registrar e trocar ali mesmo (ex.: escola municipal com outra divisao).
export default function SeletorDivisao({ valor, uf, onChange }: { valor: Divisao; uf?: string | null; onChange: (d: Divisao) => void }) {
  const padrao = uf && /^[A-Z]{2}$/.test(uf) && divisaoDaUf(uf) === valor;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      Sua escola usa:
      <select
        aria-label="Divisão do ano letivo"
        value={valor}
        onChange={(e) => {
          const d = e.target.value as Divisao;
          gravarPref("divisao", d);
          onChange(d);
        }}
        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] font-semibold text-indigo-700"
      >
        <option value="bimestre">Bimestres</option>
        <option value="trimestre">Trimestres</option>
        <option value="semestre">Semestres</option>
      </select>
      {padrao ? <span>(padrão de {uf} — troque se for diferente)</span> : null}
    </p>
  );
}
