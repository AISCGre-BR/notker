// test/decode.test.ts
import { describe, it, expect } from "vitest";
import { decodeGlyph, describeToken } from "../src/neume/decode";

describe("describeToken (decodifica qualquer composto)", () => {
  it("tractulus com letra significativa: tahglsi9", () => {
    const d = describeToken("tahglsi9");
    expect(d.base).toBe("ta");
    expect(d.baseName).toBe("tractulus");
    expect(d.isKnownBase).toBe(true);
    expect(d.letters).toEqual(["i"]);
  });
  it("virga com letra: vihhlse1", () => {
    const d = describeToken("vihhlse1");
    expect(d.base).toBe("vi");
    expect(d.baseName).toBe("virga");
    expect(d.letters).toEqual(["e"]);
  });
  it("clivis com modificador, sem letra: cl-hh", () => {
    const d = describeToken("cl-hh");
    expect(d.baseName).toBe("clivis");
    expect(d.letters).toEqual([]);
  });
  it("ignora o | inicial", () => {
    expect(describeToken("|vi").base).toBe("vi");
  });
  it("base desconhecida marca isKnownBase=false", () => {
    expect(describeToken("zz").isKnownBase).toBe(false);
  });
});

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
  it("adiciona nomes de modificadores aos termos (su→subpunctis, su2→subbipunctis)", () => {
    const e = decodeGlyph("stgall", "peNsu2", { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.nabc).toBe("pe-su2");
    expect(e.terms).toContain("subpunctis");
    expect(e.terms).toContain("subbipunctis");
    expect(e.terms).toContain("pes");
  });
  it("pp adiciona prepunctis/praepunctis", () => {
    const e = decodeGlyph("stgall", "popp2", { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, annot);
    expect(e.terms).toContain("prepunctis");
    expect(e.terms).toContain("praepunctis");
  });
});
