// test/decode.test.ts
import { describe, it, expect } from "vitest";
import { decodeGlyph } from "../src/neume/decode";

const annot = {} as Record<string, { pt?: string[]; meaning?: string }>;

describe("decodeGlyph", () => {
  it("decodifica clivis simples", () => {
    const e = decodeGlyph("stgall", "cl", { path: "M0 0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.id).toBe("stgall:cl");
    expect(e.base).toBe("cl");
    expect(e.name).toBe("clivis");
    expect(e.nabc).toBe("cl");
    expect(e.terms).toContain("clivis");
    expect(e.terms).toContain("cl");
  });
  it("aplica o encoding no nabc (E→!)", () => {
    const e = decodeGlyph("stgall", "clE", { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.nabc).toBe("cl!");
    expect(e.base).toBe("cl");
    expect(e.name).toBe("clivis");
  });
  it("detecta letras significativas e mantém código cru nos termos", () => {
    const e = decodeGlyph("laon", "clEpilsc1lst3", { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.family).toBe("laon");
    expect(e.letters).toContain("lsc1");
    expect(e.letters).toContain("lst3");
    expect(e.terms).toContain("clepilsc1lst3"); // código cru sempre encontrável
  });
  it("base desconhecida cai no próprio código (pv não tem nome na ref)", () => {
    const e = decodeGlyph("stgall", "pv", { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.name).toBe("pv");
  });
});
