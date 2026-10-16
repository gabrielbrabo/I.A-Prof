import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import * as hab from "../controllers/habilidadeController";
import * as reg from "../controllers/registroAulaController";
import * as pc from "../controllers/planoCursoController";
import * as voz from "../controllers/vozController";
import * as auth from "../controllers/authController";
import * as ass from "../controllers/assinaturaController";
import * as dia from "../controllers/diarioController";
import * as cred from "../controllers/creditoController";
import * as ativ from "../controllers/atividadeController";
import * as tur from "../controllers/turmaController";
import { proteger } from "../middleware/auth";

// Encaminha erros de handlers async para o tratador de erro do Express 4
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- Rotas publicas ----------
router.post("/auth/cadastro", h(auth.cadastro));
router.post("/auth/login", h(auth.login));
router.post("/auth/google", h(auth.entrarGoogle));
router.get("/auth/config", h(auth.configAuth));
router.get("/assinatura/planos", h(ass.planos));
router.post("/webhooks/pagamentos", h(ass.webhook));

// ---------- Daqui para baixo: precisa estar logado ----------
router.use(proteger);
router.get("/auth/eu", h(auth.eu));
router.get("/assinatura", h(ass.minha));
router.post("/assinatura", h(ass.assinar));
router.post("/assinatura/atualizar", h(ass.atualizar));
router.get("/assinatura/pix", h(ass.pix));
router.post("/assinatura/cancelar", h(ass.cancelar));
router.post("/assinatura/reativar", h(ass.reativar));

// Creditos extras de I.A (compra avulsa)
router.get("/creditos", h(cred.meus));
router.post("/creditos", h(cred.comprar));
router.get("/creditos/:id/pix", h(cred.pix));
router.post("/creditos/:id/atualizar", h(cred.atualizar));

router.get("/config", h(reg.config));

// Diario escolar (X Escolar): conectar conta, turmas e envio da aula
router.get("/diario", h(dia.status));
router.post("/diario/conectar", h(dia.conectar));
router.delete("/diario/conectar", h(dia.desconectar));
router.get("/diario/turmas", h(dia.turmas));
router.get("/diario/verificar", h(dia.verificar));
router.post("/diario/enviar", h(dia.enviar));
router.get("/diario/turmas/:id/alunos", h(dia.alunos));

// Turmas do I.A Prof (lista de alunos) — para quem nao usa o D.E.V
router.get("/turmas", h(tur.listar));
router.post("/turmas", h(tur.criar));
router.put("/turmas/:id", h(tur.atualizar));
router.delete("/turmas/:id", h(tur.remover));

// Atividades: gerar, salvar, corrigir (manual ou foto) e lancar notas
router.post("/atividades/gerar", h(ativ.gerar));
router.get("/atividades/preferencias", h(ativ.preferencias));
router.delete("/atividades/preferencias", h(ativ.esquecer));
router.get("/atividades", h(ativ.listar));
router.post("/atividades", h(ativ.salvar));
router.get("/atividades/:id", h(ativ.obter));
router.put("/atividades/:id", h(ativ.atualizar));
router.delete("/atividades/:id", h(ativ.remover));
router.get("/atividades/:id/alunos", h(ativ.alunos));
router.get("/atividades/:id/pontos", h(ativ.pontosDev));
router.post("/atividades/:id/lancar", h(ativ.lancar));
router.put("/atividades/:id/correcoes/:alunoId", h(ativ.salvarCorrecao));
router.delete("/atividades/:id/correcoes/:alunoId", h(ativ.removerCorrecao));
router.post(
  "/atividades/:id/correcoes/:alunoId/foto",
  (req, res, next) =>
    ativ.uploadFotos(req, res, (err: unknown) => {
      if (!err) return next();
      const msg = (err as { code?: string }).code === "LIMIT_FILE_SIZE" ? "Foto muito grande (máx. 8 MB)." : err instanceof Error ? err.message : "Erro no envio da foto";
      res.status(400).json({ message: msg });
    }),
  h(ativ.corrigirFoto)
);

router.get("/habilidades/componentes", h(hab.getComponentes));
router.get("/habilidades/ufs", h(hab.getUfs));
router.get("/habilidades", h(hab.getHabilidades));

router.post("/registro-aula/gerar", h(reg.gerar));
router.post("/registro-aula/formatar", h(reg.formatar));
router.post("/registro-aula", h(reg.salvar));
router.put("/registro-aula/:id", h(reg.atualizar));
router.get("/registro-aula", h(reg.listar));
router.delete("/registro-aula/:id", h(reg.remover));

// Plano de curso (upload de PDF/DOCX/XLSX/CSV/TXT/imagem)
router.get("/planos-curso/padrao", h(pc.padrao));
router.post(
  "/planos-curso/extrair",
  (req, res, next) => pc.uploadPlano(req, res, (err: unknown) => (err ? res.status(400).json({ message: err instanceof Error ? err.message : "Erro no upload" }) : next())),
  h(pc.extrair)
);
router.post("/planos-curso", h(pc.salvar));
router.get("/planos-curso", h(pc.obter));
router.delete("/planos-curso/:id", h(pc.remover));

// Ditado por voz (navegadores sem reconhecimento proprio): audio -> texto
router.post(
  "/voz/transcrever",
  (req, res, next) =>
    voz.uploadAudio(req, res, (err: unknown) => {
      if (!err) return next();
      const msg = (err as { code?: string }).code === "LIMIT_FILE_SIZE" ? "Áudio muito longo. Fale em partes de até 2 minutos." : err instanceof Error ? err.message : "Erro no envio do áudio";
      res.status(400).json({ message: msg });
    }),
  h(voz.transcrever)
);
