import { useRef } from "react";
import {
  Atividade,
  ajustarValores,
  CAMPOS_CABECALHO,
  cabecalhoPadrao,
  estiloPadrao,
  fmtNum,
  ImagemAtividade,
  imagemParaDataUrl,
  letra,
  Questao,
  somaValores,
  svgParaSrc,
  TIPOS_QUESTAO,
  TipoQuestao,
} from "../../api/atividades";

// Escolhe uma imagem do computador e devolve ja reduzida
export async function escolherImagens(arquivos: FileList | null, existentes: ImagemAtividade[]): Promise<ImagemAtividade[]> {
  const novas: ImagemAtividade[] = [];
  for (const f of Array.from(arquivos ?? []).filter((x) => x.type.startsWith("image/")).slice(0, 10 - existentes.length)) {
    try {
      const dataUrl = await imagemParaDataUrl(f);
      const usados = new Set([...existentes, ...novas].map((i) => i.id));
      let n = existentes.length + novas.length + 1;
      while (usados.has(`img${n}`)) n++;
      novas.push({ id: `img${n}`, nome: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || `imagem ${n}`, dataUrl });
    } catch {
      /* arquivo invalido: ignora */
    }
  }
  return novas;
}

const campo =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const questaoVazia = (tipo: TipoQuestao = "multipla"): Questao => ({
  tipo,
  enunciado: "",
  alternativas: tipo === "multipla" ? ["", "", "", ""] : [],
  itens: tipo === "vf" ? [{ texto: "", resposta: "V" }, { texto: "", resposta: "F" }, { texto: "", resposta: "V" }] : [],
  resposta: "",
  criterios: "",
  valor: 1,
});

// Problemas que impedem aprovar (gabarito incompleto)
export function problemasGabarito(qs: Questao[]): string[] {
  const p: string[] = [];
  qs.forEach((q, i) => {
    const n = i + 1;
    if (!q.enunciado.trim() && q.tipo !== "vf") p.push(`Questão ${n}: falta o enunciado.`);
    if (q.tipo === "multipla") {
      if (q.alternativas.filter((a) => a.trim()).length < 2) p.push(`Questão ${n}: coloque pelo menos 2 alternativas.`);
      if (!q.resposta || !q.alternativas[q.resposta.charCodeAt(0) - 65]?.trim()) p.push(`Questão ${n}: marque a alternativa correta.`);
    }
    if (q.tipo === "vf" && !q.itens.some((it) => it.texto.trim())) p.push(`Questão ${n}: escreva as afirmações de V ou F.`);
    if ((q.tipo === "discursiva" || q.tipo === "completar") && !q.resposta.trim()) p.push(`Questão ${n}: escreva a resposta esperada (gabarito).`);
    if (!(q.valor > 0)) p.push(`Questão ${n}: dê um valor maior que zero.`);
  });
  return p;
}

