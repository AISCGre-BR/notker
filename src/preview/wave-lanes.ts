/** wave-lanes.ts — camada de lanes da onda, injetada no SVG da partitura.
 *  Mapeia bounding-boxes das sílabas em SISTEMAS (linhas da pauta) e distribui
 *  as notas de cada sílaba pela largura da sílaba (ancoragem por posição, não tempo). */

import { staffOffset } from "../gabc/gabc-pitch";
import { WAVE_MIN, WAVE_MAX } from "../tuotilo/wave";

export interface SylBox {
  syllableIndex: number;
  x: number; y: number; width: number; height: number;
}

export interface NoteIdent {
  syllableIndex: number;     // índice INTERNO da timeline — chave de data-key/cursor/overlay
  realSyllableIndex: number; // índice REAL do SVG (syllable-N) — acha a box e acende a sílaba
  noteInSyllable: number;
  pitch: string;
  alt: number;
  factor: number;
  divisioAfter: "minima" | "minor" | "maior" | "finalis" | null;
}

export interface LaneNote extends NoteIdent {
  x: number; // posição (centro) no espaço de coordenadas do SVG
}

export interface System {
  yBaseline: number;      // base dos glifos do sistema (y + height máx)
  yTop: number;           // topo dos glifos do sistema (y mín) — alvo da linha-guia
  xRange: [number, number];
  notes: LaneNote[];
}

const BAND_GAP_FACTOR = 0.45; // fração da altura mediana: gap maior que isso = novo sistema

// Espalhamento quando a onda está ativa (decisão UAT-8, 2026-07-09, validada no
// probe debug/onda-probe): WAVE_SPREAD multiplica os espaços ELÁSTICOS do nabc-lib
// (Dies com onda ativa: 10 sistemas, divisões legíveis — sem onda são 5); como ele
// não desgruda notas do MESMO glifo (clivis, pes, …), MIN_NOTE_DX sobe junto para
// a lane acompanhar a abertura. WAVE_LINE_SPACING_PX é o vão vertical extra entre
// sistemas (≈ altura da lane + folga) — os dois entram juntos em setWaveSpacing.
export const WAVE_SPREAD = 3.4;
export const WAVE_LINE_SPACING_PX = 64;
export const MIN_NOTE_DX = 24; // px mínimos por nota na lane (separa notas de neumas compactos)

/** Agrupa boxes em SISTEMAS (linhas da pauta) por GAP nos TOPOS (y).
 *  Validado contra coordenadas REAIS do nabc-lib (Dies sanctificatus, 121 boxes):
 *  cada sílaba emite vários boxes (neuma, NABC, coluna full-height ~staff, texto) e
 *  os boxes full-height de linhas vizinhas chegam a se sobrepor por ~2px — então
 *  fundir por intervalo encadeia tudo. Já o ESPAÇAMENTO entre sistemas (~127px) supera
 *  de longe a dispersão de topos dentro do sistema (≤24px), então separar onde o gap
 *  entre topos consecutivos (ordenados) excede ~0,45×altura-mediana é robusto numa
 *  ampla faixa (0,25–0,5 dão os 5 sistemas certos nos dados reais). */
function clusterByY(boxes: SylBox[]): SylBox[][] {
  if (boxes.length === 0) return [];
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const hs = sorted.map((b) => b.height).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)] || 1;
  const thr = BAND_GAP_FACTOR * medH;
  const bands: SylBox[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y > thr) bands.push([sorted[i]]);
    else bands[bands.length - 1].push(sorted[i]);
  }
  return bands;
}

