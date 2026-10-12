// src/pdf/compose.ts
/** Composição: peças renderizadas → layout → páginas desenhadas num `PdfSink`. A ordem
 *  e as coordenadas saem daqui (testadas com um sink falso); quem fala com jsPDF/svg2pdf
 *  é src/pdf/jspdf-sink.ts. */
import {
  paginate, PX_TO_PT, TITLE_HEIGHT_PT, TITLE_SIZE_PT,
  type PageGeometry, type Page, type PieceLayout,
} from "./layout";
import { SIDE_BLEED_PX, type RenderedLine } from "./render";

export interface Box { x: number; y: number; width: number; height: number }
/** O documento PDF em construção (pt; origem no canto superior esquerdo). Nasce com a
 *  1ª página. */
export interface PdfSink {
  addPage(): void;
  /** Título da peça centralizado em `centerX`, topo do texto em `top`, corpo `size`. */
  title(text: string, centerX: number, top: number, size: number): void;
  /** Desenha o SVG (uma pauta) escalado para caber em `box`. */
  svg(el: SVGSVGElement, box: Box): Promise<void>;
  bytes(): Uint8Array;
}

/** Uma peça pronta para compor: o título da árvore e as pautas recortadas. */
export interface ComposePiece { title: string; lines: RenderedLine[] }

export function pieceLayouts(pieces: readonly ComposePiece[]): PieceLayout[] {
  return pieces.map((p) => ({
    titleHeight: p.title.trim() ? TITLE_HEIGHT_PT : 0,
    staffHeights: p.lines.map((l) => l.heightPx * PX_TO_PT),
  }));
}

export function layoutPages(pieces: readonly ComposePiece[], g: PageGeometry, newPagePerPiece: boolean): Page[] {
  return paginate(pieceLayouts(pieces), { pageHeight: g.contentH, newPagePerPiece });
}

/** Desenha as páginas no sink, na ordem. Pauta: largura da linha + folga lateral, com a
 *  escala do paginador (encolhida, fica centralizada). */
export async function composePages(
  sink: PdfSink, pieces: readonly ComposePiece[], pages: readonly Page[], g: PageGeometry,
): Promise<void> {
  const fullW = (g.lineWidthPx + 2 * SIDE_BLEED_PX) * PX_TO_PT;
  for (let n = 0; n < pages.length; n++) {
    if (n > 0) sink.addPage();
    for (const b of pages[n]) {
      const top = g.margin + b.y;
      if (b.kind === "title") {
        sink.title(pieces[b.piece].title.trim(), g.pageW / 2, top, TITLE_SIZE_PT);
        continue;
      }
      const line = pieces[b.piece].lines[b.index];
      // Recorte horizontal (px): normal = a linha + folga; o custos alarga para a direita.
      const vbX = line.x ?? -SIDE_BLEED_PX;
      const vbW = (line.widthPx ?? g.lineWidthPx + 2 * SIDE_BLEED_PX) * PX_TO_PT;
      const scale = b.scale * Math.min(1, fullW / vbW); // a pauta com o custos cabe na área útil
      const width = vbW * scale;
      const x = g.margin - SIDE_BLEED_PX * PX_TO_PT + (fullW - width) / 2 - (vbX + SIDE_BLEED_PX) * PX_TO_PT * scale;
      await sink.svg(line.svg, { x, y: top, width, height: b.height * scale });
    }
  }
}
