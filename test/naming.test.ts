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
  // Bug 2: a contagem de subpunctis (bi=2, tri=3, genérico >3) deve refletir o
  // número real, não herdar "subbipunctis" só porque o exemplo da sinopse usa su2.
  it("su3 → subtripunctis (não subbipunctis)", () => {
    const r = nameNeume("pesu3", "stgall");
    expect(r.displayNames).toContain("pes subtripunctis");
    expect(r.displayNames).not.toContain("pes subbipunctis");
  });
  it("su2 permanece subbipunctis", () => {
    expect(nameNeume("pesu2", "stgall").displayNames).toContain("pes subbipunctis");
  });
  it("su >3 generaliza para subpunctis (sem bi/tri)", () => {
    const r = nameNeume("pesu5", "stgall");
    expect(r.displayNames).toContain("pes subpunctis");
    expect(r.displayNames.some((n) => /subbi|subtri/.test(n))).toBe(false);
  });
});
