import { describe, it, expect } from "vitest";
import {
  pageGeometry, paginate, MARGIN_PT, PX_TO_PT, TITLE_GAP_PT, STAFF_GAP_PT, PIECE_GAP_PT,
  type PieceLayout, type Page,
} from "../src/pdf/layout";

const H = 700;
const piece = (title: number, ...staves: number[]): PieceLayout => ({ titleHeight: title, staffHeights: staves });
const shape = (pages: Page[]) => pages.map((pg) => pg.map((b) => `${b.piece}${b.kind === "title" ? "T" : b.index}`));

describe("geometria da página", () => {
  it("A4 e Carta em pt, margem de 2 cm, linha da partitura em px que cabe na área útil", () => {
    expect(MARGIN_PT).toBeCloseTo(56.69, 2);
    const a4 = pageGeometry("a4");
    expect([a4.pageW, a4.pageH]).toEqual([595.28, 841.89]);
    expect(a4.contentW).toBeCloseTo(481.89, 2);
    expect(a4.contentH).toBeCloseTo(728.5, 1);
    expect(a4.lineWidthPx).toBe(642);
    expect(a4.lineWidthPx * PX_TO_PT).toBeLessThanOrEqual(a4.contentW);
    const letter = pageGeometry("letter");
    expect([letter.pageW, letter.pageH]).toEqual([612, 792]);
    expect(letter.lineWidthPx).toBe(664);
  });
});

describe("paginador", () => {
  it("fluxo contínuo: título, pautas e a peça seguinte na mesma página, com os espaços fixos", () => {
    const pages = paginate([piece(20, 100, 100), piece(20, 100)], { pageHeight: H, newPagePerPiece: false });
    expect(shape(pages)).toEqual([["0T", "00", "01", "1T", "10"]]);
    const [t0, s0, s1, t1, s10] = pages[0];
    expect(t0.y).toBe(0);
    expect(s0.y).toBe(20 + TITLE_GAP_PT);
    expect(s1.y).toBe(s0.y + 100 + STAFF_GAP_PT);
    expect(t1.y).toBe(s1.y + 100 + PIECE_GAP_PT);
    expect(s10.y).toBe(t1.y + 20 + TITLE_GAP_PT);
    expect(pages[0].every((b) => b.scale === 1)).toBe(true);
  });
  it("pauta que não cabe vai INTEIRA para a próxima página e começa no topo", () => {
    const pages = paginate([piece(0, 300, 300, 300)], { pageHeight: H, newPagePerPiece: false });
    expect(shape(pages)).toEqual([["00", "01"], ["02"]]);
    expect(pages[1][0].y).toBe(0);
  });
  it("título nunca sozinho no pé: se título + 1ª pauta não cabem, os dois vão juntos", () => {
    // sobra 700 - 600 = 100: o título (20) caberia, a 1ª pauta (100) não
    const pages = paginate([piece(0, 600), piece(20, 100)], { pageHeight: H, newPagePerPiece: false });
    expect(shape(pages)).toEqual([["00"], ["1T", "10"]]);
    expect(pages[1][0].y).toBe(0);
  });
  it("cada peça em nova página", () => {
    const pages = paginate([piece(20, 50), piece(20, 50), piece(20, 50)], { pageHeight: H, newPagePerPiece: true });
    expect(shape(pages)).toEqual([["0T", "00"], ["1T", "10"], ["2T", "20"]]);
  });
  it("peça maior que a página atravessa várias páginas", () => {
    const pages = paginate([piece(20, ...Array(12).fill(120))], { pageHeight: H, newPagePerPiece: false });
    expect(pages.length).toBe(3);
    expect(pages.flat().filter((b) => b.kind === "staff").map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const pg of pages) for (const b of pg) expect(b.y + b.height * b.scale).toBeLessThanOrEqual(H);
  });
  it("pauta mais alta que a página vai sozinha e encolhe para caber (scale < 1)", () => {
    const pages = paginate([piece(0, 100, 1400)], { pageHeight: H, newPagePerPiece: false });
    expect(shape(pages)).toEqual([["00"], ["01"]]);
    expect(pages[1][0].scale).toBeCloseTo(0.5, 5);
  });
  it("peça sem pauta é pulada (sem título órfão); pautas de altura 0 também; índice original mantido", () => {
    const pages = paginate([piece(20), piece(20, 0, 80)], { pageHeight: H, newPagePerPiece: true });
    expect(shape(pages)).toEqual([["1T", "11"]]);
  });
  it("nada para pôr: uma página vazia", () => {
    expect(paginate([], { pageHeight: H, newPagePerPiece: false })).toEqual([[]]);
  });
});
