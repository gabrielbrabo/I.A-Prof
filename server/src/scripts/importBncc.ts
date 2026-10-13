import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { Habilidade } from "../models/Habilidade";

// Importa/atualiza todas as habilidades da BNCC (data/bncc.json)
// Uso: npm run seed:bncc
async function main() {
  await connectDb();
  const arquivo = path.resolve(__dirname, "../../data/bncc.json");
  const itens = JSON.parse(fs.readFileSync(arquivo, "utf-8")) as Array<Record<string, unknown>>;

  const ops = itens.map((h) => ({
    updateOne: { filter: { codigo: h.codigo }, update: { $set: h }, upsert: true },
  }));
  const res = await Habilidade.bulkWrite(ops);
  await Habilidade.syncIndexes();
  console.log(`[bncc] ${itens.length} habilidades (novas: ${res.upsertedCount}, atualizadas: ${res.modifiedCount})`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
