/** note-anchors.ts — posições REAIS das cabeças de nota, lidas do modelo de layout
 *  do nabc-lib depois do render (linhas → sílabas → segmentos → visualizers).
 *  Substitui a síntese por largura de boxes, que desalinhava melismas (o nabc-lib
 *  emite 2 <g syllable-N> aninhados com o mesmo translate, e a box inclui texto e
 *  NABC). O SVG aninha translate(line.x, line.y) → translate(syl.x) → translate(seg.x)
 *  → x do glifo, sob o root-group; aqui somamos a mesma cadeia. */
import type { NoteAnchor } from "./engine";

/** Acidentes: o nabc-lib os desenha como glifo COM nota, mas não são notas cantadas
 *  (a timeline do Tuotilo também os exclui). */
const ACCIDENTAL = /^(Flat|Sharp|Natural)/;

/** Largura aproximada de uma cabeça de nota (greciliae, tamanho padrão do nabc-lib). */
const HEAD_W = 9;

interface Bounds { x: number; y: number; width: number }
interface VisualizerLike { bounds?: Bounds; notes?: { pitch: number }[]; _glyph?: { name?: string } }
interface SegmentLike { bounds?: Bounds; visualizers?: VisualizerLike[] }
interface SyllableLike { index?: number; bounds?: Bounds; segments?: SegmentLike[] }
interface LineLike { bounds?: Bounds; _syllables?: SyllableLike[] }
export interface LayoutLike { lines?: LineLike[] }

/** Centro da j-ésima cabeça num glifo de largura w com k notas (ligaduras como
 *  clivis/torculus põem as cabeças da esquerda p/ a direita, de borda a borda). */
export function headCenter(w: number, k: number, j: number): number {
  if (k <= 1) return w / 2;
  const head = Math.min(HEAD_W, w);
  return head / 2 + (j * (w - head)) / (k - 1);
}

export function extractNoteAnchors(layout: LayoutLike, root: { x: number; y: number }): NoteAnchor[] {
  // 1) visualizers com nota, em ordem de documento, já em coordenadas do <svg>
  const items: { syl: number; x: number; y: number; w: number; notes: { pitch: number }[] }[] = [];
  for (const line of layout.lines ?? []) {
    const lx = root.x + (line.bounds?.x ?? 0);
    const ly = root.y + (line.bounds?.y ?? 0);
    for (const syl of line._syllables ?? []) {
      if (syl.index == null) continue; // clave de início de linha (sem syllable-N)
      const sx = lx + (syl.bounds?.x ?? 0);
      for (const seg of syl.segments ?? []) {
        const gx = sx + (seg.bounds?.x ?? 0);
        for (const v of seg.visualizers ?? []) {
          if (!v.notes || v.notes.length === 0 || !v.bounds) continue;
          if (ACCIDENTAL.test(v._glyph?.name ?? "")) continue;
          items.push({ syl: syl.index, x: gx + v.bounds.x, y: ly, w: v.bounds.width, notes: v.notes });
        }
      }
    }
  }
  // 2) um glifo repartido em vários visualizers (bivirga, inclusive atravessando a
  //    quebra de linha) entrega o MESMO array de notas a cada um: 1 nota por visualizer.
  const out: NoteAnchor[] = [];
  for (let i = 0; i < items.length; ) {
    let j = i + 1;
    while (j < items.length && items[j].notes === items[i].notes) j++;
    const group = items.slice(i, j);
    const notes = items[i].notes;
    if (group.length > 1 && group.length === notes.length) {
      group.forEach((it, k) => out.push({ syllableIndex: it.syl, x: it.x + it.w / 2, y: it.y, pitch: notes[k].pitch }));
    } else {
      const it = group[0]; // grupo inesperado: 1º visualizer carrega as notas
      notes.forEach((n, k) => out.push({
        syllableIndex: it.syl, x: it.x + headCenter(it.w, notes.length, k), y: it.y, pitch: n.pitch,
      }));
    }
    i = j;
  }
  return out;
}

/** translate(x, y) do <g class="root-group"> (0,0 se ausente). */
export function rootOffset(svg: Element | null): { x: number; y: number } {
  const t = svg?.querySelector(".root-group")?.getAttribute("transform") ?? "";
  const m = /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/.exec(t);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}
