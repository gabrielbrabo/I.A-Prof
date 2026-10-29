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
