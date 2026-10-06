import { describe, it, expect } from "vitest";
import { extractNoteAnchors, headCenter, rootOffset, type LayoutLike } from "../src/preview/note-anchors";

describe("headCenter", () => {
  it("nota única → centro do glifo", () => expect(headCenter(9, 1, 0)).toBe(4.5));
  it("clivis (w=17, k=2) → cabeças nas bordas", () => {
    expect(headCenter(17, 2, 0)).toBe(4.5);
    expect(headCenter(17, 2, 1)).toBe(12.5);
  });
  it("torculus (w=26, k=3) → esquerda, meio, direita", () => {
    expect([0, 1, 2].map((j) => headCenter(26, 3, j))).toEqual([4.5, 13, 21.5]);
  });
});

describe("extractNoteAnchors", () => {
  it("soma a cadeia root → linha → sílaba → segmento → glifo; ignora clave/espaços", () => {
    const layout = {
      lines: [{
        bounds: { x: 0, y: 26, width: 600 },
        _syllables: [
          { index: undefined, bounds: { x: 0, y: 0, width: 18 }, segments: [{ bounds: { x: 0, y: 0, width: 18 }, visualizers: [{ bounds: { x: 0, y: 0, width: 18 } }] }] },
          { index: 8, bounds: { x: 368, y: 0, width: 100 }, segments: [
            { bounds: { x: 0, y: 0, width: 17 }, visualizers: [{ bounds: { x: 0, y: 0, width: 17 }, notes: [{ pitch: 8 }, { pitch: 7 }] }] },
            { bounds: { x: 30, y: 0, width: 40 }, visualizers: [
              { bounds: { x: 0, y: 0, width: 13 } }, // Space
              { bounds: { x: 13, y: 0, width: 9 }, notes: [{ pitch: 8 }] },
            ] },
          ] },
        ],
      }],
    };
    const a = extractNoteAnchors(layout, { x: 0, y: 28 });
    expect(a.map((n) => [n.syllableIndex, n.x, n.y, n.pitch])).toEqual([
      [8, 372.5, 54, 8], [8, 380.5, 54, 7], [8, 415.5, 54, 8],
    ]);
  });
});

describe("rootOffset", () => {
  it("lê translate do root-group", () => {
    const d = document.createElement("div");
    d.innerHTML = '<svg><g class="root-group" transform="translate(0, 28)"></g></svg>';
    expect(rootOffset(d.querySelector("svg"))).toEqual({ x: 0, y: 28 });
  });
  it("sem root-group → 0,0", () => expect(rootOffset(null)).toEqual({ x: 0, y: 0 }));
});

describe("extractNoteAnchors — casos do nabc-lib real", () => {
  const line = (y: number, syllables: unknown[]) =>
    ({ bounds: { x: 0, y, width: 600 }, _syllables: syllables }) as NonNullable<LayoutLike["lines"]>[number];
  const syl = (index: number, x: number, visualizers: unknown[]) =>
    ({ index, bounds: { x, y: 0, width: 50 }, segments: [{ bounds: { x: 0, y: 0, width: 50 }, visualizers }] });

  it("ignora acidentes (Flat/Sharp/Natural): o modelo os traz com nota, a timeline não", () => {
    const layout = { lines: [line(0, [syl(4, 100, [
      { _glyph: { name: "Flat" }, bounds: { x: 0, y: 0, width: 9 }, notes: [{ pitch: 11 }] },
      { _glyph: { name: "Punctum" }, bounds: { x: 14, y: 0, width: 9 }, notes: [{ pitch: 11 }] },
    ])])] };
    expect(extractNoteAnchors(layout, { x: 0, y: 0 }).map((a) => a.x)).toEqual([118.5]);
  });

  it("glifo repartido em vários visualizers (bivirga atravessando a quebra) → 1 nota por visualizer", () => {
    const shared = [{ pitch: 12 }, { pitch: 12 }]; // MESMO array nos dois visualizers
    const layout = { lines: [
      line(0, [syl(55, 640, [{ _glyph: { name: "Virga" }, bounds: { x: 0, y: 0, width: 9 }, notes: shared }])]),
      line(200, [syl(55, 70, [{ _glyph: { name: "Virga" }, bounds: { x: 0, y: 0, width: 9 }, notes: shared }])]),
    ] };
    expect(extractNoteAnchors(layout, { x: 0, y: 0 }).map((a) => [a.x, a.y])).toEqual([[644.5, 0], [74.5, 200]]);
  });
});
