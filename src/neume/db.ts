// src/neume/db.ts
import type { NeumeDb, NeumeEntry } from "./types";

export class NeumeDatabase {
  private byIdMap = new Map<string, NeumeEntry>();
  constructor(private db: NeumeDb) {
    for (const e of db.entries) this.byIdMap.set(e.id, e);
  }
  all(): NeumeEntry[] { return this.db.entries; }
  byId(id: string): NeumeEntry | undefined { return this.byIdMap.get(id); }
}