export function mapSystems(notes: NoteIdent[], boxesBySyllable: Map<number, SylBox[]>): System[] {
  const allBoxes = [...boxesBySyllable.values()].flat();
  const bands = clusterByY(allBoxes);
  // índice box → sistema
  const sysOfBox = new Map<SylBox, number>();
  bands.forEach((band, i) => band.forEach((b) => sysOfBox.set(b, i)));

  const systems: System[] = bands.map((band) => ({
    yBaseline: Math.max(...band.map((b) => b.y + b.height)),
    yTop: Math.min(...band.map((b) => b.y)),
    xRange: [Math.min(...band.map((b) => b.x)), Math.max(...band.map((b) => b.x + b.width))],
    notes: [],
  }));

  // agrupa notas por sílaba REAL (ordem do documento preservada)
  const bySyl = new Map<number, NoteIdent[]>();
  for (const n of notes) {
    const arr = bySyl.get(n.realSyllableIndex);
    if (arr) arr.push(n);
    else bySyl.set(n.realSyllableIndex, [n]);
  }

  for (const [realIdx, sylNotes] of bySyl) {
    const boxes = (boxesBySyllable.get(realIdx) ?? []).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    if (boxes.length === 0) continue;
    const K = sylNotes.length;
    const totalW = boxes.reduce((s, b) => s + b.width, 0) || 1;

    // 1) atribui cada nota a uma box (fração cumulativa por noteInSyllable)
    const perBox: NoteIdent[][] = boxes.map(() => []);
    for (const n of sylNotes) {
      const g = (n.noteInSyllable + 0.5) / K;
      let acc = 0, bi = boxes.length - 1;
      for (let b = 0; b < boxes.length; b++) {
        const frac = boxes[b].width / totalW;
        if (g <= acc + frac) { bi = b; break; }
        acc += frac;
      }
      perBox[bi].push(n);
    }

    // 2) distribui DENTRO de cada box com ESPAÇO MÍNIMO por nota (centrado no glifo):
    //    neumas compactos (clivis, pes, …) ganham notas distinguíveis/clicáveis mesmo
    //    quando o glifo é estreito — span = max(largura do glifo, k × MIN_NOTE_DX).
    boxes.forEach((box, bi) => {
      const arr = perBox[bi];
      const k = arr.length;
      if (k === 0) return;
      const span = Math.max(box.width, k * MIN_NOTE_DX);
      const start = box.x + box.width / 2 - span / 2;
      const sysIdx = sysOfBox.get(box)!;
      arr.forEach((n, j) => systems[sysIdx].notes.push({ ...n, x: start + ((j + 0.5) / k) * span }));
    });
  }

  for (const s of systems) s.notes.sort((a, b) => a.x - b.x);
  return systems;
}

const BAR_UNIT = 11, BAR_MIN = 5, BAR_MAX = 25;

/** Fator → ALTURA da coluna de mensura (rework 2026-07-10). Espessura de traço
 *  era ilegível (meio-fator ≈ 1px); altura dá ~5-6px por meio-fator. Linear no
 *  fator, com piso (coluna nunca some) e teto (cabe na lane de 28px). */
export function factorToBarHeight(factor: number): number {
  return Math.min(BAR_MAX, Math.max(BAR_MIN, Math.round(BAR_UNIT * factor)));
}

/** Altura (y local na lane) a partir do pitch. staffOffset 0..12; inverte
 *  (agudo = y menor). Reaproveita a régua de gabc-pitch. */
