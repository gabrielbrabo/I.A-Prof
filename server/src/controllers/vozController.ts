import { Request, Response } from "express";
import multer from "multer";
import { ErroTranscricao, transcreverAudio } from "../services/transcricao";
import { comMedicao, exigirAcesso, SemAcesso, somarCustoUsd } from "../services/uso";

// Audio em memoria, ate 6 MB (~2-3 minutos de fala comprimida): limita custo e tempo
export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/webm") cb(null, true);
    else cb(new Error("Envie um arquivo de áudio"));
  },
}).single("audio");

// POST /api/voz/transcrever (multipart: audio) -> { texto }
export async function transcrever(req: Request, res: Response) {
  const f = req.file;
  if (!f || !f.size) return res.status(400).json({ message: "Nenhum áudio recebido" });
  try {
    await exigirAcesso(req.usuarioId!);
    const texto = await comMedicao(req.usuarioId!, async () => {
      // Custo aproximado do Whisper (Groq ~US$ 0,04/hora); audio comprimido ~2 KB por segundo
      somarCustoUsd(((f.size / 2000) * 0.04) / 3600);
      return transcreverAudio(f.buffer, f.originalname || "fala.webm", f.mimetype);
    });
    res.json({ texto });
  } catch (e) {
    if (e instanceof SemAcesso) return res.status(402).json({ message: e.message, semAcesso: true });
    if (e instanceof ErroTranscricao) return res.status(e.status).json({ message: e.message });
    console.error("[voz/transcrever]", e);
    res.status(500).json({ message: "Erro ao transcrever o áudio" });
  }
}
