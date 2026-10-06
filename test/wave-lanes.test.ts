import { describe, it, expect } from "vitest";
import { mapSystems, type SylBox, type NoteIdent, factorToBarHeight, pitchToLaneY } from "../src/preview/wave-lanes";
import { renderWaveLanes, LANE_HEIGHT, factorFromDrag, createWaveLanes, deformLiveSegment } from "../src/preview/wave-lanes";
import { WAVE_SPREAD, WAVE_LINE_SPACING_PX, MIN_NOTE_DX, MIN_ANCHOR_DX, spreadCoincident } from "../src/preview/wave-lanes";
import { bboxToRoot } from "../src/preview/wave-lanes";
import { WAVE_MIN, WAVE_MAX } from "../src/tuotilo/wave";
import diesBoxes from "./fixtures/dies-sanctificatus-boxes.json";

describe("mapSystems com dados REAIS do nabc-lib (saída getCTM)", () => {
  it("Dies sanctificatus (121 boxes, 5 sistemas) — não funde nem fragmenta", () => {
    const boxes = new Map<number, SylBox[]>();
    for (const b of diesBoxes.boxes as SylBox[]) {
      const arr = boxes.get(b.syllableIndex) ?? [];
      arr.push(b);
      boxes.set(b.syllableIndex, arr);
    }
    const notes: NoteIdent[] = [...boxes.keys()].sort((a, b) => a - b).map((idx) => ({
      syllableIndex: idx, realSyllableIndex: idx, noteInSyllable: 0,
      pitch: "f", alt: 0, factor: 1, divisioAfter: null,
    }));
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(diesBoxes.expectedSystems); // 5
    const ys = sys.map((s) => s.yBaseline);
    expect(ys).toEqual([...ys].sort((a, b) => a - b)); // crescentes
    for (const s of sys) expect(s.notes.length).toBeGreaterThan(0);
  });
});

describe("bboxToRoot (bbox local → espaço do <svg> via CTM)", () => {
  const bbox = { x: 0, y: 0, width: 20, height: 10 };
  it("translação pura (CTM = translate(e,f)) desloca a origem, mantém tamanho", () => {
    // m = translate(40, 200): a=1 b=0 c=0 d=1 e=40 f=200 (caso real: root-group + linhas)
    const r = bboxToRoot(bbox, { a: 1, b: 0, c: 0, d: 1, e: 40, f: 200 });
    expect(r.x).toBeCloseTo(40);
    expect(r.y).toBeCloseTo(200);
    expect(r.width).toBeCloseTo(20);
    expect(r.height).toBeCloseTo(10);
  });
  it("escala + translação aplica nos dois cantos (min/abs)", () => {
    // m = scale(2) then translate(10,5): a=2 d=2 e=10 f=5
    const r = bboxToRoot(bbox, { a: 2, b: 0, c: 0, d: 2, e: 10, f: 5 });
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(5);
    expect(r.width).toBeCloseTo(40);
    expect(r.height).toBeCloseTo(20);
  });
  it("CTM nulo → devolve o bbox local cru (fallback seguro)", () => {
    const r = bboxToRoot(bbox, null);
    expect(r).toEqual(bbox);
  });
});

function svgWithSystems() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const systems = [
    { yBaseline: 30, yTop: 8, xRange: [10, 60] as [number, number], notes: [
      { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
      { syllableIndex: 1, realSyllableIndex: 2, noteInSyllable: 0, pitch: "h", alt: 0, factor: 2.0, divisioAfter: null, x: 50 },
    ]},
  ];
  return { svg, systems };
}

const BASE_LINE = LANE_HEIGHT - 2; // régua-base no pé da lane (colunas sobem dela)

