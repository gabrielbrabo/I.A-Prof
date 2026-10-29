import { divisaoDaUf } from "../utils/divisao";
import { nomeAno } from "../utils/anos";

// Confere se o professor cadastrou o plano de curso no lugar certo (serie, ano letivo, periodos) — usado no painel admin.

// Series que um codigo de habilidade cobre: EF04MA01 -> 4; EF15LP01 -> 1..5; EF69LP01 -> 6..9; EI03EO01 -> EI03; EM13LP01 -> EM
export function seriesDoCodigo(codigo: string | null | undefined): string[] | null {
  const c = (codigo ?? "").toUpperCase().trim();
  let m = /^EF(\d)(\d)/.exec(c);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0) return [String(b)];
    if (a < b) return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    return null;
  }
  m = /^EI0([1-3])/.exec(c);
  if (m) return [`EI0${m[1]}`];
  if (/^EM\d/.test(c)) return ["EM"];
  return null;
}

interface PlanoConferir {
  ano: string;
  anoLetivo: number;
  uf?: string | null;
  tipoPeriodo: string;
  arquivos?: string[];
  periodos?: Array<{ numero: number; itens?: Array<{ codigo?: string | null }> }>;
}
const QTD: Record<string, number> = { bimestre: 4, trimestre: 3, semestre: 2 };
const serieDoNomeArquivo = (nome: string) => /(?:^|[^0-9])([1-9])\s*(?:º|°|o|ª)?\s*[_\- ]*ano/i.exec(nome)?.[1] ?? null;

export function conferirPlano(p: PlanoConferir, ufProfessor?: string | null): string[] {
  const alertas: string[] = [];
  const periodos = p.periodos ?? [];
  const codigos = periodos.flatMap((x) => (x.itens ?? []).map((i) => i.codigo).filter((c): c is string => !!c));
  const totalItens = periodos.reduce((t, x) => t + (x.itens?.length ?? 0), 0);

  if (!codigos.length) alertas.push(totalItens ? `Nenhuma habilidade com código (${totalItens} itens só com conteúdo): a I.A não consegue usar os códigos do plano.` : "Plano vazio: nenhuma habilidade cadastrada.");

  // codigos de outra serie: plano enviado na serie errada?
  const comSerie = codigos.map((c) => ({ c, s: seriesDoCodigo(c) })).filter((x) => x.s);
  const fora = comSerie.filter((x) => !x.s!.includes(p.ano));
  if (comSerie.length && fora.length / comSerie.length >= 0.3) {
    const cont = new Map<string, number>();
    for (const x of fora) if (x.s!.length === 1) cont.set(x.s![0], (cont.get(x.s![0]) ?? 0) + 1);
    const provavel = [...cont].sort((a, b) => b[1] - a[1])[0]?.[0];
    alertas.push(
      `${fora.length} de ${comSerie.length} habilidades são de outra série (ex.: ${fora.slice(0, 3).map((x) => x.c).join(", ")}). Cadastrado no ${nomeAno(p.ano)}${provavel ? `, mas parece ser do ${nomeAno(provavel)}` : ""}.`
    );
  }

  // periodos sem habilidades
  const qtd = QTD[p.tipoPeriodo] ?? periodos.length;
  const vazios = Array.from({ length: qtd }, (_, i) => i + 1).filter((n) => !periodos.find((x) => x.numero === n)?.itens?.some((i) => i.codigo));
  if (codigos.length && vazios.length) alertas.push(`Sem habilidades no ${vazios.map((n) => `${n}º`).join(", ").replace(/, ([^,]*)$/, " e $1")} ${p.tipoPeriodo} (enviou só parte do plano ou tudo em um período só).`);

  // ano letivo
  const anoAtual = new Date().getFullYear();
  if (p.anoLetivo !== anoAtual) alertas.push(`Plano do ano letivo ${p.anoLetivo} (o atual é ${anoAtual}).`);

  // arquivo com outra serie no nome
  const outraNoNome = (p.arquivos ?? []).filter((a) => {
    const s = serieDoNomeArquivo(a);
    return s && /^[1-9]$/.test(p.ano) && s !== p.ano;
  });
  if (outraNoNome.length) alertas.push(`Arquivo com outra série no nome: ${outraNoNome.join(", ")} (cadastrado no ${nomeAno(p.ano)}).`);

  // divisao diferente da rede estadual (so informativo)
  const uf = (p.uf || ufProfessor || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(uf) && divisaoDaUf(uf) !== p.tipoPeriodo) alertas.push(`Dividido em ${p.tipoPeriodo}s, mas a rede estadual de ${uf} usa ${divisaoDaUf(uf)}s (normal se a escola for municipal; confira).`);

  return alertas;
}

