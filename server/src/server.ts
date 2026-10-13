import { app } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";

async function main() {
  await connectDb();
  app.listen(env.port, () => console.log(`[api] http://localhost:${env.port}`));
}

main().catch((e) => {
  console.error("Falha ao iniciar:", e);
  process.exit(1);
});
