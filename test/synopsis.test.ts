import { describe, it, expect } from "vitest";
import { classifySynopsis } from "../src/neume/synopsis";

describe("classifySynopsis (match estrutural família-escopado)", () => {
  it("match literal de exemplo da sinopse", () => {
    const c = classifySynopsis("vippt1su2", "stgall");
    expect(c.map((x) => x.name)).toContain("pes subbipunctis");
  });
  it("herda por assinatura — caso-guia vippt3su2 (contagem livre)", () => {
    const c = classifySynopsis("vippt3su2", "stgall");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].provenance.source).toMatch(/Cardine/);
    expect(c[0].provenance.via).toMatch(/GregorioNabcRef/);
  });
  it("família escopa o nome (vi+pp = scandicus em Laon)", () => {
    const c = classifySynopsis("vipp2", "laon");
    expect(c.map((x) => x.name)).toContain("scandicus");
  });
  it("sequência ! é classificada — cl!po", () => {
    const c = classifySynopsis("cl!po", "stgall");
    expect(c.map((x) => x.name)).toContain("porrectus flexus resupinus");
  });
  it("sem match → vazio (nunca inventa)", () => {
    expect(classifySynopsis("ni", "stgall")).toEqual([]);
  });
});
