// Nivel de consumo do limite de I.A de cada ferramenta (o professor ve antes de usar)
//  baixo (verde): gerar aula | medio (amarelo): correcao com foto | alto (vermelho): gerar/ajustar atividade
export type NivelConsumo = "baixo" | "medio" | "alto";

const ESTILO: Record<NivelConsumo, { cor: string; ponto: string; texto: string; dica: string }> = {
  baixo: { cor: "bg-emerald-50 text-emerald-700 ring-emerald-200", ponto: "bg-emerald-500", texto: "Consumo baixo", dica: "Usa pouco do seu limite de I.A" },
  medio: { cor: "bg-amber-50 text-amber-800 ring-amber-200", ponto: "bg-amber-500", texto: "Consumo médio", dica: "Usa uma parte média do seu limite de I.A" },
  alto: { cor: "bg-rose-50 text-rose-700 ring-rose-200", ponto: "bg-rose-500", texto: "Consumo alto", dica: "Usa bastante do seu limite de I.A (com imagens, mais ainda)" },
};

export default function SeloConsumo({ nivel, so = "selo", className = "" }: { nivel: NivelConsumo; so?: "selo" | "ponto"; className?: string }) {
  const e = ESTILO[nivel];
  if (so === "ponto") return <span title={`${e.texto}: ${e.dica}`} aria-label={e.texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${e.ponto} ${className}`} />;
  return (
    <span title={e.dica} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${e.cor} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.ponto}`} aria-hidden />
      {e.texto}
    </span>
  );
}
