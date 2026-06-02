// test/palette-insert.test.ts
import { describe, it, expect } from "vitest";
import { computeInsertion } from "../src/neume/insert";

describe("computeInsertion", () => {
  it("dentro de campo NABC insere só o token, no fim do token", () => {
    const r = computeInsertion({ inNabc: true, tokenFrom: 5, tokenTo: 7 }, "vi", 6);
    expect(r).toEqual({ insert: "vi", from: 7, to: 7 });
  });
  it("em nota sem NABC insere |token na posição do cursor", () => {
    const r = computeInsertion({ inNabc: false, tokenFrom: 4, tokenTo: 4 }, "vi", 4, "inNote");
    expect(r).toEqual({ insert: "|vi", from: 4, to: 4 });
  });
  it("fora de nota insere (|token)", () => {
    const r = computeInsertion({ inNabc: false, tokenFrom: 4, tokenTo: 4 }, "vi", 4, "outside");
    expect(r).toEqual({ insert: "(|vi)", from: 4, to: 4 });
  });
});
