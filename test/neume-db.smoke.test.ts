// test/neume-db.smoke.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import type { NeumeDb } from "../src/neume/types";

const dbPresent = existsSync("src/assets/neume-db.json");

describe.skipIf(!dbPresent)("neume-db gerado", () => {
  it("existe e tem ≥1170 entradas com svg não-vazio", () => {
    expect(existsSync("src/assets/neume-db.json"), "rode `npm run neume`").toBe(true);
    const db = JSON.parse(readFileSync("src/assets/neume-db.json", "utf8")) as NeumeDb;
    expect(db.entries.length).toBeGreaterThanOrEqual(1170);
    for (const e of db.entries) {
      expect(e.svg.path.length).toBeGreaterThan(0);
      expect(e.id).toMatch(/^(stgall|laon):/);
    }
  });
  it("kinds-base representativos presentes", () => {
    const db = JSON.parse(readFileSync("src/assets/neume-db.json", "utf8")) as NeumeDb;
    const bases = new Set(db.entries.map((e) => e.base));
    for (const k of ["cl", "pe", "to", "sc", "vi", "pu"]) expect(bases.has(k)).toBe(true);
  });
  it("a grande maioria dos nabc passa pelo parser", () => {
    const db = JSON.parse(readFileSync("src/assets/neume-db.json", "utf8")) as NeumeDb;
    const valid = db.entries.filter((e) => e.nabcValid).length;
    expect(valid / db.entries.length).toBeGreaterThan(0.8);
  });
});
