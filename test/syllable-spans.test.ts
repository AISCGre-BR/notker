import { describe, it, expect } from "vitest";
import { syllableSpans } from "../src/preview/nabc-lib";

describe("syllableSpans", () => {
  it("devolve um span 1-based por grupo de notas (...) no corpo, após o %%", () => {
    const doc = "name: X;\nnabc-lines: 1;\n%%\n(c4) Ve(f|vi)ni(g|cl)";
    const spans = syllableSpans(doc);
    expect(spans.map((s) => s.syllableIndex)).toEqual([1, 2, 3]);
    const seg = doc.slice(spans[1].from, spans[1].to);
    expect(seg).toContain("Ve(f|vi)");
  });
  it("sem corpo (sem %%) devolve vazio", () => {
    expect(syllableSpans("name: X;\nnabc-lines: 1;")).toEqual([]);
  });
});
