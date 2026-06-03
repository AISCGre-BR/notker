import { describe, it, expect } from "vitest";
import data from "../src/neume/synopsis-neumes.json";

describe("synopsis-neumes.json", () => {
  it("tem cabeçalho de proveniência citável", () => {
    expect(data.provenance.source).toMatch(/Cardine/);
    expect(data.provenance.via).toMatch(/GregorioNabcRef/);
  });
  it("toda linha tem família válida, nome e ao menos um código-exemplo", () => {
    for (const row of data.rows as any[]) {
      expect(["stgall", "laon"]).toContain(row.family);
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.examples.length).toBeGreaterThan(0);
    }
  });
  it("inclui sequências ! e o caso-guia cl!po", () => {
    const rows = data.rows as any[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("porrectus flexus resupinus");
    const seqs = rows.flatMap((r) => r.examples).filter((c: string) => c.includes("!"));
    expect(seqs).toContain("cl!pe");
    expect(seqs).toContain("cl!po");
  });
  it("ambas as famílias representadas", () => {
    const fams = new Set((data.rows as any[]).map((r) => r.family));
    expect(fams.has("stgall")).toBe(true);
    expect(fams.has("laon")).toBe(true);
  });
});
