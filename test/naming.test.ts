import { describe, it, expect } from "vitest";
import { nameNeume } from "../src/neume/naming";

describe("nameNeume (orquestra canônico + sistemático)", () => {
  it("ordena canônico → sistemático e anexa proveniência", () => {
    const r = nameNeume("vippt1su2", "stgall");
    expect(r.displayNames[0]).toBe("pes subbipunctis");
    expect(r.provenance.length).toBeGreaterThan(0);
    expect(r.provenance[0].source).toMatch(/Cardine/);
  });
  it("sem canônico → só sistemático, sem inventar", () => {
    const r = nameNeume("ni", "stgall");
    expect(r.canonical).toEqual([]);
    expect(r.provenance).toEqual([]);
    expect(r.systematic.length).toBeGreaterThan(0);
  });
  it("junta termos de ambos os produtores e dedup", () => {
    const r = nameNeume("vippt1su2", "stgall");
    expect(r.terms).toEqual(expect.arrayContaining(["pes subbipunctis", "subpunctis"]));
    expect(new Set(r.terms).size).toBe(r.terms.length);
  });
  it("sequência ! recebe nome holístico canônico", () => {
    const r = nameNeume("cl!po", "stgall");
    expect(r.displayNames).toContain("porrectus flexus resupinus");
  });
});
