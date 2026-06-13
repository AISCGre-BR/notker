import { describe, it, expect } from "vitest";
import { mapSystems, type SylBox, type NoteIdent, factorToStrokeWidth, factorToHaloOpacity, pitchToLaneY } from "../src/preview/wave-lanes";
import { renderWaveLanes, LANE_HEIGHT } from "../src/preview/wave-lanes";

function svgWithSystems() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const systems = [
    { yBaseline: 30, xRange: [10, 60] as [number, number], notes: [
      { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
      { syllableIndex: 1, realSyllableIndex: 2, noteInSyllable: 0, pitch: "h", alt: 0, factor: 2.0, divisioAfter: null, x: 50 },
    ]},
  ];
  return { svg, systems };
}

describe("renderWaveLanes", () => {
  it("injeta uma lane por sistema e um path+hit por nota", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-lane").length).toBe(1);
    expect(svg.querySelectorAll(".wave-line").length).toBe(2);
    expect(svg.querySelectorAll(".wave-hit").length).toBe(2);
  });
  it("desenha halo só na nota alargada e marca data-key", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-halo").length).toBe(1); // só a de fator 2.0
    expect(svg.querySelector('.wave-hit[data-key="1:0"]')).not.toBeNull();
  });
  it("re-render limpa a camada anterior (sem duplicar)", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-lane-layer").length).toBe(1);
    expect(svg.querySelectorAll(".wave-line").length).toBe(2);
  });
});

const note = (s: number, n: number, pitch = "f"): NoteIdent =>
  ({ syllableIndex: s, realSyllableIndex: s, noteInSyllable: n, pitch, alt: 0, factor: 1, divisioAfter: null });

describe("mapSystems", () => {
  it("uma sílaba de 1 nota → 1 sistema, x no centro da box", () => {
    const notes = [note(0, 0)];
    const boxes = new Map<number, SylBox[]>([[0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]]]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes).toHaveLength(1);
    expect(sys[0].notes[0].x).toBeCloseTo(20); // 10 + 0.5*20
  });

  it("duas sílabas no mesmo y → um sistema com duas notas em x crescente", () => {
    const notes = [note(0, 0), note(1, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]],
      [1, [{ syllableIndex: 1, x: 40, y: 6, width: 20, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes.map((n) => n.x)).toEqual([20, 50]);
  });

  it("faixas de y distintas → dois sistemas, ordenados de cima para baixo", () => {
    const notes = [note(0, 0), note(1, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]],
      [1, [{ syllableIndex: 1, x: 10, y: 80, width: 20, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
    expect(sys[0].notes[0].syllableIndex).toBe(0);
    expect(sys[1].notes[0].syllableIndex).toBe(1);
  });

  it("melisma com a sílaba partida em 2 boxes (quebra de linha) → 1 nota em cada sistema", () => {
    const notes = [note(0, 0), note(0, 1)];
    const boxes = new Map<number, SylBox[]>([
      [0, [
        { syllableIndex: 0, x: 90, y: 5, width: 10, height: 10 },   // fim da linha 1
        { syllableIndex: 0, x: 0, y: 80, width: 10, height: 10 },   // início da linha 2
      ]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
    expect(sys[0].notes).toHaveLength(1);
    expect(sys[1].notes).toHaveLength(1);
  });

  it("melisma K=3 em box único → x distribuídos linearmente em 5, 15, 25", () => {
    // g = (j+0.5)/K, local = g/1.0 = g, x = 0 + g*30
    // nota 0: g=0.5/3≈0.1667 → x=5
    // nota 1: g=1.5/3=0.5    → x=15
    // nota 2: g=2.5/3≈0.8333 → x=25
    const notes = [note(0, 0), note(0, 1), note(0, 2)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 0, y: 5, width: 30, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    const xs = sys[0].notes.map((n) => n.x);
    expect(xs[0]).toBeCloseTo(5);
    expect(xs[1]).toBeCloseTo(15);
    expect(xs[2]).toBeCloseTo(25);
  });

  it("K=1 spanning duas boxes iguais → note cai na primeira box (seam: g≤acc+frac) com x≈100", () => {
    // totalW=20, g=(0+0.5)/1=0.5, frac da 1ª box=10/20=0.5
    // condição: 0.5 <= 0 + 0.5 → true → chosen=1ª box (y≈5)
    // local=(0.5-0)/0.5=1.0 → x = 90 + 1.0*10 = 100
    const notes = [note(0, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [
        { syllableIndex: 0, x: 90, y: 5,  width: 10, height: 10 }, // linha 1
        { syllableIndex: 0, x: 0,  y: 80, width: 10, height: 10 }, // linha 2
      ]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
    // a nota cai no sistema da banda y≈5 (sistema 0)
    expect(sys[0].notes).toHaveLength(1);
    expect(sys[1].notes).toHaveLength(0);
    expect(sys[0].notes[0].x).toBeCloseTo(100);
  });
});

describe("codificação visual do fator", () => {
  it("espessura cresce com o fator e satura nos limites", () => {
    expect(factorToStrokeWidth(1)).toBeCloseTo(1.7, 1);
    expect(factorToStrokeWidth(2.5)).toBeGreaterThan(factorToStrokeWidth(1));
    expect(factorToStrokeWidth(0.5)).toBeGreaterThanOrEqual(1.0);
    expect(factorToStrokeWidth(0.5)).toBeLessThan(factorToStrokeWidth(1));
    expect(factorToStrokeWidth(99)).toBeLessThanOrEqual(5.0); // clamp superior
  });
  it("halo só aparece quando há alargamento (fator > 1)", () => {
    expect(factorToHaloOpacity(1)).toBe(0);
    expect(factorToHaloOpacity(0.7)).toBe(0);
    expect(factorToHaloOpacity(2.5)).toBeGreaterThan(0);
    expect(factorToHaloOpacity(99)).toBeLessThanOrEqual(0.55); // clamp
  });
});

describe("pitchToLaneY", () => {
  it("nota grave fica mais baixa (y maior) que nota aguda", () => {
    const yLow = pitchToLaneY("d", 22);
    const yHigh = pitchToLaneY("l", 22);
    expect(yLow).toBeGreaterThan(yHigh);
  });
  it("pitch desconhecido cai no meio sem lançar", () => {
    expect(() => pitchToLaneY("?", 22)).not.toThrow();
  });
});
