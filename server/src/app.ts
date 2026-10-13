import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { router } from "./routes";

export const app = express();
app.set("trust proxy", 1); // IP real do professor (antifraude do cartao) atras do proxy do Render

app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: "5mb" }));
app.use("/api", router);

// Tratador de erro generico
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Erro interno" });
});
