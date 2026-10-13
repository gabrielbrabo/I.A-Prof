import mongoose from "mongoose";
import { env } from "./env";

// Conecta no MongoDB (local ou Atlas)
export async function connectDb(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri);
  console.log("[db] conectado");
}
