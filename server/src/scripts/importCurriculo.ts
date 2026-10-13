import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { Habilidade } from "../models/Habilidade";
import { parseCsv, expandirAnos } from "../utils/csv";

// Importa habilidades de um curriculo estadual/municipal a partir de um CSV.
// Colunas obrigatorias: codigo; componente; anos; habilidade
// Opcionais: unidade_tematica; objeto_conhecimento; etapa
// Uso: npm run import:curriculo -- --arquivo data/curriculos/MG.csv --uf MG --fonte CRMG
function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const arquivo = arg("arquivo");
  const uf = arg("uf")?.toUpperCase();
  const fonte = arg("fonte") || (uf ? `CURRICULO-${uf}` : undefined);
  if (!arquivo || !uf || !fonte) {
    console.error("Uso: npm run import:curriculo -- --arquivo <csv> --uf <UF> [--fonte <nome>]");
    process.exit(1);
  }

  const linhas = parseCsv(fs.readFileSync(path.resolve(arquivo), "utf-8"));
  const validas = linhas.filter((l) => l.codigo && l.componente && l.anos && l.habilidade);
  const ignoradas = linhas.length - validas.length;

  await connectDb();
  const ops = validas.map((l) => ({
    updateOne: {
      filter: { codigo: l.codigo.toUpperCase() },
      update: {
        $set: {
          codigo: l.codigo.toUpperCase(),
          fonte,
          uf,
          etapa: l.etapa || null,
          anos: expandirAnos(l.anos),
          componente: l.componente,
          habilidade: l.habilidade.replace(/\s+/g, " "),
          unidadeTematica: l.unidade_tematica || null,
          objetoConhecimento: l.objeto_conhecimento || null,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await Habilidade.bulkWrite(ops);
  console.log(`[curriculo ${fonte}] importadas: ${validas.length}, ignoradas (faltando coluna): ${ignoradas}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
