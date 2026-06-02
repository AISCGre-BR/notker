import { describe, it, expect, vi } from "vitest";
import { createPreviewPanel, syllableIndexFromGroup } from "../src/preview/panel";
import { FakeEngine } from "../src/preview/engine";

describe("painel de preview", () => {
  it("renderiza (debounced) e injeta o SVG com grupos de sílaba", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const panel = createPreviewPanel(host, new FakeEngine(), { debounceMs: 250 });
    panel.update("(c4) Ve(f) ni(g)");
    expect(host.querySelector("svg")).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelectorAll('[class*="syllable-"]').length).toBe(2); // clave não numerada
    vi.useRealTimers();
  });
  it("expõe sourceMap e svgEl; clique numa sílaba dispara onSyllable(N)", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const panel = createPreviewPanel(host, new FakeEngine(), { debounceMs: 10 });
    const seen: number[] = [];
    panel.onSyllable((n) => seen.push(n));
    panel.update("(c4) a(f) b(g)");
    await vi.advanceTimersByTimeAsync(10);
    expect(panel.sourceMap().length).toBe(3); // clave + 2 sílabas reais
    (host.querySelector(".syllable-2") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(seen).toEqual([2]);
    vi.useRealTimers();
  });
  it("syllableIndexFromGroup lê o N da classe syllable-N", () => {
    const g = document.createElement("div");
    g.className = "syllable syllable-7";
    expect(syllableIndexFromGroup(g)).toBe(7);
  });
});
