import { describe, it, expect, vi } from "vitest";
import { resolveEditorToSyllable, installSync } from "../src/preview/sync";
import type { SyllableSource } from "../src/preview/engine";
import type { PreviewPanel } from "../src/preview/panel";

const map: SyllableSource[] = [
  { syllableIndex: 1, from: 1, to: 3 },
  { syllableIndex: 2, from: 5, to: 7 },
];

describe("sync editor→preview", () => {
  it("resolve offset do editor p/ índice de sílaba", () => {
    expect(resolveEditorToSyllable(map, 6)).toBe(2);
    expect(resolveEditorToSyllable(map, 2)).toBe(1);
  });
  it("offset fora de qualquer sílaba → null", () => {
    expect(resolveEditorToSyllable(map, 4)).toBeNull();
  });
});

describe("sync preview→editor", () => {
  it("clique numa sílaba move o cursor E realça a sílaba na partitura", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<svg><g class="syllable syllable-1"></g><g class="syllable syllable-2"></g></svg>';
    const svg = host.querySelector("svg")!;
    let cb: (n: number) => void = () => {};
    const panel = {
      onSyllable: (f: (n: number) => void) => { cb = f; },
      sourceMap: () => map,
      svgEl: () => svg,
    } as unknown as PreviewPanel;
    const dispatched: unknown[] = [];
    const view = { dispatch: (t: unknown) => dispatched.push(t), focus: vi.fn() } as never;

    installSync(view, panel);
    cb(2); // simula clique na sílaba 2

    expect(dispatched[0]).toEqual({ selection: { anchor: 5, head: 7 } });
    expect(svg.querySelector(".syllable-2")!.classList.contains("hl-strong")).toBe(true);
    expect(svg.querySelector(".syllable-1")!.classList.contains("hl-strong")).toBe(false);
  });
});
