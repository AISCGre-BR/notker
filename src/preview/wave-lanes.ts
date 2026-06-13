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
  xRange: [number, number];
  notes: LaneNote[];
}

const Y_BAND_TOL = 8; // px: boxes com |Δy| menor caem no mesmo sistema

/** Agrupa boxes em sistemas por faixa de y (tolerância), de cima p/ baixo. */
function clusterByY(boxes: SylBox[]): SylBox[][] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const bands: SylBox[][] = [];
  for (const b of sorted) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(b.y - last[0].y) <= Y_BAND_TOL) last.push(b);
    else bands.push([b]);
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
    xRange: [Math.min(...band.map((b) => b.x)), Math.max(...band.map((b) => b.x + b.width))],
    notes: [],
  }));

  // contagem de notas por sílaba (pelo índice REAL — o mesmo que indexa as boxes)
  const countBySyl = new Map<number, number>();
  for (const n of notes) countBySyl.set(n.realSyllableIndex, (countBySyl.get(n.realSyllableIndex) ?? 0) + 1);

  for (const n of notes) {
    const boxes = (boxesBySyllable.get(n.realSyllableIndex) ?? [])
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (boxes.length === 0) continue;
    const K = countBySyl.get(n.realSyllableIndex) ?? 1;
    const g = (n.noteInSyllable + 0.5) / K; // fração global da nota na sílaba
    const totalW = boxes.reduce((s, b) => s + b.width, 0) || 1;
    // acha a box cuja faixa cumulativa cobre g
    let acc = 0;
    let chosen = boxes[boxes.length - 1];
    let local = 0.5;
    for (const b of boxes) {
      const frac = b.width / totalW;
      if (g <= acc + frac || b === boxes[boxes.length - 1]) {
        chosen = b;
        local = frac > 0 ? Math.min(1, Math.max(0, (g - acc) / frac)) : 0.5;
        break;
      }
      acc += frac;
    }
    const sysIdx = sysOfBox.get(chosen)!;
    systems[sysIdx].notes.push({ ...n, x: chosen.x + local * chosen.width });
  }

  for (const s of systems) s.notes.sort((a, b) => a.x - b.x);
  return systems;
}

const SW_BASE = 1.7, SW_MIN = 1.0, SW_MAX = 5.0;
const HALO_MAX = 0.55, HALO_SLOPE = 0.42;

/** Fator → espessura do traço. Curva irregular (expoente 0.85; sem razão limpa,
 *  ver memória D-23) saturada em [SW_MIN, SW_MAX]. */
export function factorToStrokeWidth(factor: number): number {
  const w = SW_BASE * Math.pow(Math.max(0.01, factor), 0.85);
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
export const LANE_HEIGHT = 22;       // altura da lane sob cada sistema
const LANE_GAP = 4;                  // folga entre baseline do sistema e a lane

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

    // contorno como polilinha discreta ligando as notas (curvatura suave)
    // Dois passes: 1ª passagem coleta elementos; 2ª appenda em ordem halo→line→hit
    // para garantir z-order correto (halos sempre atrás das linhas).
    const halos: SVGElement[] = [];
    const lines: SVGElement[] = [];
    const hits: SVGElement[] = [];

    let prevX: number | null = null, prevY: number | null = null;
    for (const n of sys.notes) {
      const y = pitchToLaneY(n.pitch, LANE_HEIGHT);
      const key = waveLaneKey(n.syllableIndex, n.noteInSyllable);
      const halo = factorToHaloOpacity(n.factor);
      const d = segPath(prevX, prevY, n.x, y);

      if (halo > 0) {
        const h = document.createElementNS(SVG_NS, "path");
        h.setAttribute("class", "wave-halo");
        h.setAttribute("data-key", key);
        h.setAttribute("d", d);
        h.setAttribute("stroke-width", String(factorToStrokeWidth(n.factor) + 3));
        h.style.opacity = String(halo);
        halos.push(h);
      }

      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("class", "wave-line");
      p.setAttribute("data-key", key);
      p.setAttribute("d", d);
      p.setAttribute("stroke-width", String(factorToStrokeWidth(n.factor)));
      lines.push(p);

      const hit = document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", "wave-hit");
      hit.setAttribute("data-key", key);
      hit.setAttribute("x", String(n.x - 6));
      hit.setAttribute("y", "0");
      hit.setAttribute("width", "12");
      hit.setAttribute("height", String(LANE_HEIGHT));
      hit.addEventListener("pointerdown", (ev) => {
        hooks.onFactorDrag?.(key, n.syllableIndex, n.noteInSyllable, n.factor, (ev as PointerEvent).clientY);
        ev.preventDefault();
      });
      hit.addEventListener("pointerenter", () => hooks.onHover?.(n.realSyllableIndex));
      hit.addEventListener("pointerleave", () => hooks.onHover?.(null));
      hits.push(hit);

      prevX = n.x; prevY = y;
    }

    for (const el of halos) lane.appendChild(el);
    for (const el of lines) lane.appendChild(el);
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

/** Segmento do contorno: diagonal suave da nota anterior à atual + leve apoio. */
function segPath(px: number | null, py: number | null, x: number, y: number): string {
  if (px === null || py === null) return `M ${x - 5},${y} L ${x + 5},${y}`;
  const midX = (px + x) / 2;
  return `M ${px},${py} Q ${midX},${py} ${x},${y}`;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export interface WaveLanes {
  refresh(notes: NoteIdent[]): void;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  setCursor(key: string | null): void;
  destroy(): void;
}

/** Lê as boxes das sílabas reais do SVG vivo (getBBox). Substituível em teste. */
export function readSyllableBoxes(svg: SVGSVGElement): Map<number, SylBox[]> {
  const m = new Map<number, SylBox[]>();
  svg.querySelectorAll<SVGGraphicsElement>('[class*="syllable-"]').forEach((g) => {
    const cls = g.getAttribute("class") ?? "";
    const mm = /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(cls);
    if (!mm) return;
    const idx = Number(mm[1]);
    const b = g.getBBox();
    const arr = m.get(idx) ?? [];
    arr.push({ syllableIndex: idx, x: b.x, y: b.y, width: b.width, height: b.height });
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
    const systems = mapSystems(lastNotes, readBoxes(svg));
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
