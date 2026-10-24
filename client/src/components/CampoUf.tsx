import { UFS } from "../lib/formatarRegistro";
import { gravarPref } from "../lib/prefs";
import { divisaoDaUf, Divisao } from "../lib/divisao";

// Primeiro campo de Gerar aula e de Atividades: o estado (UF). Escolhido uma vez, fica salvo e ja vem preenchido.
// Trocar o estado volta a divisao do ano para a padrao dele (o professor pode trocar junto do Periodo).
export default function CampoUf({
  valor,
  onChange,
  className,
  rotuloClassName = "text-xs font-medium text-slate-500",
}: {
  valor: string;
  onChange: (uf: string, divisao: Divisao) => void;
  className: string;
  rotuloClassName?: string;
}) {
  return (
    <div className="min-w-0" data-tour="uf">
      <label className={rotuloClassName}>Estado</label>
      <select
        className={`${className} ${!valor ? "border-amber-400 bg-amber-50" : ""}`}
        value={valor}
        onChange={(e) => {
          const uf = e.target.value;
          const d = divisaoDaUf(uf);
          if (uf) gravarPref("uf", uf);
          gravarPref("divisao", d);
          onChange(uf, d);
        }}
      >
        <option value="">Selecione…</option>
        {UFS.map((u) => (
          <option key={u}>{u}</option>
        ))}
        <option value="BNCC">Só BNCC</option>
      </select>
    </div>
  );
}