describe("renderWaveLanes — colunas de mensura", () => {
  it("injeta uma lane por sistema, uma coluna+hit por nota e a régua-base", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-lane").length).toBe(1);
    expect(svg.querySelectorAll(".wave-col").length).toBe(2);
    expect(svg.querySelectorAll(".wave-hit").length).toBe(2);
    expect(svg.querySelectorAll(".wave-base").length).toBe(1);
    expect(svg.querySelector('.wave-hit[data-key="1:0"]')).not.toBeNull();
  });
  it("coluna ancora na régua-base e a ALTURA codifica o fator (sobe para a nota)", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    const c0 = svg.querySelector<SVGRectElement>('.wave-col[data-key="0:0"]')!; // fator 1
    const c1 = svg.querySelector<SVGRectElement>('.wave-col[data-key="1:0"]')!; // fator 2
    const h0 = Number(c0.getAttribute("height")), y0 = Number(c0.getAttribute("y"));
    const h1 = Number(c1.getAttribute("height")), y1 = Number(c1.getAttribute("y"));
    expect(y0 + h0).toBeCloseTo(BASE_LINE); // pé na régua-base
    expect(y1 + h1).toBeCloseTo(BASE_LINE);
    expect(h0).toBe(factorToBarHeight(1));
    expect(h1).toBe(factorToBarHeight(2));
    expect(h1).toBeGreaterThan(h0); // alargada é visivelmente mais alta
  });
  it("nota editada (fator ≠ 1) ganha a classe edited; neutra não", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelector('.wave-col[data-key="0:0"]')!.classList.contains("edited")).toBe(false);
    expect(svg.querySelector('.wave-col[data-key="1:0"]')!.classList.contains("edited")).toBe(true);
  });
  it("zebra: sílabas alternadas ganham faixa de fundo agrupando suas notas", () => {
    const { svg, systems } = svgWithSystems(); // 2 sílabas → 1 faixa (a alternada)
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-band").length).toBe(1);
  });
  it("colunas carregam data-real-syl (elo com a sílaba da pauta)", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelector('.wave-col[data-real-syl="1"]')).not.toBeNull();
    expect(svg.querySelector('.wave-col[data-real-syl="2"]')).not.toBeNull();
  });
  it("re-render limpa a camada anterior (sem duplicar)", () => {
    const { svg, systems } = svgWithSystems();
    renderWaveLanes(svg, systems, {});
    renderWaveLanes(svg, systems, {});
    expect(svg.querySelectorAll(".wave-lane-layer").length).toBe(1);
    expect(svg.querySelectorAll(".wave-col").length).toBe(2);
  });
  it("divisio vira vírgula de respiração entre as colunas (no ponto médio)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [{
      yBaseline: 30, yTop: 8, xRange: [10, 90] as [number, number], notes: [
        { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: "minima" as const, x: 20 },
        { syllableIndex: 1, realSyllableIndex: 2, noteInSyllable: 0, pitch: "h", alt: 0, factor: 1, divisioAfter: null, x: 60 },
      ],
    }];
    renderWaveLanes(svg, systems, {});
    const breath = svg.querySelector<SVGLineElement>(".wave-breath")!;
    expect(breath).not.toBeNull();
    const bx = Number(breath.getAttribute("x1"));
    expect(bx).toBeGreaterThan(20);
    expect(bx).toBeLessThan(60);
  });
  it("hover no hit: coluna hovered, irmãs da sílaba sibling, guia até o neuma", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [{
      yBaseline: 30, yTop: 8, xRange: [10, 90] as [number, number], notes: [
        { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
        { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 1, pitch: "g", alt: 0, factor: 1, divisioAfter: null, x: 50 }, // irmã
      ],
    }];
    renderWaveLanes(svg, systems, {});
    const hit = svg.querySelector<SVGRectElement>('.wave-hit[data-key="0:0"]')!;
    hit.dispatchEvent(new Event("pointerenter"));
    expect(svg.querySelector('.wave-col[data-key="0:0"]')!.classList.contains("hovered")).toBe(true);
    expect(svg.querySelector('.wave-col[data-key="0:1"]')!.classList.contains("sibling")).toBe(true);
    expect(svg.querySelector(".wave-guide")).not.toBeNull();
    hit.dispatchEvent(new Event("pointerleave"));
    expect(svg.querySelector('.wave-col[data-key="0:0"]')!.classList.contains("hovered")).toBe(false);
    expect(svg.querySelector('.wave-col[data-key="0:1"]')!.classList.contains("sibling")).toBe(false);
    expect(svg.querySelector(".wave-guide")).toBeNull();
  });
  it("divisio na ÚLTIMA nota do sistema também ganha respiração (finalis de fim de linha)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [{
      yBaseline: 30, yTop: 8, xRange: [10, 90] as [number, number], notes: [
        { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: "finalis" as const, x: 60 },
      ],
    }];
    renderWaveLanes(svg, systems, {});
    const breath = svg.querySelector<SVGLineElement>(".wave-breath")!;
    expect(breath).not.toBeNull();
    expect(Number(breath.getAttribute("x1"))).toBeGreaterThan(60); // à direita da nota
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

  it("topos diferentes DENTRO de um sistema (gap < limiar) ficam num só sistema", () => {
    // proporções reais: altura ~120, topos 14/32/78 (gaps 18/46 < 0,45×120=54).
    const notes = [note(0, 0), note(1, 0), note(2, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 10, y: 14, width: 18, height: 120 }]],
      [1, [{ syllableIndex: 1, x: 40, y: 32, width: 18, height: 120 }]],
      [2, [{ syllableIndex: 2, x: 70, y: 78, width: 18, height: 120 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes).toHaveLength(3);
  });

  it("REGRESSÃO: boxes full-height de sistemas vizinhos que se sobrepõem ~2px NÃO fundem", () => {
    // o bug real (UAT 2026-06-13): sys1 box y=14 h=129 (fundo 143) e sys2 box y=141
    // h=129 se sobrepõem por 2px → fusão de intervalos juntava tudo. Gap nos topos
    // (127 >> 0,45×129=58) separa corretamente.
    const notes = [note(0, 0), note(1, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 100, y: 14, width: 9, height: 129 }]],
      [1, [{ syllableIndex: 1, x: 30, y: 141, width: 9, height: 129 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
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

  it("melisma em box LARGO (≥ k×MIN_DX) → distribuição linear pela largura", () => {
    // box w=90, K=3: span=max(90, 3×24=72)=90 → x = (j+0.5)/3 × 90 = 15, 45, 75
    const notes = [note(0, 0), note(0, 1), note(0, 2)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 0, y: 5, width: 90, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes.map((n) => n.x)).toEqual([15, 45, 75]);
  });

  it("neuma COMPACTO (clivis K=2, glifo estreito) → notas recebem ESPAÇO MÍNIMO centrado", () => {
    // glifo estreito (w=8) centrado em x=100; K=2 → span=max(8, 2×24)=48 centrado em 100
    // → notas em 88 e 112 (MIN_NOTE_DX=24 de distância, distinguíveis/clicáveis)
    const notes = [note(0, 0), note(0, 1)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 96, y: 5, width: 8, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    const xs = sys[0].notes.map((n) => n.x);
    expect(xs[1] - xs[0]).toBeCloseTo(MIN_NOTE_DX);
    expect((xs[0] + xs[1]) / 2).toBeCloseTo(100); // centrado no glifo
  });

  it("K=1 spanning duas boxes iguais → note cai na primeira box (seam: g≤acc+frac)", () => {
    // totalW=20, g=0.5, frac da 1ª box=0.5 → 0.5<=0.5 → 1ª box (y≈5).
    // 1 nota nessa box: span=max(10, 1×24)=24 centrado em 95 → x=95.
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
    expect(sys[0].notes[0].x).toBeCloseTo(95);
  });
});

describe("constantes de espalhamento (decisão UAT-8, 2026-07-09)", () => {
  it("WAVE_SPREAD = 3.4 — abertura validada no probe (Dies: 10 sistemas, divisões legíveis)", () => {
    expect(WAVE_SPREAD).toBe(3.4);
  });
  it("MIN_NOTE_DX = 24 — clivis/neumas compactos acompanham a abertura da partitura", () => {
    // O spread multiplica só os espaços ELÁSTICOS do nabc-lib; notas dentro do
    // mesmo glifo não desgrudam com ele — por isso o mínimo por nota sobe junto.
    expect(MIN_NOTE_DX).toBe(24);
  });
  it("WAVE_LINE_SPACING_PX = 64 — vão generoso: lane + folga dos dois lados (UAT 2026-07-09)", () => {
    expect(WAVE_LINE_SPACING_PX).toBe(64);
  });
  it("LANE_HEIGHT = 28 — lane mais alta = traço e alvo de arrasto maiores", () => {
    expect(LANE_HEIGHT).toBe(28);
  });
});

describe("codificação visual do fator (altura da coluna)", () => {
  it("altura cresce com o fator, é distinguível a meio-fator e satura", () => {
    expect(factorToBarHeight(1)).toBe(11);
    expect(factorToBarHeight(1.5) - factorToBarHeight(1)).toBeGreaterThanOrEqual(5); // legível
    expect(factorToBarHeight(0.5)).toBeLessThan(factorToBarHeight(1));
    expect(factorToBarHeight(0.1)).toBeGreaterThanOrEqual(5);  // piso: nunca some
    expect(factorToBarHeight(99)).toBeLessThanOrEqual(25);     // teto: cabe na lane
  });
});

describe("renderWaveLanes — multi-sistema", () => {
  it("cada sistema tem lane própria; a coluna do 2º fica centrada na sua nota", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [
      {
        yBaseline: 30, yTop: 8,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
        ],
      },
      {
        yBaseline: 120, yTop: 98,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 1, realSyllableIndex: 2, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 15 },
        ],
      },
    ];
    renderWaveLanes(svg, systems, {});

    const lanes = svg.querySelectorAll(".wave-lane");
    expect(lanes.length).toBe(2);
    const col = lanes[1].querySelector<SVGRectElement>(".wave-col")!;
    const cx = Number(col.getAttribute("x")) + Number(col.getAttribute("width")) / 2;
    expect(cx).toBeCloseTo(15);
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

describe("deformLiveSegment — coluna ao vivo durante o arrasto", () => {
  it("muda altura/y da coluna (pé fixo na régua-base) e alterna a classe edited", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const systems = [
      {
        yBaseline: 30, yTop: 8,
        xRange: [10, 60] as [number, number],
        notes: [
          { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null, x: 20 },
        ],
      },
    ];
    renderWaveLanes(svg, systems, {});
    const col = svg.querySelector<SVGRectElement>('.wave-col[data-key="0:0"]')!;
    expect(col.classList.contains("edited")).toBe(false);

    deformLiveSegment(svg, "0:0", 2.0);
    expect(Number(col.getAttribute("height"))).toBe(factorToBarHeight(2));
    expect(Number(col.getAttribute("y")) + Number(col.getAttribute("height"))).toBeCloseTo(BASE_LINE);
    expect(col.classList.contains("edited")).toBe(true);

    deformLiveSegment(svg, "0:0", 1.0);
    expect(Number(col.getAttribute("height"))).toBe(factorToBarHeight(1));
    expect(col.classList.contains("edited")).toBe(false);
  });
});

describe("cursor de playback", () => {
  it("setCursor pinta a coluna .playing e limpa a anterior", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const readBoxes = () => new Map([[1, [{ syllableIndex: 1, x: 10, y: 5, width: 40, height: 10 }]]]);
    const ctl = createWaveLanes(() => svg, {}, { readBoxes });
    ctl.setEnabled(true);
    ctl.refresh([
      { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null },
      { syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 1, pitch: "g", alt: 0, factor: 1, divisioAfter: null },
    ]);
    ctl.setCursor("0:0");
    expect(svg.querySelector('.wave-col[data-key="0:0"]')!.classList.contains("playing")).toBe(true);
    ctl.setCursor("0:1");
    expect(svg.querySelector('.wave-col[data-key="0:0"]')!.classList.contains("playing")).toBe(false);
    expect(svg.querySelector('.wave-col[data-key="0:1"]')!.classList.contains("playing")).toBe(true);
    ctl.setCursor(null);
    expect(svg.querySelectorAll(".wave-col.playing").length).toBe(0);
  });
});

describe("elo bidirecional pauta → lane (score-hover)", () => {
  it("pointerover na sílaba da pauta acende as colunas dela; sair apaga", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "syllable-1");
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    g.appendChild(glyph);
    svg.appendChild(g);
    document.body.appendChild(svg as unknown as Node);

    const readBoxes = () => new Map([[1, [{ syllableIndex: 1, x: 10, y: 5, width: 20, height: 10 }]]]);
    const ctl = createWaveLanes(() => svg, {}, { readBoxes });
    ctl.setEnabled(true);
    ctl.refresh([{ syllableIndex: 0, realSyllableIndex: 1, noteInSyllable: 0, pitch: "f", alt: 0, factor: 1, divisioAfter: null }]);
    const col = svg.querySelector('.wave-col[data-real-syl="1"]')!;

    glyph.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(col.classList.contains("score-hover")).toBe(true);

    svg.dispatchEvent(new Event("pointerleave"));
    expect(col.classList.contains("score-hover")).toBe(false);
  });
});

