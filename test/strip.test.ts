// test/strip.test.ts — faixa inferior recolhível (B2a-fix1).
import { describe, it, expect, vi } from "vitest";
import { createBottomStrip } from "../src/ui/strip";

function host(): HTMLElement {
  document.body.innerHTML = `<div id="h"></div>`;
  return document.querySelector<HTMLElement>("#h")!;
}

describe("createBottomStrip", () => {
  it("S1. partitura (top) sempre visível; faixa recolhida por padrão (D6)", () => {
    const s = createBottomStrip(host(), "Interpretação");
    expect(s.top().style.display).not.toBe("none");
    expect(s.body().style.display).toBe("none");
    expect(s.expanded()).toBe(false);
  });
  it("S2. toggle expande/recolhe e notifica; top permanece visível", () => {
    const s = createBottomStrip(host(), "Interpretação");
    const cb = vi.fn();
    s.onToggle(cb);
    s.toggle();
    expect(s.expanded()).toBe(true);
    expect(s.body().style.display).not.toBe("none");
    expect(s.top().style.display).not.toBe("none");
    expect(cb).toHaveBeenCalledWith(true);
  });
  it("S3. clique no cabeçalho alterna", () => {
    const s = createBottomStrip(host(), "Interpretação");
    document.querySelector<HTMLElement>(".strip-header")!.click();
    expect(s.expanded()).toBe(true);
  });
});