export function pitchToLaneY(pitch: string, laneHeight: number): number {
  const off = staffOffset(pitch);
  const o = isNaN(off) ? 6 : Math.min(12, Math.max(0, off));
  return laneHeight - (o / 12) * (laneHeight - 4) - 2;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export const LANE_HEIGHT = 28;       // altura da lane sob cada sistema (traço/alvo maiores)
const LANE_GAP = 10;                 // folga entre baseline do sistema e a lane (respiro)
const BASE_LINE_Y = LANE_HEIGHT - 2; // régua-base no pé da lane — as colunas sobem dela
const COL_MAX_HALF = 9;              // meia-largura máxima da coluna (col ≤ 18px)
const COL_GAP = 1;                   // vão mínimo entre colunas vizinhas (identidade da nota)
const BREATH_H = 9;                  // altura da vírgula de respiração (divisio)
const BAND_PAD = 12;                 // extensão da zebra além da 1ª/última nota da sílaba

export interface LaneHooks {
  onFactorDrag?: (key: string, syllableIndex: number, noteInSyllable: number, startFactor: number, startClientY: number) => void;
  onHover?: (syllableIndex: number | null) => void;
}

export function waveLaneKey(syllableIndex: number, noteInSyllable: number): string {
  return `${syllableIndex}:${noteInSyllable}`;
}

/** (Re)injeta a camada de lanes no svg. Remove a camada anterior antes. */
export function renderWaveLanes(svg: SVGSVGElement, systems: System[], hooks: LaneHooks): void {
  svg.querySelector(".wave-lane-layer")?.remove();
  const layer = document.createElementNS(SVG_NS, "g");
  layer.setAttribute("class", "wave-lane-layer");

  for (const sys of systems) {
    const laneTop = sys.yBaseline + LANE_GAP;
    const lane = document.createElementNS(SVG_NS, "g");
    lane.setAttribute("class", "wave-lane");
    lane.setAttribute("transform", `translate(0,${laneTop})`);

    // Colunas de mensura (rework 2026-07-10): cada nota é uma COLUNA discreta que
    // sobe da régua-base em direção ao seu neuma; a ALTURA codifica o fator.
    // Ordem de pintura: zebra → régua-base → respirações → colunas → hits.
    const bands: SVGElement[] = [];
    const cols: SVGElement[] = [];
    const breaths: SVGElement[] = [];
    const hits: SVGElement[] = [];
    const guideTop = sys.yTop - laneTop; // y local do topo do sistema (acima da lane)
    const ns = sys.notes;                // ordenadas por x

    // Zebra por sílaba: faixa de fundo nas sílabas ALTERNADAS (agrupa "estas
    // notas são da mesma sílaba" sem desenhar contorno). Corre por RUNS de
    // syllableIndex consecutivo na ordem de x. PREMISSA: dentro de um sistema
    // as notas de uma sílaba são contíguas em x (mapSystems centra cada nota
    // na sua box; intercalar exigiria boxes de sílabas entrelaçadas — não
    // observado nos dados reais; se ocorrer, a sílaba conta como 2 runs e a
    // alternância local se desloca, sem quebrar nada além da estética).
    let runStart = 0, runOrdinal = 0;
    for (let i = 1; i <= ns.length; i++) {
      if (i < ns.length && ns[i].syllableIndex === ns[runStart].syllableIndex) continue;
      if (runOrdinal % 2 === 1) {
        const first = ns[runStart], last = ns[i - 1];
        const left = runStart > 0 ? (ns[runStart - 1].x + first.x) / 2 : first.x - BAND_PAD;
        const right = i < ns.length ? (last.x + ns[i].x) / 2 : last.x + BAND_PAD;
        const band = document.createElementNS(SVG_NS, "rect");
        band.setAttribute("class", "wave-band");
        band.setAttribute("x", String(left));
        band.setAttribute("y", "0");
        band.setAttribute("width", String(Math.max(0, right - left)));
        band.setAttribute("height", String(LANE_HEIGHT));
        bands.push(band);
      }
      runStart = i; runOrdinal++;
    }

    // Régua-base: hairline no pé da lane, extensão do sistema.
    const base = document.createElementNS(SVG_NS, "line");
    base.setAttribute("class", "wave-base");
    base.setAttribute("x1", String(sys.xRange[0] - 4));
    base.setAttribute("x2", String(sys.xRange[1] + 4));
    base.setAttribute("y1", String(BASE_LINE_Y));
    base.setAttribute("y2", String(BASE_LINE_Y));

    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      const prev = ns[i - 1];
      const next = ns[i + 1];
      const key = waveLaneKey(n.syllableIndex, n.noteInSyllable);

      // Largura da coluna: centrada no x da nota, recuada dos pontos médios
      // com os vizinhos (colunas DISCRETAS — a fronteira entre notas é o vão).
      const left = Math.max(n.x - COL_MAX_HALF, prev ? (prev.x + n.x) / 2 + COL_GAP : n.x - COL_MAX_HALF);
      const right = Math.min(n.x + COL_MAX_HALF, next ? (n.x + next.x) / 2 - COL_GAP : n.x + COL_MAX_HALF);
      const w = Math.max(3, right - left); // notas ~coincidentes: fatia mínima visível
      const h = factorToBarHeight(n.factor);

      const col = document.createElementNS(SVG_NS, "rect");
      col.setAttribute("class", "wave-col" + (Math.abs(n.factor - 1) > 1e-9 ? " edited" : ""));
      col.setAttribute("data-key", key);
      col.setAttribute("data-real-syl", String(n.realSyllableIndex));
      col.setAttribute("x", String(right - left >= 3 ? left : n.x - w / 2));
      col.setAttribute("y", String(BASE_LINE_Y - h));
      col.setAttribute("width", String(w));
      col.setAttribute("height", String(h));
      cols.push(col);

      // Pausa (divisio) vira respiração INCLINADA (barra "/" como na notação —
      // não confunde com coluna curta) no ponto médio até a próxima nota; na
      // última nota do sistema (finalis de fim de linha), logo à direita dela.
      if (n.divisioAfter) {
        const bx = next ? (n.x + next.x) / 2 : n.x + BAND_PAD;
        const breath = document.createElementNS(SVG_NS, "line");
        breath.setAttribute("class", "wave-breath");
        breath.setAttribute("x1", String(bx - 2));
        breath.setAttribute("x2", String(bx + 2));
        breath.setAttribute("y1", String(BASE_LINE_Y - 1));
        breath.setAttribute("y2", String(BASE_LINE_Y - BREATH_H));
        breaths.push(breath);
      }

      const hit = document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", "wave-hit");
      hit.setAttribute("data-key", key);
      hit.setAttribute("x", String(Math.min(left, n.x - 7) - 2));
      hit.setAttribute("y", "0");
      hit.setAttribute("width", String(Math.max(right, n.x + 7) - Math.min(left, n.x - 7) + 4));
      hit.setAttribute("height", String(LANE_HEIGHT));
      hit.addEventListener("pointerdown", (ev) => {
        hooks.onFactorDrag?.(key, n.syllableIndex, n.noteInSyllable, n.factor, (ev as PointerEvent).clientY);
        ev.preventDefault();
      });
      // hover: coluna ATIVA em rubrica forte; IRMÃS da sílaba em rubrica clara;
      // + linha-guia do TOPO da coluna até o neuma correspondente.
      const sibSel = `.wave-col[data-key^="${n.syllableIndex}:"]`;
      hit.addEventListener("pointerenter", () => {
        svg.querySelectorAll(sibSel).forEach((el) => el.classList.add("sibling"));
        col.classList.add("hovered");
        const guide = document.createElementNS(SVG_NS, "line");
        guide.setAttribute("class", "wave-guide");
        guide.setAttribute("x1", String(n.x));
        guide.setAttribute("x2", String(n.x));
        guide.setAttribute("y1", String(Number(col.getAttribute("y"))));
        guide.setAttribute("y2", String(guideTop));
        lane.appendChild(guide); // por cima de tudo, sobre a lane corrente
        (hit as unknown as { _guide?: SVGElement })._guide = guide;
        hooks.onHover?.(n.realSyllableIndex);
      });
      hit.addEventListener("pointerleave", () => {
        svg.querySelectorAll(sibSel).forEach((el) => el.classList.remove("sibling"));
        col.classList.remove("hovered");
        (hit as unknown as { _guide?: SVGElement })._guide?.remove();
        hooks.onHover?.(null);
      });
      hits.push(hit);
    }

    for (const el of bands) lane.appendChild(el);
    lane.appendChild(base);
    for (const el of breaths) lane.appendChild(el);
    for (const el of cols) lane.appendChild(el);
    for (const el of hits) lane.appendChild(el);
    layer.appendChild(lane);
  }
  svg.appendChild(layer);
}