// Editor da atividade e do gabarito: o professor ajusta questoes, respostas e o valor de cada uma
export default function EditorAtividade({ valor, onChange }: { valor: Atividade; onChange: (a: Atividade) => void }) {
  const entradaLogo = useRef<HTMLInputElement>(null);
  const entradaQuestao = useRef<HTMLInputElement>(null);
  const questaoImagem = useRef<number | null>(null);
  const a = valor;
  const set = (x: Partial<Atividade>) => onChange({ ...a, ...x });
  const setQ = (i: number, x: Partial<Questao>) => set({ questoes: a.questoes.map((q, j) => (j === i ? { ...q, ...x } : q)) });
  const mover = (i: number, d: number) => {
    const l = [...a.questoes];
    const [q] = l.splice(i, 1);
    l.splice(i + d, 0, q);
    set({ questoes: l });
  };
  const soma = somaValores(a.questoes);
  const imagens = a.imagens ?? [];
  const cab = a.cabecalho ?? cabecalhoPadrao();
  const estilo = a.estilo ?? estiloPadrao();
  const imagemPorId = (id?: string) => imagens.find((i) => i.id === id);
  async function adicionarImagem(arquivos: FileList | null, destino: "logo" | number) {
    const novas = await escolherImagens(arquivos, imagens);
    if (!novas.length) return;
    const lista = [...imagens, ...novas];
    if (destino === "logo") onChange({ ...a, imagens: lista, cabecalho: { ...cab, logo: novas[0].id } });
    else onChange({ ...a, imagens: lista, questoes: a.questoes.map((q, j) => (j === destino ? { ...q, imagem: novas[0].id } : q)) });
  }
  const bate = Math.abs(soma - a.valorTotal) < 0.01;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="text-xs font-medium text-slate-500">
          Título
          <input className={`${campo} mt-1`} value={a.titulo} onChange={(e) => set({ titulo: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Valor total
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={`${campo} mt-1`}
            value={a.valorTotal}
            onChange={(e) => set({ valorTotal: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-500">
        Instruções para o aluno
        <input className={`${campo} mt-1`} value={a.instrucoes} onChange={(e) => set({ instrucoes: e.target.value })} />
      </label>

      {/* Cabecalho e aparencia da folha */}
      <details className="rounded-xl border border-slate-200 bg-white p-3" open={!!(cab.logo || cab.escola)}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">🏫 Cabeçalho e aparência da folha</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-1">
            {imagemPorId(cab.logo) ? (
              <img src={imagemPorId(cab.logo)!.dataUrl} alt="Logo" className="h-16 w-16 rounded-lg object-contain ring-1 ring-slate-200" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-[10px] text-slate-400">sem logo</div>
            )}
            <input ref={entradaLogo} type="file" accept="image/*" className="hidden" onChange={(e) => (adicionarImagem(e.target.files, "logo"), (e.target.value = ""))} />
            <button type="button" onClick={() => entradaLogo.current?.click()} className="text-[11px] font-medium text-indigo-600 hover:underline">
              {cab.logo ? "trocar logo" : "+ logo da escola"}
            </button>
            {cab.logo && (
              <button type="button" onClick={() => set({ cabecalho: { ...cab, logo: "" } })} className="text-[11px] text-rose-500 hover:underline">
                tirar logo
              </button>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">
              Nome da escola
              <input className={`${campo} mt-1`} value={cab.escola} placeholder="(em branco: linha para escrever)" onChange={(e) => set({ cabecalho: { ...cab, escola: e.target.value } })} />
            </label>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-500">Mostrar:</span>
              {CAMPOS_CABECALHO.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="accent-indigo-600"
                    checked={cab.campos.includes(c.id)}
                    onChange={(e) => set({ cabecalho: { ...cab, campos: e.target.checked ? [...cab.campos, c.id] : cab.campos.filter((x) => x !== c.id) } })}
                  />
                  {c.nome}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="font-medium text-slate-500">Letra:</span>
              {(["normal", "grande", "extra"] as const).map((f) => (
                <label key={f} className="flex items-center gap-1">
                  <input type="radio" name="fonte" className="accent-indigo-600" checked={estilo.fonte === f} onChange={() => set({ estilo: { ...estilo, fonte: f } })} />
                  {f === "normal" ? "Normal" : f === "grande" ? "Grande" : "Bem grande"}
                </label>
              ))}
              <label className="flex items-center gap-1">
                <input type="checkbox" className="accent-indigo-600" checked={estilo.colorido} onChange={(e) => set({ estilo: { ...estilo, colorido: e.target.checked } })} />
                Colorida
              </label>
              <span className="ml-1 font-medium text-slate-500">Folha:</span>
              <select
                value={estilo.layout ?? "normal"}
                onChange={(e) => set({ estilo: { ...estilo, layout: e.target.value as "compacto" | "normal" | "amplo" } })}
                className="rounded border border-slate-300 px-1 py-0.5"
                aria-label="Aproveitamento da folha"
              >
                <option value="compacto">Compacta (economiza papel)</option>
                <option value="normal">Normal</option>
                <option value="amplo">Espaçosa</option>
              </select>
              <span className="font-medium text-slate-500">Imagens:</span>
              <select
                value={estilo.imagem ?? "media"}
                onChange={(e) => set({ estilo: { ...estilo, imagem: e.target.value as "pequena" | "media" | "grande" } })}
                className="rounded border border-slate-300 px-1 py-0.5"
                aria-label="Tamanho das imagens"
              >
                <option value="pequena">Pequenas</option>
                <option value="media">Médias</option>
                <option value="grande">Grandes</option>
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" className="accent-indigo-600" checked={!!estilo.colunas} onChange={(e) => set({ estilo: { ...estilo, colunas: e.target.checked } })} />
                Alternativas em 2 colunas
              </label>
              <label className="flex items-center gap-1" title="Tudo em letra maiúscula, para quem está aprendendo a ler">
                <input type="checkbox" className="accent-indigo-600" checked={!!estilo.caixaAlta} onChange={(e) => set({ estilo: { ...estilo, caixaAlta: e.target.checked } })} />
                LETRA BASTÃO
              </label>
            </div>
          </div>
        </div>
      </details>
      <input
        ref={entradaQuestao}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (questaoImagem.current != null) adicionarImagem(e.target.files, questaoImagem.current);
          e.target.value = "";
        }}
      />

      {/* Texto de apoio (leitura e interpretacao) */}
      {(a.texto?.conteudo || a.texto?.titulo) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">📖 Texto para leitura</p>
            <button type="button" onClick={() => set({ texto: { titulo: "", conteudo: "", imagem: "" } })} className="text-xs text-rose-500 hover:underline">
              tirar texto
            </button>
          </div>
          <input
            className={campo}
            value={a.texto?.titulo ?? ""}
            placeholder="Título do texto"
            onChange={(e) => set({ texto: { titulo: e.target.value, conteudo: a.texto?.conteudo ?? "", imagem: a.texto?.imagem ?? "" } })}
          />
          <textarea
            rows={Math.min(14, Math.max(4, Math.ceil((a.texto?.conteudo.length ?? 0) / 90)))}
            className={`${campo} mt-2`}
            value={a.texto?.conteudo ?? ""}
            onChange={(e) => set({ texto: { titulo: a.texto?.titulo ?? "", conteudo: e.target.value, imagem: a.texto?.imagem ?? "" } })}
          />
          {imagemPorId(a.texto?.imagem) && (
            <span className="relative mt-2 inline-block">
              <img src={imagemPorId(a.texto?.imagem)!.dataUrl} alt="Ilustração do texto" className="h-24 rounded-lg object-contain ring-1 ring-slate-200" />
              <button
                type="button"
                onClick={() => set({ texto: { ...(a.texto ?? { titulo: "", conteudo: "" }), imagem: "" } })}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                aria-label="Tirar ilustração do texto"
              >
                ×
              </button>
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => set({ texto: { titulo: "Texto", conteudo: " ", imagem: "" } })}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          + texto para leitura (antes das questões)
        </button>
      )}

      {a.habilidades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.habilidades.map((h) => (
            <span key={h.codigo} title={h.habilidade} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200">
              {h.codigo}
            </span>
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {a.questoes.map((q, i) => (
          <li key={q._id ?? i} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-tour={i === 0 ? "ativ-questao" : undefined}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <select
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:flex-none"
                value={q.tipo}
                onChange={(e) => {
                  const nova = questaoVazia(e.target.value as TipoQuestao);
                  setQ(i, { ...nova, enunciado: q.enunciado, valor: q.valor });
                }}
                aria-label="Tipo da questão"
              >
                {(Object.keys(TIPOS_QUESTAO) as TipoQuestao[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_QUESTAO[t]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500" data-tour={i === 0 ? "ativ-valor-q" : undefined}>
                Valor
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={q.valor}
                  onChange={(e) => setQ(i, { valor: Number(e.target.value) || 0 })}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Subir">
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === a.questoes.length - 1}
                  onClick={() => mover(i, 1)}
                  className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  aria-label="Descer"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => set({ questoes: a.questoes.filter((_, j) => j !== i) })}
                  className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50"
                  aria-label="Remover questão"
                >
                  🗑
                </button>
              </span>
            </div>
            <textarea
              rows={2}
              className={campo}
              placeholder={q.tipo === "vf" ? "Ex.: Marque V para verdadeiro e F para falso." : "Enunciado da questão"}
              value={q.enunciado}
              onChange={(e) => setQ(i, { enunciado: e.target.value })}
            />

            {q.tipo === "multipla" && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-slate-500" data-tour="ativ-gabarito">Marque a alternativa correta (gabarito):</p>
                {q.alternativas.map((alt, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQ(i, { resposta: letra(j) })}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        q.resposta === letra(j) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      aria-label={`Alternativa ${letra(j)} correta`}
                      aria-pressed={q.resposta === letra(j)}
                    >
                      {letra(j)}
                    </button>
                    <input
                      className={campo}
                      value={alt}
                      onChange={(e) => setQ(i, { alternativas: q.alternativas.map((x, k) => (k === j ? e.target.value : x)) })}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const alts = q.alternativas.filter((_, k) => k !== j);
                        const idx = q.resposta ? q.resposta.charCodeAt(0) - 65 : -1;
                        setQ(i, { alternativas: alts, resposta: idx === j ? "" : idx > j ? letra(idx - 1) : q.resposta });
                      }}
                      className="px-1 text-slate-400 hover:text-rose-500"
                      aria-label="Remover alternativa"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {q.alternativas.length < 6 && (
                  <button type="button" onClick={() => setQ(i, { alternativas: [...q.alternativas, ""] })} className="text-xs font-medium text-indigo-600 hover:underline">
                    + alternativa
                  </button>
                )}
              </div>
            )}

            {q.tipo === "vf" && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-slate-500">Afirmações e o gabarito (V ou F). O valor é dividido entre as afirmações.</p>
                {q.itens.map((it, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-300">
                      {(["V", "F"] as const).map((vf) => (
                        <button
                          key={vf}
                          type="button"
                          onClick={() => setQ(i, { itens: q.itens.map((x, k) => (k === j ? { ...x, resposta: vf } : x)) })}
                          className={`w-8 py-1.5 text-sm font-bold ${it.resposta === vf ? (vf === "V" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-white text-slate-500"}`}
                          aria-pressed={it.resposta === vf}
                        >
                          {vf}
                        </button>
                      ))}
                    </div>
                    <input className={campo} value={it.texto} onChange={(e) => setQ(i, { itens: q.itens.map((x, k) => (k === j ? { ...x, texto: e.target.value } : x)) })} />
                    <button
                      type="button"
                      onClick={() => setQ(i, { itens: q.itens.filter((_, k) => k !== j) })}
                      className="px-1 text-slate-400 hover:text-rose-500"
                      aria-label="Remover afirmação"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {q.itens.length < 10 && (
                  <button type="button" onClick={() => setQ(i, { itens: [...q.itens, { texto: "", resposta: "V" }] })} className="text-xs font-medium text-indigo-600 hover:underline">
                    + afirmação
                  </button>
                )}
              </div>
            )}

            {(q.tipo === "discursiva" || q.tipo === "completar") && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                <label className="text-[11px] font-medium text-emerald-700">
                  {q.tipo === "discursiva" ? "Resposta esperada (gabarito)" : "Respostas esperadas, na ordem (gabarito)"}
                  <textarea rows={2} className={`${campo} mt-0.5 border-emerald-300 bg-emerald-50/40`} value={q.resposta} onChange={(e) => setQ(i, { resposta: e.target.value })} />
                </label>
                <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  Linhas para o aluno responder:
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={q.linhas ?? 0}
                    onChange={(e) => setQ(i, { linhas: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })}
                    className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
                  />
                  <span className="font-normal text-slate-400">(0 = automático)</span>
                </label>
                {q.tipo === "discursiva" && (
                  <label className="text-[11px] font-medium text-slate-500">
                    Critérios de correção (o que vale nota inteira / metade)
                    <textarea rows={2} className={`${campo} mt-0.5`} value={q.criterios} onChange={(e) => setQ(i, { criterios: e.target.value })} />
                  </label>
                )}
              </div>
            )}

            {/* Imagem do professor / figura da I.A */}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              {imagemPorId(q.imagem) && (
                <span className="relative">
                  <img src={imagemPorId(q.imagem)!.dataUrl} alt="Imagem da questão" className="h-16 max-w-[8rem] rounded-lg object-contain ring-1 ring-slate-200" />
                  <button
                    type="button"
                    onClick={() => setQ(i, { imagem: "" })}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                    aria-label="Tirar imagem"
                  >
                    ×
                  </button>
                </span>
              )}
              {q.figura?.tipo && (
                <span className="relative flex items-center rounded-lg bg-amber-50 px-2 py-1 ring-1 ring-amber-200" title="Figura feita pela I.A">
                  {q.figura.tipo === "emoji" ? (
                    <span className="text-2xl leading-none">{q.figura.conteudo}</span>
                  ) : (
                    <img src={svgParaSrc(q.figura.conteudo)} alt="Figura" className="h-14 w-auto" />
                  )}
                  <button
                    type="button"
                    onClick={() => setQ(i, { figura: { tipo: "", conteudo: "" } })}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                    aria-label="Tirar figura"
                  >
                    ×
                  </button>
                </span>
              )}
              {imagens.length > 0 && (
                <select
                  value={q.imagem ?? ""}
                  onChange={(e) => setQ(i, { imagem: e.target.value })}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  aria-label="Imagem da questão"
                >
                  <option value="">Sem imagem minha</option>
                  {imagens.map((im) => (
                    <option key={im.id} value={im.id}>
                      🖼️ {im.nome}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  questaoImagem.current = i;
                  entradaQuestao.current?.click();
                }}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                + imagem do computador
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => set({ questoes: [...a.questoes, questaoVazia()] })}
          className="rounded-lg border border-dashed border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
        >
          + Adicionar questão
        </button>
        <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${bate ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          <span>
            Soma das questões: <b>{fmtNum(soma)}</b> de {fmtNum(a.valorTotal)}
          </span>
          {!bate && (
            <button type="button" onClick={() => set({ questoes: ajustarValores(a.questoes, a.valorTotal) })} className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700">
              Ajustar para somar {fmtNum(a.valorTotal)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
