import { describe, it, expect } from "vitest";
import { FakeEngine } from "../src/preview/engine";

describe("PreviewEngine (contrato)", () => {
  it("render devolve SVG com grupos syllable-N e sourceMap com offsets válidos", async () => {
    const doc = "(c4) Ve(f|vi)ni(g|cl)";
    const eng = new FakeEngine();
    const r = await eng.render(doc);
    expect(r.svg).toMatch(/<svg/);
    expect(r.svg).toMatch(/class="syllable syllable-1"/);
    expect(r.sourceMap.length).toBeGreaterThan(0);
    for (const s of r.sourceMap) {
      expect(s.syllableIndex).toBeGreaterThanOrEqual(1);
      expect(s.from).toBeGreaterThanOrEqual(0);
      expect(s.to).toBeLessThanOrEqual(doc.length);
      expect(s.from).toBeLessThan(s.to);
    }
    expect(r.sourceMap.map((s) => s.syllableIndex)).toEqual(
      r.sourceMap.map((_, i) => i + 1),
    );
  });
  it("id identifica o motor", () => {
    expect(new FakeEngine().id).toBe("fake");
  });
});