describe("mapSystems com ÂNCORAS reais de nota (modelo de layout do nabc-lib)", () => {
  // 2 sistemas: topos em y=5 e y=80. Âncora.pitch = altura numérica do nabc-lib
  // (offset constante em relação à letra gabc — só a FORMA da sequência importa).
  const boxes = new Map<number, SylBox[]>([
    [0, [
      { syllableIndex: 0, x: 0, y: 5, width: 100, height: 10 },
      { syllableIndex: 0, x: 0, y: 5, width: 100, height: 10 }, // <g> duplicado (aninhado)
    ]],
    [1, [{ syllableIndex: 1, x: 0, y: 80, width: 60, height: 10 }]],
  ]);

  it("usa o x REAL de cada cabeça de nota (sem pares no mesmo x) e o sistema pelo y da âncora", () => {
    const notes = [note(0, 0, "f"), note(0, 1, "e"), note(0, 2, "f"), note(1, 0, "g")];
    const anchors = [
      { syllableIndex: 0, x: 12.5, y: 6, pitch: 8 },
      { syllableIndex: 0, x: 20.5, y: 6, pitch: 7 },
      { syllableIndex: 0, x: 55.5, y: 6, pitch: 8 },
      { syllableIndex: 1, x: 30, y: 81, pitch: 9 },
    ];
    const sys = mapSystems(notes, boxes, anchors);
    expect(sys).toHaveLength(2);
    expect(sys[0].notes.map((n) => [n.noteInSyllable, n.x])).toEqual([[0, 12.5], [1, 20.5], [2, 55.5]]);
    expect(sys[1].notes.map((n) => n.x)).toEqual([30]);
  });

  it("sílaba partida por quebra de linha: âncoras distribuem as notas nos dois sistemas", () => {
    const notes = [note(0, 0, "f"), note(0, 1, "g")];
    const anchors = [
      { syllableIndex: 0, x: 90, y: 6, pitch: 8 },
      { syllableIndex: 0, x: 5, y: 81, pitch: 9 },
    ];
    const sys = mapSystems(notes, boxes, anchors);
    expect(sys[0].notes.map((n) => n.x)).toEqual([90]);
    expect(sys[1].notes.map((n) => n.x)).toEqual([5]);
  });

  it("contagem divergente → cai no método por boxes (sem quebrar)", () => {
    const notes = [note(1, 0, "g"), note(1, 1, "h")];
    const anchors = [{ syllableIndex: 1, x: 30, y: 81, pitch: 9 }];
    const sys = mapSystems(notes, boxes, anchors);
    expect(sys[1].notes).toHaveLength(2);
    expect(sys[1].notes.map((n) => n.x)).not.toContain(30);
  });

  it("forma melódica divergente (ex.: acidente contado como nota) → fallback", () => {
    const notes = [note(1, 0, "g"), note(1, 1, "h")];
    const anchors = [
      { syllableIndex: 1, x: 30, y: 81, pitch: 9 },
      { syllableIndex: 1, x: 40, y: 81, pitch: 8 }, // desce, mas a nota sobe
    ];
    const sys = mapSystems(notes, boxes, anchors);
    expect(sys[1].notes.map((n) => n.x)).not.toEqual([30, 40]);
  });
});

