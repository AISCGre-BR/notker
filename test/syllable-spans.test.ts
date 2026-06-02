import { describe, it, expect } from "vitest";
import { syllableSpans } from "../src/preview/nabc-lib";

describe("syllableSpans", () => {
  it("clave recebe índice 0; sílabas reais numeram a partir de 1 (convenção do nabc-lib)", () => {
    const doc = "name: X;\nnabc-lines: 1;\n%%\n(c4) Ve(f|vi)ni(g|cl)";
    const spans = syllableSpans(doc);
    expect(spans.map((s) => s.syllableIndex)).toEqual([0, 1, 2]);
    const seg = doc.slice(spans[1].from, spans[1].to);
    expect(seg).toContain("Ve(f|vi)");
  });
  it("sem clave explícita, a numeração começa em 1", () => {
    const spans = syllableSpans("%%\nVe(f)ni(g)");
    expect(spans.map((s) => s.syllableIndex)).toEqual([1, 2]);
  });
  it("sem grupos de notas devolve vazio", () => {
    expect(syllableSpans("name: X;\nnabc-lines: 1;")).toEqual([]);
  });
});
