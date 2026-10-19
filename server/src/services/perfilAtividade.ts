import { PerfilAtividade } from "../models/PerfilAtividade";

// Aprendizado do jeito do professor: so com o que ele APROVOU — cada atividade salva e os ajustes que levaram a ela.
// Vai para a I.A como texto curto (barato) para acertar de primeira e precisar de menos ajustes.

const MAX_AJUSTES = 10;

type Salva = {
  estilo?: { fonte?: string; colorido?: boolean; caixaAlta?: boolean; layout?: string; imagem?: string; colunas?: boolean; visual?: string; enfeites?: boolean } | null;
  cabecalho?: { escola?: string; campos?: string[] } | null;
  questoes: Array<{ tipo: string; imagem?: string; figura?: { tipo?: string } }>;
};

export async function aprenderDaSalva(usuario: string, a: Salva) {
  try {
    const inc: Record<string, number> = { salvas: 1 };
    const e = a.estilo ?? {};
    const marcar = (k: string) => (inc[`contagens.${k}`] = (inc[`contagens.${k}`] ?? 0) + 1);
    if (e.fonte) marcar(`fonte:${e.fonte}`);
    if (e.layout) marcar(`layout:${e.layout}`);
    if (e.imagem) marcar(`imagem:${e.imagem}`);
    marcar(`colorido:${!!e.colorido}`);
    marcar(`caixaAlta:${!!e.caixaAlta}`);
    marcar(`colunas:${!!e.colunas}`);
    if (e.visual) marcar(`visual:${e.visual}`);
    marcar(`enfeites:${!!e.enfeites}`);
    const comImagem = a.questoes.filter((q) => q.imagem || (q.figura?.tipo ?? "") !== "").length;
    marcar(`imagens:${comImagem >= a.questoes.length / 2 ? "sim" : "nao"}`);
    for (const q of a.questoes) marcar(`tipo:${q.tipo}`);
    const atual = await PerfilAtividade.findOne({ usuario }).lean();
    const n = (atual?.salvas ?? 0) + 1;
    const media = ((atual?.mediaQuestoes ?? 0) * (n - 1) + a.questoes.length) / n;
    await PerfilAtividade.updateOne(
      { usuario },
      {
        $inc: inc,
        $set: {
          mediaQuestoes: Math.round(media * 10) / 10,
          ...(a.cabecalho?.campos?.length ? { camposCabecalho: a.cabecalho.campos } : {}),
          ...(a.cabecalho?.escola ? { escola: a.cabecalho.escola } : {}),
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("[perfilAtividade]", e instanceof Error ? e.message : e); // aprendizado nunca atrapalha salvar
  }
}

// So aprende ajustes de JEITO (visual, tamanho, nivel), nunca de conteudo de uma atividade (ex.: "troque a questao 5")
const AJUSTE_DE_ESTILO = /imag|figur|letra|fonte|folha|p[aá]gina|espa[cç]|colorid|cor\b|cabe[cç]alho|logo|coluna|mai[uú]scul|bast[aã]o|linha|curt|long|f[aá]cil|dif[ií]cil|simples|n[ií]vel|enunciad|layout|margem|tamanho|nota|valor/i;
const AJUSTE_PONTUAL = /quest[aã]o\s*\d|n[uú]mero\s*\d|\bq\d|troque|substitu|tire a|remova a|apague a/i;
export async function aprenderDoAjuste(usuario: string, ajuste: string) {
  const t = ajuste.trim().replace(/\s+/g, " ").slice(0, 200);
  if (t.length < 3 || !AJUSTE_DE_ESTILO.test(t) || AJUSTE_PONTUAL.test(t)) return;
  try {
    const p = await PerfilAtividade.findOne({ usuario });
    const lista = [t, ...(p?.ajustes ?? []).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_AJUSTES);
    await PerfilAtividade.updateOne({ usuario }, { $set: { ajustes: lista } }, { upsert: true });
  } catch (e) {
    console.error("[perfilAtividade]", e instanceof Error ? e.message : e);
  }
}

const NOMES: Record<string, string> = {
  "fonte:normal": "letra normal",
  "fonte:grande": "letra grande",
  "fonte:extra": "letra bem grande",
  "layout:compacto": "folha compacta (aproveita o espaço)",
  "layout:amplo": "folha espaçosa",
  "imagem:pequena": "imagens pequenas",
  "imagem:grande": "imagens grandes",
  "colorido:true": "colorida",
  "caixaAlta:true": "LETRA BASTÃO (maiúscula)",
  "colunas:true": "alternativas em 2 colunas",
  "visual:cards": "questões em quadros coloridos (estilo.visual cards)",
  "enfeites:true": "com enfeites no título (estilo.enfeites)",
  "imagens:sim": "com imagens na maioria das questões",
  "imagens:nao": "sem imagens na maioria das questões",
};
const TIPOS: Record<string, string> = { multipla: "marcar X", vf: "V ou F", discursiva: "discursivas", completar: "completar" };

// Texto das preferencias para o prompt ("" quando ainda nao ha o que dizer)
export async function preferenciasDoProfessor(usuario: string): Promise<{ texto: string; salvas: number; ajustes: number }> {
  const p = await PerfilAtividade.findOne({ usuario }).lean().catch(() => null);
  if (!p) return { texto: "", salvas: 0, ajustes: 0 };
  const c = new Map<string, number>(Object.entries((p.contagens as unknown as Record<string, number>) ?? {}));
  const linhas: string[] = [];
  if (p.salvas >= 2) {
    // escolha que aparece em pelo menos 60% das atividades salvas
    const habito = [...c.entries()].filter(([k, v]) => NOMES[k] && v / p.salvas >= 0.6).map(([k]) => NOMES[k]);
    if (habito.length) linhas.push(`- Visual que ele costuma aprovar: ${habito.join(", ")}.`);
    const tipos = [...c.entries()].filter(([k]) => k.startsWith("tipo:")).sort((a, b) => b[1] - a[1]);
    const totalTipos = tipos.reduce((s, [, v]) => s + v, 0);
    if (totalTipos) linhas.push(`- Tipos de questão que mais usa: ${tipos.slice(0, 3).map(([k, v]) => `${TIPOS[k.slice(5)] ?? k.slice(5)} (${Math.round((v / totalTipos) * 100)}%)`).join(", ")}; em média ${Math.round(p.mediaQuestoes)} questões.`);
  }
  if (p.salvas >= 1 && p.camposCabecalho?.length) linhas.push(`- Cabeçalho que ele usa: ${p.camposCabecalho.join(", ")}${p.escola ? ` — escola "${p.escola}"` : ""}.`);
  if (p.ajustes?.length) linhas.push(`- Ajustes que ele já pediu antes (já entregue assim, para ele não precisar pedir de novo): ${p.ajustes.slice(0, 8).map((a) => `"${a}"`).join("; ")}.`);
  const texto = linhas.length
    ? `Preferências de JEITO deste professor (visual e formato; aplique por padrão; o pedido de AGORA sempre vence). NUNCA reaproveite tema, texto ou questões de atividades anteriores — cada atividade é nova e segue só o pedido atual:\n${linhas.join("\n")}`
    : "";
  return { texto, salvas: p.salvas ?? 0, ajustes: p.ajustes?.length ?? 0 };
}

export async function esquecerPreferencias(usuario: string) {
  await PerfilAtividade.deleteOne({ usuario });
}
