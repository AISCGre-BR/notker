// test/wave-panel.test.ts — render e interação da onda.
// Nota: jsdom não tem PointerEvent — usamos MouseEvent com o mesmo nome de evento.
// O listener usa addEventListener("pointerdown", ...) pelo nome, não pela classe.
import { describe, it, expect, vi } from "vitest";
import { createWavePanel, type WaveNoteView } from "../src/ui/wave-panel";

// Se o ambiente não tiver PointerEvent, usamos MouseEvent com o nome correto.
const PE = typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;

function host(): HTMLElement {
  document.body.innerHTML = `<div id="w"></div>`;
  return document.querySelector<HTMLElement>("#w")!;
}
function notes(): WaveNoteView[] {
  return [
    { syllableIndex: 0, noteInSyllable: 0, ms: 380, factor: 1, text: "Ve", divisioAfter: null },
    { syllableIndex: 0, noteInSyllable: 1, ms: 497, factor: 1, text: "", divisioAfter: null },
    { syllableIndex: 1, noteInSyllable: 0, ms: 380, factor: 1.4, text: "ni", divisioAfter: "minor" },
    { syllableIndex: 2, noteInSyllable: 0, ms: 380, factor: 1, text: "tor", divisioAfter: null },
  ];
}

describe("wave-panel — render", () => {
  it("WP1. um bloco por nota, com data-key e largura ∝ ms×fator", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn() });
    p.render(notes());
    const blocks = document.querySelectorAll<SVGRectElement>(".wave-note");
    expect(blocks).toHaveLength(4);
    expect(blocks[0].getAttribute("data-key")).toBe("0:0");
    const w0 = Number(blocks[0].getAttribute("width"));
    const w2 = Number(blocks[2].getAttribute("width"));
    expect(w2 / w0).toBeCloseTo((380 * 1.4) / 380, 2);
  });
  it("WP2. altura codifica o fator (bloco 1.4 mais alto que 1.0)", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn() });
    p.render(notes());
    const blocks = document.querySelectorAll<SVGRectElement>(".wave-note");
    expect(Number(blocks[2].getAttribute("height"))).toBeGreaterThan(Number(blocks[0].getAttribute("height")));
  });
  it("WP3. sílabas legendadas e divisio como barra", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn() });
    p.render(notes());
    const labels = [...document.querySelectorAll(".wave-label")].map((e) => e.textContent);
    expect(labels).toContain("Ve");
    expect(labels).toContain("ni");
    expect(document.querySelectorAll(".wave-divisio")).toHaveLength(1);
  });
  it("WP4. cursor: setCursor acende a nota; null limpa", () => {
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset: vi.fn() });
    p.render(notes());
    p.setCursor("1:0");
    expect(document.querySelectorAll(".wave-note.playing")).toHaveLength(1);
    p.setCursor(null);
    expect(document.querySelectorAll(".wave-note.playing")).toHaveLength(0);
  });
  it("WP5. banner: setStale(true) mostra aviso com botões manter/resetar", () => {
    const onReset = vi.fn();
    const p = createWavePanel(host(), { onFactorChange: vi.fn(), onReset });
    p.render(notes());
    p.setStale(true);
    const banner = document.querySelector<HTMLElement>(".wave-stale");
    expect(banner).not.toBeNull();
    (banner!.querySelector(".wave-stale-reset") as HTMLElement).click();
    expect(onReset).toHaveBeenCalled();
    p.setStale(false);
    expect(document.querySelector(".wave-stale")).toBeNull();
  });
});

describe("wave-panel — arrasto vertical", () => {
  it("WP6. pointerdown+move p/ cima emite onFactorChange com fator > 1 na nota", () => {
    const onFactorChange = vi.fn();
    const p = createWavePanel(host(), { onFactorChange, onReset: vi.fn() });
    p.render(notes());
    const block = document.querySelector<SVGRectElement>('.wave-note[data-key="0:1"]')!;
    block.dispatchEvent(new PE("pointerdown", { clientY: 100, bubbles: true }));
    block.dispatchEvent(new PE("pointermove", { clientY: 60, bubbles: true }));
    block.dispatchEvent(new PE("pointerup", { bubbles: true }));
    expect(onFactorChange).toHaveBeenCalled();
    const [syl, note, factor] = onFactorChange.mock.calls.at(-1)!;
    expect(syl).toBe(0);
    expect(note).toBe(1);
    expect(factor).toBeGreaterThan(1);
  });
  it("WP7. arrasto p/ baixo emite fator < 1", () => {
    const onFactorChange = vi.fn();
    const p = createWavePanel(host(), { onFactorChange, onReset: vi.fn() });
    p.render(notes());
    const block = document.querySelector<SVGRectElement>('.wave-note[data-key="2:0"]')!;
    block.dispatchEvent(new PE("pointerdown", { clientY: 100, bubbles: true }));
    block.dispatchEvent(new PE("pointermove", { clientY: 150, bubbles: true }));
    block.dispatchEvent(new PE("pointerup", { bubbles: true }));
    const [, , factor] = onFactorChange.mock.calls.at(-1)!;
    expect(factor).toBeLessThan(1);
  });
});
