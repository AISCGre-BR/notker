import { describe, it, expect } from "vitest";
import { mapSystems, type SylBox, type NoteIdent, factorToStrokeWidth, factorToHaloOpacity, pitchToLaneY } from "../src/preview/wave-lanes";
import { renderWaveLanes, LANE_HEIGHT, factorFromDrag, createWaveLanes, deformLiveSegment } from "../src/preview/wave-lanes";
import { WAVE_MIN, WAVE_MAX } from "../src/tuotilo/wave";

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

describe("renderWaveLanes — multi-sistema", () => {
  it("primeira nota do segundo sistema usa segPath de primeira nota (sem bezier Q ligando sistemas)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [
      {
        yBaseline: 30,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
        ],
      },
      {
        yBaseline: 120,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 1, realSyllableIndex: 2, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 15 },
        ],
      },
    ];
    renderWaveLanes(svg, systems, {});

    const lanes = svg.querySelectorAll(".wave-lane");
    expect(lanes.length).toBe(2);

    // A primeira linha do segundo sistema deve ser um stub horizontal (sem Q bezier)
    const secondLaneFirstLine = lanes[1].querySelector(".wave-line");
    expect(secondLaneFirstLine).not.toBeNull();
    const d = secondLaneFirstLine!.getAttribute("d")!;
    // segPath(null, null, 15, y) → "M 10,<y> L 20,<y>"
    expect(d).toMatch(/^M 10,[\d.]+ L 20,/);
    expect(d).not.toContain("Q");
  });
});

describe("factorFromDrag", () => {
  it("subir o ponteiro (dy negativo de clientY) alarga; descer encurta", () => {
    const up = factorFromDrag(1, /*startClientY*/ 200, /*nowClientY*/ 120); // subiu 80px
    const down = factorFromDrag(1, 200, 280); // desceu 80px
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
  });
  it("satura em [WAVE_MIN, WAVE_MAX]", () => {
    expect(factorFromDrag(2, 200, -9999)).toBeLessThanOrEqual(WAVE_MAX);
    expect(factorFromDrag(2, 200, 9999)).toBeGreaterThanOrEqual(WAVE_MIN);
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

describe("createWaveLanes (controller)", () => {
  it("desligado por default: não injeta nada; ligar injeta", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // boxes sintéticas (substitui getBBox, ausente no jsdom)
    const readBoxes = () => new Map([[1, [{ syllableIndex: 1, x: 10, y: 5, width: 20, height: 10 }]]]);
    const ctl = createWaveLanes(() => svg, {}, { readBoxes });
    ctl.refresh([{ syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null }]);
    expect(svg.querySelector(".wave-lane-layer")).toBeNull(); // default off
    ctl.setEnabled(true);
    ctl.refresh([{ syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null }]);
    expect(svg.querySelector(".wave-lane-layer")).not.toBeNull();
    ctl.setEnabled(false);
    expect(svg.querySelector(".wave-lane-layer")).toBeNull();
  });
});

describe("deformLiveSegment — halo ao vivo durante arrasto", () => {
  it("cria halo na hora para nota com fator 1 (sem halo inicial); esconde ao voltar para 1", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // Sistema com nota única: syllableIndex=0, noteInSyllable=0 → data-key="0:0"
    const systems = [
      {
        yBaseline: 30,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
        ],
      },
    ];
    renderWaveLanes(svg, systems, {});

    // Nota com fator 1 não deve ter halo inicial
    expect(svg.querySelectorAll(".wave-halo").length).toBe(0);

    // Arrastar para fator 2.0 deve criar o halo ao vivo
    deformLiveSegment(svg, "0:0", 2.0);
    const halo = svg.querySelector<SVGPathElement>('.wave-halo[data-key="0:0"]');
    expect(halo).not.toBeNull();
    expect(Number(halo!.style.opacity)).toBeGreaterThan(0);

    // Halo deve ser anterior ao wave-line na ordem de filhos da lane
    const lane = svg.querySelector(".wave-lane")!;
    const children = Array.from(lane.children);
    const haloIdx = children.findIndex((el) => el.classList.contains("wave-halo") && el.getAttribute("data-key") === "0:0");
    const lineIdx = children.findIndex((el) => el.classList.contains("wave-line") && el.getAttribute("data-key") === "0:0");
    expect(haloIdx).toBeGreaterThanOrEqual(0);
    expect(lineIdx).toBeGreaterThanOrEqual(0);
    expect(haloIdx).toBeLessThan(lineIdx);

    // Ao arrastar de volta para fator 1.0: halo deve ter opacidade 0 e não duplicar
    deformLiveSegment(svg, "0:0", 1.0);
    expect(svg.querySelectorAll('.wave-halo[data-key="0:0"]').length).toBe(1); // não criou segundo
    const haloAfter = svg.querySelector<SVGPathElement>('.wave-halo[data-key="0:0"]')!;
    expect(Number(haloAfter.style.opacity)).toBe(0);
  });
});
