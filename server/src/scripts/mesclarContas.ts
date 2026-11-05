import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { Usuario } from "../models/Usuario";
import { Assinatura } from "../models/Assinatura";
import { Atividade } from "../models/Atividade";
import { CompraCredito } from "../models/CompraCredito";
import { Correcao } from "../models/Correcao";
import { EnvioPlano } from "../models/EnvioPlano";
import { PerfilAtividade } from "../models/PerfilAtividade";
import { PlanoCurso } from "../models/PlanoCurso";
import { RegistroAula } from "../models/RegistroAula";
import { Turma } from "../models/Turma";
import { UsoMensal } from "../models/UsoMensal";

// Junta duas contas do MESMO professor (ex.: criou outra conta com outro e-mail).
// Tudo da conta ANTIGA passa para a NOVA: aulas, atividades, correcoes, planos, turmas, consumo de I.A,
// creditos e o teste gratis continua de onde parou (aulas/atividades usadas e os dias que faltam — NAO reinicia).
// As DUAS contas continuam funcionando como UMA: entrar com o e-mail antigo (e a senha dele) abre a conta nova.
// (use --apagarAntiga para apagar a conta antiga em vez de ligar)
//
// Uso:
//   npm run mesclar:contas -- --de antigo@email.com --para novo@email.com --conferir   (so mostra, nao muda nada)
//   npm run mesclar:contas -- --de antigo@email.com --para novo@email.com
function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

