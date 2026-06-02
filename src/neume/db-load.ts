// src/neume/db-load.ts
import { NeumeDatabase } from "./db";
import type { NeumeDb } from "./types";

/** Carrega o asset gerado (Vite resolve o JSON como módulo). */
export async function loadNeumeDb(): Promise<NeumeDatabase> {
  const db = (await import("../assets/neume-db.json")).default as unknown as NeumeDb;
  return new NeumeDatabase(db);
}
