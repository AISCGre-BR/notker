// src/pdf/render.ts
/** Desenha UMA peça para o PDF com o motor do preview (nabc-lib) e a corta em PAUTAS.
 *  O nabc-lib não expõe as linhas, mas cada uma sai no SVG como `<g class="ChantLine"
 *  transform="translate(0,y)">` (pauta, notas, neumas, capitular e letra dentro). A altura
 *  de cada pauta é a caixa REAL desenhada (getBoundingClientRect — não o atributo
 *  `height` do SVG, que corta a letra); cada pauta vira um SVG próprio (clone só com ela,
 *  `viewBox` recortado) que o svg2pdf.js converte. Precisa de layout real: o host fica no
 *  documento, fora da tela (#measure-host). */
import type { Family } from "../neume/types";
import { TEXT_FONT } from "./fonts";

/** Folga lateral (px) do recorte: a clave sai ~1 px antes do x = 0. */
export const SIDE_BLEED_PX = 2;

/** Ajustes do ChantContext para o PDF. O resto fica no padrão da lib, como no preview. */
export function pdfContextSettings(o: { family: Family; widthPx: number; red: boolean }): Record<string, unknown> {
  return {
    lineWidthPx: o.widthPx,
    nabcMode: o.family === "laon" ? "laon" : "gall",
    nabcColor: o.red ? "red" : "#000000", // "red" = o padrão da lib (o do preview)
    lyricTextFont: TEXT_FONT,
    dropCapTextFont: TEXT_FONT,  // copiada da letra no construtor: precisa ser refeita
    annotationTextFont: TEXT_FONT,
    renderInteractiveElements: false, // sem retângulos de clique
  };
}

/** Corpo do gabc (depois do `%%`), como o preview passa ao nabc-lib. */
export function gabcBody(doc: string): string {
  const sep = doc.indexOf("%%");
  return sep >= 0 ? doc.slice(sep + 2) : doc;
}

export interface LineBox { top: number; height: number }

/** Caixa vertical de cada `g.ChantLine`, em px do SVG (topo = 0 do SVG). Pauta sem altura
 *  (vazia) sai com height 0 — o paginador a pula. */
export function measureLines(svg: SVGSVGElement): LineBox[] {
  const origin = svg.getBoundingClientRect().top;
  return [...svg.querySelectorAll<SVGGElement>("g.ChantLine")].map((g) => {
    const r = g.getBoundingClientRect();
    return { top: r.top - origin, height: Math.max(0, r.bottom - r.top) };
  });
}

/** Clone do SVG só com a pauta `index`, recortado em `box` pelo viewBox, com largura
 *  `widthPx` + folga dos dois lados. Sai sem o fundo branco nem o texto de comentário
 *  (a folha do PDF já é branca). */
export function isolateLine(svg: SVGSVGElement, index: number, box: LineBox, widthPx: number): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("g.ChantLine").forEach((g, i) => { if (i !== index) g.remove(); });
  for (const el of [...clone.children]) {
    if (el.tagName.toLowerCase() === "rect" || el.classList.contains("commentary")) el.remove();
  }
  const w = widthPx + 2 * SIDE_BLEED_PX;
  clone.setAttribute("viewBox", `${-SIDE_BLEED_PX} ${box.top} ${w} ${box.height}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(box.height));
  return clone;
}

export interface RenderedLine { heightPx: number; svg: SVGSVGElement }
export interface RenderedPiece { lines: RenderedLine[]; dispose(): void }

/** Renderiza e corta a peça (navegador). Os clones ficam no `host` até `dispose()`.
 *  Lança se o nabc-lib lançar. */
export async function renderPiece(
  content: string, o: { family: Family; widthPx: number; red: boolean; host: HTMLElement },
): Promise<RenderedPiece> {
  const [lib, chantFonts, textFont] = await Promise.all([
    import("@testneumz/nabc-lib"),
    import("../preview/nabc-fonts"),
    import("./text-font"),
  ]);
  // As fontes precisam estar no document.fonts ANTES de medir (letra e glifos).
  await Promise.all([chantFonts.ensureChantFonts(), textFont.ensurePdfTextFont()]);
  const box = document.createElement("div");
  box.style.width = `${o.widthPx + 2 * SIDE_BLEED_PX}px`;
  o.host.appendChild(box);
  try {
    const ctx = new lib.ChantContext();
    Object.assign(ctx, pdfContextSettings(o));
    const score = new lib.GregorioScore(ctx);
    score.interprete(gabcBody(content));
    score.determineElements();
    new lib.GregorianChantSVGRenderer(box).renderSvg(score);
    const svg = box.querySelector("svg");
    if (!svg) return { lines: [], dispose: () => box.remove() };
    const lines = measureLines(svg).map((b, i) => ({ heightPx: b.height, svg: isolateLine(svg, i, b, o.widthPx) }));
    svg.remove();
    for (const l of lines) box.appendChild(l.svg); // o svg2pdf.js lê estilos de elementos no documento
    return { lines, dispose: () => box.remove() };
  } catch (e) {
    box.remove();
    throw e;
  }
}