async function main() {
  const de = arg("de")?.trim().toLowerCase();
  const para = arg("para")?.trim().toLowerCase();
  const conferir = process.argv.includes("--conferir");
  const apagarAntiga = process.argv.includes("--apagarAntiga");
  if (!de || !para || de === para) {
    console.error("Uso: npm run mesclar:contas -- --de <email da conta antiga> --para <email da conta nova> [--conferir] [--apagarAntiga]");
    process.exit(1);
  }
  await connectDb();
  const antiga = await Usuario.findOne({ email: de });
  const nova = await Usuario.findOne({ email: para });
  if (!antiga) throw new Error(`Conta antiga não encontrada: ${de}`);
  if (!nova) throw new Error(`Conta nova não encontrada: ${para}`);
  const A = antiga._id;
  const N = nova._id;
  if (nova.contaPrincipal) throw new Error(`A conta ${para} já está ligada a outra conta. Use como --para a conta principal.`);

  const criadaAntiga = (antiga as unknown as { createdAt: Date }).createdAt;
  const criadaNova = (nova as unknown as { createdAt: Date }).createdAt;
  // teste gratis: soma o que as duas usaram e fica com o prazo MAIS CEDO (o da conta antiga) — nao ganha dias novos
  const testeAulas = (antiga.testeAulas ?? 0) + (nova.testeAulas ?? 0);
  const testeAtividades = (antiga.testeAtividades ?? 0) + (nova.testeAtividades ?? 0);
  const testeAte = new Date(Math.min(new Date(antiga.testeAte).getTime(), new Date(nova.testeAte).getTime()));
  const criadoEm = new Date(Math.min(new Date(criadaAntiga).getTime(), new Date(criadaNova).getTime()));

  const contar = async () => ({
    aulas: await RegistroAula.countDocuments({ usuario: A }),
    atividades: await Atividade.countDocuments({ usuario: A }),
    correcoes: await Correcao.countDocuments({ usuario: A }),
    planos: await PlanoCurso.countDocuments({ usuario: A }),
    turmas: await Turma.countDocuments({ usuario: A }),
  });
  const [assA, assN] = await Promise.all([Assinatura.findOne({ usuario: A }).lean(), Assinatura.findOne({ usuario: N }).lean()]);

  console.log(`Antiga: ${antiga.nome} <${de}> — criada em ${fmt(criadaAntiga)}, teste: ${antiga.testeAulas ?? 0} aulas, ${antiga.testeAtividades ?? 0} atividades, até ${fmt(antiga.testeAte)}`);
  console.log(`Nova:   ${nova.nome} <${para}> — criada em ${fmt(criadaNova)}, teste: ${nova.testeAulas ?? 0} aulas, ${nova.testeAtividades ?? 0} atividades, até ${fmt(nova.testeAte)}`);
  console.log("Vai para a nova:", await contar());
  console.log(`Teste grátis da nova fica: ${testeAulas} aulas e ${testeAtividades} atividades usadas, até ${fmt(testeAte)} (conta "criada" em ${fmt(criadoEm)})`);
  if (assA && assN) console.log("! As DUAS contas têm assinatura: a da conta nova é mantida; a da antiga NÃO é movida (cancele no Asaas se for o caso).");
  else if (assA) console.log(`Assinatura da antiga (${assA.planoId}, ${assA.status}) passa para a nova.`);
  if (antiga.diarioCpf && nova.diarioCpf && antiga.diarioCpf !== nova.diarioCpf) console.log("! As contas estão ligadas a D.E.V diferentes: fica o D.E.V da conta nova.");
  if (conferir) {
    console.log("\nConferência pronta (nada foi alterado). Rode de novo sem --conferir para mesclar.");
    await mongoose.disconnect();
    return;
  }

  // 1) dados do professor
  for (const m of [RegistroAula, Atividade, Correcao, PlanoCurso, Turma, CompraCredito, EnvioPlano] as mongoose.Model<any>[]) {
    await m.updateMany({ usuario: A }, { $set: { usuario: N } });
  }
  // 2) consumo de I.A: soma ciclos iguais (ex.: "teste"), move os outros
  for (const u of await UsoMensal.find({ usuario: A }).lean()) {
    const campos = { custoCentavos: u.custoCentavos ?? 0, chamadas: u.chamadas ?? 0, aulas: u.aulas ?? 0, atividades: u.atividades ?? 0, correcoes: u.correcoes ?? 0 };
    await UsoMensal.updateOne({ usuario: N, mes: u.mes }, { $inc: campos }, { upsert: true });
  }
  await UsoMensal.deleteMany({ usuario: A });
  // 3) perfil de atividades (o que a I.A aprendeu): fica o da antiga se a nova ainda nao tem
  if (!(await PerfilAtividade.exists({ usuario: N }))) await PerfilAtividade.updateOne({ usuario: A }, { $set: { usuario: N } });
  else await PerfilAtividade.deleteOne({ usuario: A });
  // 4) assinatura: so move se a nova nao tem
  if (assA && !assN) await Assinatura.updateOne({ usuario: A }, { $set: { usuario: N } });
  // 5) D.E.V: se so a antiga estava ligada, a ligacao passa para a nova
  const dev = !nova.diarioCpf && antiga.diarioCpf ? { diarioCpf: antiga.diarioCpf, diario: antiga.diario, diarioSaiu: false } : {};
  if (dev.diarioCpf) await Usuario.updateOne({ _id: A }, { $unset: { diarioCpf: 1 } });
  // 6) teste gratis continua de onde parou + creditos somados
  await Usuario.collection.updateOne(
    { _id: N },
    {
      $set: { testeAulas, testeAtividades, testeAte, createdAt: criadoEm, ...dev },
      $inc: { creditosCentavos: antiga.creditosCentavos ?? 0 },
    }
  );
  // 7) conta antiga: fica LIGADA a nova (entrar com ela abre a nova) — ou e apagada com --apagarAntiga
  await Usuario.updateMany({ contaPrincipal: A }, { $set: { contaPrincipal: N } }); // contas que ja eram ligadas a antiga
  if (apagarAntiga) await Usuario.deleteOne({ _id: A });
  else await Usuario.updateOne({ _id: A }, { $set: { contaPrincipal: N, creditosCentavos: 0, diario: { token: null, nome: null, escolas: [], conectadoEm: null } } });

  console.log(
    `\nPronto: tudo da conta ${de} está na conta ${para}.` +
      (apagarAntiga ? " A conta antiga foi apagada." : ` As duas continuam valendo: entrar com ${de} ou ${para} abre a mesma conta.`)
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
