import { describe, it, expect } from "vitest";
import { inNabcTextual, nabcFieldStart } from "../src/editor/context";

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

describe("nabcFieldStart", () => {
  it("retorna a posição após o | do campo atual", () => {
    expect(nabcFieldStart("(h|vi)", 5)).toBe(3);
    expect(nabcFieldStart("(h|", 3)).toBe(3);       // campo vazio (logo após o |)
    expect(nabcFieldStart("(h|pes su", 9)).toBe(3); // espaços incluídos no conteúdo
  });
  it("retorna -1 fora do campo NABC", () => {
    expect(nabcFieldStart("(h)", 2)).toBe(-1);
    expect(nabcFieldStart("(h|vi)", 6)).toBe(-1);
    expect(nabcFieldStart("", 0)).toBe(-1);
  });
});
