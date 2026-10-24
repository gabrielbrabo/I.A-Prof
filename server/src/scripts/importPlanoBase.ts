import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { PlanoBase } from "../models/PlanoBase";
import { lerArquivoSemIA, montarItens, Achado } from "../services/planoSemIA";
import { divisaoDaUf, QTD_PERIODOS } from "../utils/divisao";

// Importa o plano de curso OFICIAL de um estado (ex.: cadernos "Plano de Curso" da SEE-MG), um PDF por serie.
// Assim o professor que nao cadastrou o proprio plano usa as habilidades certas de cada bimestre.
//
// Uso:
//   npm run import:planobase -- --pasta data/planos-base/MG-2026 --uf MG --anoLetivo 2026 --fonte "Plano de Curso SEE-MG 2026"
//   (acrescente --conferir para so mostrar o resultado, sem gravar)
// A serie sai do nome do arquivo ("4_ANO...", "4º ano..."). Arquivos de varios componentes da mesma serie sao juntados.
function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const serieDoNome = (nome: string) => /(?:^|[^0-9])([1-9])\s*(?:º|°|o)?\s*[_\- ]*ano/i.exec(nome)?.[1] ?? null;

async function main() {
  const pasta = arg("pasta");
  const uf = arg("uf")?.toUpperCase();
  const anoLetivo = Number(arg("anoLetivo"));
  const fonte = arg("fonte") || `Plano de Curso ${uf} ${anoLetivo}`;
  const conferir = process.argv.includes("--conferir");
  // divisao do ano da rede (MG/ES/PR/RS 2026 = trimestre); --tipo bimestre|trimestre|semestre troca
  const tipo = divisaoDaUf(uf, arg("tipo"));
  if (!pasta || !uf || !anoLetivo) {
    console.error('Uso: npm run import:planobase -- --pasta <pasta com PDFs> --uf MG --anoLetivo 2026 [--fonte "..."] [--tipo trimestre] [--conferir]');
    process.exit(1);
  }
  const arquivos = fs.readdirSync(pasta).filter((f) => /\.(pdf|docx|xlsx|txt)$/i.test(f));
  // achados por serie
  const porSerie = new Map<string, Achado[]>();
  for (const f of arquivos) {
    const serie = serieDoNome(f);
    if (!serie) {
      console.warn(`! ${f}: não achei a série no nome do arquivo (ex.: "4_ANO"). Pulado.`);
      continue;
    }
    const r = await lerArquivoSemIA(f, fs.readFileSync(path.join(pasta, f)));
    if (r.semTexto) {
      console.warn(`! ${f}: PDF sem texto (escaneado?). Pulado.`);
      continue;
    }
    const semPeriodo = r.achados.filter((a) => !a.periodo).length;
    console.log(`- ${f}: série ${serie}, ${r.achados.length} habilidades lidas${semPeriodo ? `, ${semPeriodo} SEM período (não entram)` : ""}`);
    porSerie.set(serie, [...(porSerie.get(serie) ?? []), ...r.achados]);
  }

  if (!conferir) await connectDb();
  for (const [serie, achados] of [...porSerie].sort()) {
    const periodos = [];
    for (let n = 1; n <= QTD_PERIODOS[tipo]; n++) {
      const itens = (await montarItens(achados.filter((a) => a.periodo === n), uf))
        .filter((i) => i.codigo && i.habilidade)
        .map((i) => ({ componente: i.componente, codigo: i.codigo!, habilidade: i.habilidade!, conteudo: i.conteudo ?? null }));
      periodos.push({ numero: n, itens });
    }
    const resumo = periodos.map((p) => `${p.numero}º: ${p.itens.length}`).join(" · ");
    console.log(`> ${serie}º ano — ${resumo}`);
    if (conferir) continue;
    await PlanoBase.updateOne({ uf, ano: serie, anoLetivo }, { $set: { uf, ano: serie, anoLetivo, fonte, tipoPeriodo: tipo, periodos } }, { upsert: true });
  }
  if (!conferir) await mongoose.disconnect();
  console.log(conferir ? "Conferência pronta (nada gravado)." : "Importado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
