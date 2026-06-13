// test/selection-range.test.ts — seleção do editor → intervalo de sílabas.
import { describe, it, expect } from "vitest";
import { syllableRangeOfSelection } from "../src/preview/source-map";
import { syllableSpans } from "../src/preview/nabc-lib";

const DOC = "%%\n(c4) Ve(f)ni(g) Cre(h)a(i)tor(j)";
// sílabas reais 1..5; ordinais 0..4 entre as reais

describe("syllableRangeOfSelection", () => {
  const map = syllableSpans(DOC);
  it("R1. seleção cobrindo ni..Cre → ordinais [1, 2]", () => {
    const ni = DOC.indexOf("ni(");
    const creEnd = DOC.indexOf("a(i)");
    expect(syllableRangeOfSelection(map, ni, creEnd)).toEqual([1, 2]);
  });
  it("R2. seleção vazia (cursor) → null (toca tudo)", () => {
    expect(syllableRangeOfSelection(map, 5, 5)).toBeNull();
  });
  it("R3. seleção fora de qualquer sílaba real → null", () => {
    expect(syllableRangeOfSelection(map, 0, 2)).toBeNull(); // dentro de "%%\n"
  });
  it("R4. seleção parcial dentro de UMA sílaba → essa sílaba", () => {
    const v = DOC.indexOf("e(f"); // dentro de Ve
    expect(syllableRangeOfSelection(map, v, v + 1)).toEqual([0, 0]);
  });
});