const DRAG_PX_PER_DOUBLE = 80; // 80px = dobra/metade o fator

/** Fator a partir do arrasto vertical (exponencial; cima alarga). Saturado. */
export function factorFromDrag(startFactor: number, startClientY: number, nowClientY: number): number {
  const dy = startClientY - nowClientY; // cima = positivo
  const f = startFactor * Math.pow(2, dy / DRAG_PX_PER_DOUBLE);
  return Math.min(WAVE_MAX, Math.max(WAVE_MIN, f));
}

/** Atualiza ao vivo (sem re-render) a COLUNA de uma nota durante o arrasto:
 *  pé fixo na régua-base, altura acompanha o fator; classe edited espelha ≠1. */
export function deformLiveSegment(svg: SVGSVGElement, key: string, factor: number): void {
  const col = svg.querySelector<SVGRectElement>(`.wave-col[data-key="${key}"]`);
  if (!col) return;
  const h = factorToBarHeight(factor);
  col.setAttribute("y", String(BASE_LINE_Y - h));
  col.setAttribute("height", String(h));
  col.classList.toggle("edited", Math.abs(factor - 1) > 1e-9);
}

// ─── Controller ───────────────────────────────────────────────────────────────

export interface WaveLanes {
  refresh(notes: NoteIdent[]): void;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  setCursor(key: string | null): void;
  destroy(): void;
}

/** Matriz afim 2D (formato SVGMatrix/DOMMatrix). */
interface Affine { a: number; b: number; c: number; d: number; e: number; f: number; }
interface BBox { x: number; y: number; width: number; height: number; }

/** Transforma um bbox LOCAL para o espaço de usuário do <svg> via a CTM do elemento.
 *  O nabc-lib posiciona tudo com `transform="translate(...)"` em <g> aninhados
 *  (root-group + linhas + elementos) e o getBBox IGNORA esses transforms — daí a
 *  necessidade de aplicar a CTM. Transforma 2 cantos opostos (cobre translate+escala;
 *  notação não tem rotação). CTM nula → devolve o bbox cru (fallback seguro). */
