// test/tables.test.ts
import { describe, it, expect } from "vitest";
import { NEUME_KINDS, KIND_NAMES } from "../src/neume/tables";

describe("tabelas NABC", () => {
  it("tem os 32 códigos-base do gregoriotex-nabc.lua", () => {
    expect(NEUME_KINDS.size).toBe(32);
    for (const k of ["vi", "pu", "cl", "pe", "po", "to", "ci", "sc"]) {
      expect(NEUME_KINDS.has(k)).toBe(true);
    }
  });
  it("nomes vêm da referência oficial", () => {
    expect(KIND_NAMES["cl"]).toBe("clivis");
    expect(KIND_NAMES["sc"]).toBe("scandicus");
    expect(KIND_NAMES["pf"]).toBe("porrectus flexus");
    expect(KIND_NAMES["un"]).toBe("uncinus");
  });
});