describe("spreadCoincident (notas empilhadas: pes, scandicus…)", () => {
  it("não mexe em notas já separadas", () => {
    expect(spreadCoincident([10, 30, 50], 8)).toEqual([10, 30, 50]);
  });
  it("par coincidente abre simétrico em torno do x real", () => {
    expect(spreadCoincident([425, 425], 8)).toEqual([421, 429]);
  });
  it("cluster que encosta no vizinho funde e reabre centrado na média", () => {
    // [425,425,434]: par abre p/ 421/429, que fica a 5px do 434 → cluster de 3 em torno de 428
    expect(spreadCoincident([425, 425, 434], 8)).toEqual([420, 428, 436]);
  });
  it("preserva a ordem e o espaçamento mínimo em toda a sequência", () => {
    const out = spreadCoincident([0, 1, 2, 3, 40], 8);
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(8 - 1e-9);
  });
});

describe("mapSystems + âncoras empilhadas", () => {
  it("pes (2 notas no mesmo x) vira 2 colunas distinguíveis em torno do glifo", () => {
    const boxes = new Map<number, SylBox[]>([[0, [{ syllableIndex: 0, x: 0, y: 5, width: 40, height: 10 }]]]);
    const notes = [note(0, 0, "g"), note(0, 1, "h")];
    const anchors = [{ syllableIndex: 0, x: 20, y: 6, pitch: 9 }, { syllableIndex: 0, x: 20, y: 6, pitch: 10 }];
    const xs = mapSystems(notes, boxes, anchors)[0].notes.map((n) => n.x);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(MIN_ANCHOR_DX - 1e-9);
    expect((xs[0] + xs[1]) / 2).toBeCloseTo(20);
  });
});
