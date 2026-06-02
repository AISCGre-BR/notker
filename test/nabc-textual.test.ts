import { describe, it, expect } from "vitest";
import { inNabcTextual } from "../src/editor/context";

describe("inNabcTextual", () => {
  it("dentro do campo NABC (após o |)", () => {
    expect(inNabcTextual("(h|vi)", 4)).toBe(true);   // cursor dentro de "vi"
    expect(inNabcTextual("(h|", 3)).toBe(true);       // logo após o | (NABC vazio, digitando)
    expect(inNabcTextual("(g|torc", 7)).toBe(true);   // NABC incompleto, nota não fechada
  });
  it("fora do campo NABC", () => {
    expect(inNabcTextual("(h)", 2)).toBe(false);      // em nota sem |
    expect(inNabcTextual("(h|vi)", 6)).toBe(false);   // após o ) de fechamento
    expect(inNabcTextual("Pó(h|vi)", 1)).toBe(false); // na letra, fora de nota
    expect(inNabcTextual("", 0)).toBe(false);
  });
});
