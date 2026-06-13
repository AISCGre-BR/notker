/** wave-lanes.ts — camada de lanes da onda, injetada no SVG da partitura.
 *  Mapeia bounding-boxes das sílabas em SISTEMAS (linhas da pauta) e distribui
 *  as notas de cada sílaba pela largura da sílaba (ancoragem por posição, não tempo). */

import { staffOffset } from "../gabc/gabc-pitch";

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