export function bboxToRoot(b: BBox, m: Affine | null): BBox {
  if (!m) return b;
  const tx = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  const p1 = tx(b.x, b.y);
  const p2 = tx(b.x + b.width, b.y + b.height);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

/** Lê as boxes das sílabas reais do SVG vivo, JÁ no espaço de usuário do <svg>
 *  (getBBox local + getCTM). Substituível em teste (getBBox/getCTM não existem no jsdom). */
export function readSyllableBoxes(svg: SVGSVGElement): Map<number, SylBox[]> {
  const m = new Map<number, SylBox[]>();
  svg.querySelectorAll<SVGGraphicsElement>('[class*="syllable-"]').forEach((g) => {
    const cls = g.getAttribute("class") ?? "";
    const mm = /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(cls);
    if (!mm) return;
    const idx = Number(mm[1]);
    const root = bboxToRoot(g.getBBox(), g.getCTM());
    const arr = m.get(idx) ?? [];
    arr.push({ syllableIndex: idx, x: root.x, y: root.y, width: root.width, height: root.height });
    m.set(idx, arr);
  });
  return m;
}

export function createWaveLanes(
  getSvg: () => SVGSVGElement | null,
  hooks: LaneHooks,
  opts: { readBoxes?: (svg: SVGSVGElement) => Map<number, SylBox[]> } = {},
): WaveLanes {
  const readBoxes = opts.readBoxes ?? readSyllableBoxes;
  let on = false;
  let lastNotes: NoteIdent[] = [];

  /** Elo bidirecional pauta → lane: pairar sobre uma sílaba na PARTITURA acende
   *  as colunas dela (score-hover). Delegado no <svg> (sobrevive aos re-renders
   *  internos); flag no elemento evita duplicar — o svg é trocado a cada render
   *  do nabc-lib, o que zera a flag naturalmente. */
  function bindScoreHover(svg: SVGSVGElement): void {
    const flagged = svg as unknown as { __waveScoreHover?: boolean };
    if (flagged.__waveScoreHover) return;
    flagged.__waveScoreHover = true;
    const clear = () =>
      svg.querySelectorAll(".wave-col.score-hover").forEach((el) => el.classList.remove("score-hover"));
    svg.addEventListener("pointerover", (e) => {
      if (!on) return;
      clear();
      const g = (e.target as Element).closest?.('[class*="syllable-"]');
      const mm = g ? /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(g.getAttribute("class") ?? "") : null;
      if (!mm) return;
      svg.querySelectorAll(`.wave-col[data-real-syl="${mm[1]}"]`).forEach((el) => el.classList.add("score-hover"));
    });
    svg.addEventListener("pointerleave", clear);
  }

  function draw(): void {
    const svg = getSvg();
    if (!svg) return;
    svg.querySelector(".wave-lane-layer")?.remove();
    if (!on) return;
    bindScoreHover(svg);
    const boxes = readBoxes(svg);
    const systems = mapSystems(lastNotes, boxes);
    // Dump de diagnóstico opt-in: `window.__ondaDebug = true` no console antes de
    // ligar a onda imprime as boxes reais e os sistemas detectados (para calibrar).
    if (typeof window !== "undefined" && (window as unknown as { __ondaDebug?: boolean }).__ondaDebug) {
      const boxSummary = [...boxes.entries()].map(([idx, bs]) =>
        bs.map((b) => `#${idx} x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} w=${b.width.toFixed(0)} h=${b.height.toFixed(0)}`));
      console.debug("[onda] boxes (espaço svg):", boxSummary.flat());
      console.debug("[onda] sistemas detectados:", systems.map((s, i) =>
        `sys${i} yBaseline=${s.yBaseline.toFixed(0)} notas=${s.notes.length} x=[${s.xRange[0].toFixed(0)},${s.xRange[1].toFixed(0)}]`));
    }
    renderWaveLanes(svg, systems, hooks);
  }

  return {
    refresh(notes) { lastNotes = notes; draw(); },
    setEnabled(v) { on = v; draw(); },
    enabled: () => on,
    setCursor(key) {
      const svg = getSvg();
      if (!svg) return;
      svg.querySelectorAll(".wave-col.playing").forEach((el) => el.classList.remove("playing"));
      if (key !== null) svg.querySelector(`.wave-col[data-key="${key}"]`)?.classList.add("playing");
    },
    destroy() { getSvg()?.querySelector(".wave-lane-layer")?.remove(); },
  };
}