// ---------- Como o professor enviou o plano (historico de envios) ----------
export interface EnvioRegistro {
  ano: string;
  anoLetivo?: number | null;
  turma?: string | null;
  tipoPeriodo: string;
  modo: "ano" | "periodo";
  periodoEscolhido?: number | null;
  arquivos: string[];
  periodosNoDocumento: number[];
  periodosLidos: number[];
  habilidades: number;
  resultado: "ok" | "recusado";
  mensagem?: string | null;
  createdAt?: Date;
}
interface PlanoComItens {
  ano: string;
  anoLetivo: number;
  turma?: string | null;
  tipoPeriodo: string;
  arquivos?: string[];
  periodos?: Array<{ numero: number; itens?: Array<{ codigo?: string | null; origemTexto?: string | null }> }>;
}
// periodo escrito no nome do arquivo: "Plano 2º bimestre.pdf", "1 TRI", "3_trimestre"
const periodoDoNome = (nome: string) => {
  const m = /(?:^|[^0-9])([1-4])\s*(?:º|°|o|ª)?\s*[_\- ]*(bim|tri|sem)/i.exec(nome);
  return m ? Number(m[1]) : null;
};
const ord = (l: number[]) => l.map((n) => `${n}º`).join(", ").replace(/, ([^,]*)$/, " e $1");

export function comoFoiEnviado(p: PlanoComItens, envios: EnvioRegistro[]) {
  const doPlano = envios.filter((e) => e.ano === p.ano && (e.anoLetivo == null || e.anoLetivo === p.anoLetivo) && (!e.turma || !p.turma || e.turma === p.turma));
  const ok = doPlano.filter((e) => e.resultado === "ok");
  const okAno = ok.filter((e) => e.modo === "ano");
  const okPer = ok.filter((e) => e.modo === "periodo");
  const alertas: string[] = [];

  const porPeriodo = (p.periodos ?? []).map((x) => {
    const itens = (x.itens ?? []).filter((i) => i.codigo);
    const arquivos = [
      ...new Set([
        ...okPer.filter((e) => e.periodoEscolhido === x.numero).flatMap((e) => e.arquivos),
        ...okAno.filter((e) => e.periodosLidos.includes(x.numero)).flatMap((e) => e.arquivos),
      ]),
    ];
    return { numero: x.numero, habilidades: itens.length, manuais: itens.filter((i) => !i.origemTexto).length, arquivos };
  });

  let forma: string;
  if (!ok.length) {
    const temItens = porPeriodo.some((x) => x.habilidades);
    forma = !temItens ? "Nada enviado" : p.arquivos?.length ? `Enviado antes do registro de envios (arquivos: ${p.arquivos.join(", ")})` : "Digitado à mão (nenhum arquivo enviado)";
  } else if (okAno.length && !okPer.length) forma = "Um arquivo com o plano do ano todo";
  else if (okPer.length && !okAno.length) forma = `Um arquivo para cada ${p.tipoPeriodo} (enviou no ${ord([...new Set(okPer.map((e) => e.periodoEscolhido!))].sort())})`;
  else forma = "Misto: arquivo do ano todo e arquivos por período";

  // envio no periodo errado / modo errado
  for (const e of okPer) {
    const nomeDiz = e.arquivos.map(periodoDoNome).find((n) => n != null) ?? null;
    if (e.periodosNoDocumento.length >= 2) alertas.push(`"${e.arquivos.join(", ")}" tem o plano de vários períodos (${ord(e.periodosNoDocumento)}), mas foi enviado só no ${e.periodoEscolhido}º ${p.tipoPeriodo}.`);
    else if (nomeDiz && nomeDiz !== e.periodoEscolhido) alertas.push(`"${e.arquivos.join(", ")}" parece ser do ${nomeDiz}º ${p.tipoPeriodo} (pelo nome), mas foi enviado no ${e.periodoEscolhido}º.`);
    else if (!e.periodosNoDocumento.length && !nomeDiz) alertas.push(`"${e.arquivos.join(", ")}" foi enviado no ${e.periodoEscolhido}º ${p.tipoPeriodo}, mas nem o documento nem o nome dizem de qual período é: confira se é o certo.`);
  }
  for (const e of okAno) if (e.periodosLidos.length === 1) alertas.push(`"${e.arquivos.join(", ")}" foi enviado como plano do ano todo, mas só tinha o ${e.periodosLidos[0]}º ${p.tipoPeriodo}.`);
  // mesmo arquivo em dois periodos
  const porArquivo = new Map<string, Set<number>>();
  for (const e of okPer) for (const a of e.arquivos) porArquivo.set(a, (porArquivo.get(a) ?? new Set()).add(e.periodoEscolhido!));
  for (const [a, ps] of porArquivo) if (ps.size > 1) alertas.push(`O mesmo arquivo "${a}" foi enviado em ${ps.size} períodos (${ord([...ps].sort())}).`);
  // tentativas recusadas
  const recusas = doPlano.filter((e) => e.resultado === "recusado");
  if (recusas.length) alertas.push(`${recusas.length} envio(s) recusado(s): veja o histórico de envios.`);
  // habilidades digitadas a mao
  const manuais = porPeriodo.reduce((t, x) => t + x.manuais, 0);
  if (ok.length && manuais) alertas.push(`${manuais} habilidade(s) adicionada(s) à mão, além do arquivo.`);

  return { forma, porPeriodo, alertas: [...new Set(alertas)] };
}
