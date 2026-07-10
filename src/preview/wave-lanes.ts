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

const SW_BASE = 3.0, SW_MIN = 1.0, SW_MAX = 7.5;
const HALO_MAX = 0.55, HALO_SLOPE = 0.42;

/** Fator → espessura do traço. Default (fator 1) GROSSO o bastante p/ que ENCURTAR
 *  (fator < 1) também seja visível, não só alargar. Curva irregular (expoente 0.9;
 *  sem razão limpa, ver memória D-23) saturada em [SW_MIN, SW_MAX]. */
export function factorToStrokeWidth(factor: number): number {
  const w = SW_BASE * Math.pow(Math.max(0.01, factor), 0.9);
  return Math.min(SW_MAX, Math.max(SW_MIN, w));
}

/** Fator → opacidade do halo rubrica. 0 até fator 1; sobe linear depois, clamp. */
export function factorToHaloOpacity(factor: number): number {
  if (factor <= 1) return 0;
  return Math.min(HALO_MAX, (factor - 1) * HALO_SLOPE);
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
const BASE_Y = LANE_HEIGHT / 2;      // régua RETA: baseline fixa (a melodia vem dos neumas)
const MARK_HALF = Math.round(LANE_HEIGHT * 0.22); // meia-altura do tique — escala com a lane
const END_MARGIN = 5;                // px do trecho da 1ª/última nota e após pausa

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

    // Régua RETA: a melodia se lê dos neumas acima (trechos já alinhados sob a nota);
    // a lane mostra só o RITMO. Dois passes: halos → linhas → marcadores → hits.
    const halos: SVGElement[] = [];
    const lines: SVGElement[] = [];
    const marks: SVGElement[] = [];
    const hits: SVGElement[] = [];
    const guideTop = sys.yTop - laneTop; // y local do topo do sistema (acima da lane)
    const ns = sys.notes;                // ordenadas por x

    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      const prev = ns[i - 1];
      const next = ns[i + 1];
      const key = waveLaneKey(n.syllableIndex, n.noteInSyllable);
      // trecho horizontal: meio-caminho à esquerda → meio-caminho à direita,
      // QUEBRANDO nas pausas (divisio gera um vão entre os trechos).
      const connL = prev !== undefined && !prev.divisioAfter;
      const connR = next !== undefined && !n.divisioAfter;
      const left = connL ? (prev.x + n.x) / 2 : n.x - END_MARGIN;
      const right = connR ? (n.x + next.x) / 2 : n.x + END_MARGIN;
      const d = `M ${left},${BASE_Y} H ${right}`;
      const sw = factorToStrokeWidth(n.factor);
      const halo = factorToHaloOpacity(n.factor);

      if (halo > 0) {
        const h = document.createElementNS(SVG_NS, "path");
        h.setAttribute("class", "wave-halo");
        h.setAttribute("data-key", key);
        h.setAttribute("d", d);
        h.setAttribute("stroke-width", String(sw + 3));
        h.style.opacity = String(halo);
        halos.push(h);
      }

      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("class", "wave-line");
      p.setAttribute("data-key", key);
      p.setAttribute("d", d);
      p.setAttribute("stroke-width", String(sw));
      lines.push(p);

      // marcador de nota — tique vertical curto cruzando a régua (notas discretas)
      const mark = document.createElementNS(SVG_NS, "line");
      mark.setAttribute("class", "wave-dot");
      mark.setAttribute("data-key", key);
      mark.setAttribute("x1", String(n.x));
      mark.setAttribute("x2", String(n.x));
      mark.setAttribute("y1", String(BASE_Y - MARK_HALF));
      mark.setAttribute("y2", String(BASE_Y + MARK_HALF));
      marks.push(mark);

      const hit = document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", "wave-hit");
      hit.setAttribute("data-key", key);
      hit.setAttribute("x", String(n.x - 7));
      hit.setAttribute("y", "0");
      hit.setAttribute("width", "14");
      hit.setAttribute("height", String(LANE_HEIGHT));
      hit.addEventListener("pointerdown", (ev) => {
        hooks.onFactorDrag?.(key, n.syllableIndex, n.noteInSyllable, n.factor, (ev as PointerEvent).clientY);
        ev.preventDefault();
      });
      // hover: nota ATIVA em rubrica forte; IRMÃS do mesmo neuma em rubrica clara
      // (deixa claro qual nota do neuma está em foco); + linha-guia até o neuma.
      const sibSel = `.wave-line[data-key^="${n.syllableIndex}:"], .wave-dot[data-key^="${n.syllableIndex}:"]`;
      hit.addEventListener("pointerenter", () => {
        svg.querySelectorAll(sibSel).forEach((el) => el.classList.add("sibling"));
        p.classList.add("hovered");
        mark.classList.add("hovered");
        const guide = document.createElementNS(SVG_NS, "line");
        guide.setAttribute("class", "wave-guide");
        guide.setAttribute("x1", String(n.x));
        guide.setAttribute("x2", String(n.x));
        guide.setAttribute("y1", String(BASE_Y));
        guide.setAttribute("y2", String(guideTop));
        lane.appendChild(guide); // por cima de tudo, sobre a lane corrente
        (hit as unknown as { _guide?: SVGElement })._guide = guide;
        hooks.onHover?.(n.realSyllableIndex);
      });
      hit.addEventListener("pointerleave", () => {
        svg.querySelectorAll(sibSel).forEach((el) => el.classList.remove("sibling"));
        p.classList.remove("hovered");
        mark.classList.remove("hovered");
        (hit as unknown as { _guide?: SVGElement })._guide?.remove();
        hooks.onHover?.(null);
      });
      hits.push(hit);
    }

    for (const el of halos) lane.appendChild(el);
    for (const el of lines) lane.appendChild(el);
    for (const el of marks) lane.appendChild(el);
    for (const el of hits)  lane.appendChild(el);
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

/** Atualiza ao vivo (sem re-render) o segmento de uma nota durante o arrasto.
 *  Cria o halo na hora se ainda não existir (nota com fator 1 não tem halo inicial). */
export function deformLiveSegment(svg: SVGSVGElement, key: string, factor: number): void {
  const line = svg.querySelector<SVGPathElement>(`.wave-line[data-key="${key}"]`);
  if (!line) return;
  line.setAttribute("stroke-width", String(factorToStrokeWidth(factor)));

  const op = factorToHaloOpacity(factor);
  let halo = svg.querySelector<SVGPathElement>(`.wave-halo[data-key="${key}"]`);
  if (halo) {
    halo.style.opacity = String(op);
    halo.setAttribute("stroke-width", String(factorToStrokeWidth(factor) + 3));
  } else if (op > 0) {
    halo = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    halo.setAttribute("class", "wave-halo");
    halo.setAttribute("data-key", key);
    halo.setAttribute("d", line.getAttribute("d") ?? "");
    halo.setAttribute("stroke-width", String(factorToStrokeWidth(factor) + 3));
    halo.style.opacity = String(op);
    // Insere como primeiro filho da lane (atrás das linhas) para manter z-order halo→line.
    line.parentNode!.insertBefore(halo, line.parentNode!.firstChild);
  }
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

  function draw(): void {
    const svg = getSvg();
    if (!svg) return;
    svg.querySelector(".wave-lane-layer")?.remove();
    if (!on) return;
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
      svg.querySelectorAll(".wave-line.playing").forEach((el) => el.classList.remove("playing"));
      if (key !== null) svg.querySelector(`.wave-line[data-key="${key}"]`)?.classList.add("playing");
    },
    destroy() { getSvg()?.querySelector(".wave-lane-layer")?.remove(); },
  };
}
