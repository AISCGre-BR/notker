// src/pdf/layout.ts
/** Geometria da página e PAGINADOR do PDF (spec do sub-projeto 3, §2). PURO: nada de DOM.
 *  Unidade: ponto tipográfico (pt, 1/72 pol.), a do jsPDF. A partitura é desenhada em px
 *  CSS (96 por polegada) e entra aqui já convertida (PX_TO_PT). */

export type PageSize = "a4" | "letter";

/** Tamanho da folha em pt, retrato. */
export const PAGE_SIZES: Readonly<Record<PageSize, { w: number; h: number }>> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};
/** Margem fixa de 2 cm nos quatro lados. */
export const MARGIN_PT = (2 / 2.54) * 72;
/** 1 px CSS (96 dpi) em pt (72 dpi). */
export const PX_TO_PT = 72 / 96;
/** Título da peça: corpo, espaço até a 1ª pauta. */
export const TITLE_SIZE_PT = 14;
export const TITLE_HEIGHT_PT = TITLE_SIZE_PT * 1.25;
export const TITLE_GAP_PT = 6;
/** Espaço entre pautas da mesma peça e entre peças (fluxo contínuo). */
export const STAFF_GAP_PT = 6;
export const PIECE_GAP_PT = 28;

export interface PageGeometry {
  size: PageSize;
  pageW: number; pageH: number; margin: number;
  /** Área útil (pt). */
  contentW: number; contentH: number;
  /** Largura de linha da partitura (px CSS) que cabe na área útil. */
  lineWidthPx: number;
}

export function pageGeometry(size: PageSize): PageGeometry {
  const { w, h } = PAGE_SIZES[size];
  const contentW = w - 2 * MARGIN_PT;
  return {
    size, pageW: w, pageH: h, margin: MARGIN_PT,
    contentW, contentH: h - 2 * MARGIN_PT,
    lineWidthPx: Math.floor(contentW / PX_TO_PT),
  };
}

/** Uma peça para o paginador: altura do título (0 = sem título) e de cada pauta, em pt. */
export interface PieceLayout { titleHeight: number; staffHeights: number[] }
export interface PaginateOpts {
  /** Altura útil da página (pt). */
  pageHeight: number;
  newPagePerPiece: boolean;
}
/** Um bloco posto numa página. `y` = topo do bloco a partir do topo da área útil (pt);
 *  `scale` < 1 só quando uma pauta sozinha é mais alta que a página (encolhe para caber). */
export interface Placed {
  piece: number;
  kind: "title" | "staff";
  /** Índice da pauta na peça; -1 no título. */
  index: number;
  y: number;
  height: number;
  scale: number;
}
export type Page = Placed[];

/** Empilha títulos e pautas em páginas. Regras: pauta nunca partida (vai inteira para a
 *  próxima página); título nunca sozinho no pé da página (vai junto com a 1ª pauta);
 *  com `newPagePerPiece`, cada peça começa numa página nova; peças sem pauta são puladas;
 *  uma pauta mais alta que a página vai sozinha numa página, encolhida (`scale`). Sempre
 *  devolve ao menos uma página (vazia se nada coube). */
export function paginate(pieces: PieceLayout[], o: PaginateOpts): Page[] {
  const H = o.pageHeight;
  const pages: Page[] = [[]];
  let y = 0; // fundo do último bloco da página atual
  const page = (): Page => pages[pages.length - 1];
  const newPage = (): void => { if (page().length > 0) { pages.push([]); y = 0; } };
  /** Põe o bloco no topo `top`; encolhe se não couber até o pé (só acontece no topo). */
  const place = (b: Omit<Placed, "y" | "scale">, top: number): void => {
    const room = H - top;
    const scale = b.height > room ? Math.max(room, 0) / b.height : 1;
    page().push({ ...b, y: top, scale });
    y = top + b.height * scale;
  };
  const gapTop = (gap: number): number => (page().length === 0 ? 0 : y + gap);

  pieces.forEach((p, piece) => {
    const staves = p.staffHeights.map((height, index) => ({ height, index })).filter((s) => s.height > 0);
    if (staves.length === 0) return;
    if (o.newPagePerPiece) newPage();
    const head = p.titleHeight > 0 ? p.titleHeight + TITLE_GAP_PT : 0;
    // título + 1ª pauta andam juntos: se não cabem no resto da página, vão para a próxima
    if (page().length > 0 && y + PIECE_GAP_PT + head + staves[0].height > H) newPage();
    let top = gapTop(PIECE_GAP_PT);
    if (p.titleHeight > 0) {
      place({ piece, kind: "title", index: -1, height: p.titleHeight }, top);
      top = y + TITLE_GAP_PT;
    }
    place({ piece, kind: "staff", index: staves[0].index, height: staves[0].height }, top);
    for (const s of staves.slice(1)) {
      if (y + STAFF_GAP_PT + s.height > H) newPage();
      place({ piece, kind: "staff", index: s.index, height: s.height }, gapTop(STAFF_GAP_PT));
    }
  });
  return pages;
}
