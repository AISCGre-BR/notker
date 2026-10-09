import { describe, it, expect } from "vitest";
import { pieceLayouts, layoutPages, composePages, type PdfSink, type ComposePiece, type Box } from "../src/pdf/compose";
import { pageGeometry, PX_TO_PT, MARGIN_PT, TITLE_HEIGHT_PT, TITLE_SIZE_PT, TITLE_GAP_PT } from "../src/pdf/layout";
import { SIDE_BLEED_PX } from "../src/pdf/render";

const svgEl = (id: string): SVGSVGElement => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.id = id;
  return s;
};
const piece = (title: string, ...heightsPx: number[]): ComposePiece =>
  ({ title, lines: heightsPx.map((h, i) => ({ heightPx: h, svg: svgEl(`${title}-${i}`) })) });

function fakeSink() {
  const ops: string[] = [];
  const boxes: Box[] = [];
  const sink: PdfSink = {
    addPage: () => { ops.push("page"); },
    title: (t, cx, top, size) => { ops.push(`title:${t}@${cx.toFixed(2)},${top.toFixed(2)}/${size}`); },
    svg: async (el, box) => { ops.push(`svg:${el.id}`); boxes.push(box); },
    bytes: () => new Uint8Array(),
  };
  return { sink, ops, boxes };
}

describe("composição", () => {
  it("pieceLayouts: px → pt; título vazio não ocupa lugar", () => {
    expect(pieceLayouts([piece("Puer", 100, 40), piece("  ", 80)])).toEqual([
      { titleHeight: TITLE_HEIGHT_PT, staffHeights: [100 * PX_TO_PT, 40 * PX_TO_PT] },
      { titleHeight: 0, staffHeights: [80 * PX_TO_PT] },
    ]);
  });
  it("desenha títulos e pautas na ordem, nas margens, com a largura da linha + folga", async () => {
    const g = pageGeometry("a4");
    const pieces = [piece("Puer", 160, 160), piece("Viderunt", 160)];
    const pages = layoutPages(pieces, g, false);
    const { sink, ops, boxes } = fakeSink();
    await composePages(sink, pieces, pages, g);
    expect(ops).toEqual([
      `title:Puer@${(g.pageW / 2).toFixed(2)},${MARGIN_PT.toFixed(2)}/${TITLE_SIZE_PT}`,
      "svg:Puer-0", "svg:Puer-1",
      expect.stringMatching(/^title:Viderunt@/), "svg:Viderunt-0",
    ]);
    expect(boxes[0].x).toBeCloseTo(MARGIN_PT - SIDE_BLEED_PX * PX_TO_PT, 5);
    expect(boxes[0].y).toBeCloseTo(MARGIN_PT + TITLE_HEIGHT_PT + TITLE_GAP_PT, 5);
    expect(boxes[0].width).toBeCloseTo((g.lineWidthPx + 2 * SIDE_BLEED_PX) * PX_TO_PT, 5);
    expect(boxes[0].height).toBeCloseTo(160 * PX_TO_PT, 5);
    // a pauta (sem a folga) cabe entre as margens
    expect(boxes[0].x + SIDE_BLEED_PX * PX_TO_PT + g.lineWidthPx * PX_TO_PT).toBeLessThanOrEqual(g.pageW - MARGIN_PT + 0.01);
  });
  it("nova página antes de cada página seguinte; 'cada peça em nova página' respeitado", async () => {
    const g = pageGeometry("letter");
    const pieces = [piece("A", 160), piece("B", 160)];
    const { sink, ops } = fakeSink();
    await composePages(sink, pieces, layoutPages(pieces, g, true), g);
    expect(ops.map((o) => o.split(":")[0] === "title" ? o.split("@")[0] : o)).toEqual(["title:A", "svg:A-0", "page", "title:B", "svg:B-0"]);
  });
  it("pauta mais alta que a página: encolhida e centralizada", async () => {
    const g = pageGeometry("a4");
    const tall = (g.contentH / PX_TO_PT) * 2; // o dobro da área útil
    const pieces = [piece("", tall)];
    const { sink, boxes } = fakeSink();
    await composePages(sink, pieces, layoutPages(pieces, g, false), g);
    const fullW = (g.lineWidthPx + 2 * SIDE_BLEED_PX) * PX_TO_PT;
    expect(boxes[0].height).toBeCloseTo(g.contentH, 3);
    expect(boxes[0].width).toBeCloseTo(fullW / 2, 3);
    expect(boxes[0].x + boxes[0].width / 2).toBeCloseTo(g.margin - SIDE_BLEED_PX * PX_TO_PT + fullW / 2, 3);
  });
});
