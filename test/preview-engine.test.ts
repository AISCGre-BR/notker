import { describe, it, expect } from "vitest";
import { FakeEngine } from "../src/preview/engine";

describe("PreviewEngine (contrato)", () => {
  it("clave sem número, sílabas reais com syllable-N; offsets válidos", async () => {
    const doc = "(c4) Ve(f|vi)ni(g|cl)";
    const eng = new FakeEngine();
    const r = await eng.render(doc);
    expect(r.svg).toMatch(/<svg/);
    expect(r.svg).toMatch(/class="syllable syllable-1"/); // 1ª sílaba real (Ve)
    expect(r.svg).not.toMatch(/syllable-0/);              // clave não é numerada
    expect(r.sourceMap.map((s) => s.syllableIndex)).toEqual([0, 1, 2]); // clave, Ve, ni
    for (const s of r.sourceMap) {
      expect(s.from).toBeGreaterThanOrEqual(0);
      expect(s.to).toBeLessThanOrEqual(doc.length);
      expect(s.from).toBeLessThan(s.to);
    }
  });
  it("id identifica o motor", () => {
    expect(new FakeEngine().id).toBe("fake");
  });
});
