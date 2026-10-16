import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { router } from "./routes";

export const app = express();
app.set("trust proxy", 1); // IP real do professor (antifraude do cartao) atras do proxy do Render

// CLIENT_URL aceita mais de um endereco separado por virgula (ex.: dominio proprio + endereco do Netlify)
const origens = env.clientUrl.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
app.use(cors({ origin: origens.length > 1 ? origens : origens[0] }));
app.use(express.json({ limit: "15mb" })); // atividades podem levar imagens do professor
app.use("/api", router);

// Tratador de erro generico
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Erro interno" });
});
