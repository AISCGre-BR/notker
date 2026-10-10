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

/** `left`/`right`: extensão horizontal da tinta (px do SVG, x = 0 na margem esquerda da
 *  pauta). Opcionais: sem eles, vale só a largura da linha. */
export interface LineBox { top: number; height: number; left?: number; right?: number }

/** x e largura do recorte (px): a pauta toda + folga, alargado para a tinta que passa da
 *  largura da linha (o nabc-lib desenha o custos depois de `lineWidthPx`). */
export function lineExtent(box: LineBox, widthPx: number): { x: number; width: number } {
  const x = Math.min(-SIDE_BLEED_PX, (box.left ?? 0) - SIDE_BLEED_PX);
  const r = Math.max(widthPx + SIDE_BLEED_PX, (box.right ?? 0) + SIDE_BLEED_PX);
  return { x, width: r - x };
}

/** Borda direita da TINTA de um glifo (px, mesma origem de `left`/`right`): o avanço do
 *  glifo (a caixa que o navegador mede) pode ser menor que a tinta — é o caso do custos.
 *  `inkRight` = `actualBoundingBoxRight` do canvas, a partir da origem do texto. */
export function glyphInkRight(anchor: string, left: number, right: number, inkRight: number): number {
  const origin = anchor === "end" ? right : anchor === "middle" ? (left + right) / 2 : left;
  return origin + inkRight;
}

let inkCtx: CanvasRenderingContext2D | null | undefined;
/** Maior borda direita da tinta dos glifos de canto (fontes gre*) de `g`; -Infinity se não der para medir. */
function chantInkRight(g: Element, originLeft: number): number {
  if (inkCtx === undefined) inkCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!inkCtx) return -Infinity;
  let max = -Infinity;
  for (const t of g.querySelectorAll("text")) {
    const fam = t.getAttribute("font-family") ?? "";
    const txt = t.textContent ?? "";
    if (!/^gre/.test(fam) || !txt) continue;
    const size = parseFloat(t.getAttribute("font-size") ?? "") || 0;
    if (!size) continue;
    inkCtx.font = `${size}px ${fam}`;
    const m = inkCtx.measureText(txt);
    const r = t.getBoundingClientRect();
    max = Math.max(max, glyphInkRight(t.getAttribute("text-anchor") ?? "start", r.left - originLeft, r.right - originLeft, m.actualBoundingBoxRight));
  }
  return max;
}

/** Letras latinas que o nabc-lib escreve (℣ ℟ A/) num tspan filho, dentro de um tspan
 *  `greextra` — fonte que NÃO tem V/R/A; o PDF não tem fonte de reserva. */
function fixGreextraLetters(root: Element): void {
  for (const el of root.querySelectorAll("tspan")) {
    if (el.hasAttribute("font-family")) continue;
    const parent = el.parentElement;
    if (!parent || parent.getAttribute("font-family") !== "greextra") continue;
    if (/[A-Za-z]/.test(el.textContent ?? "")) el.setAttribute("font-family", TEXT_FONT);
  }
}

/** Caixa vertical de cada `g.ChantLine`, em px do SVG (topo = 0 do SVG). Pauta sem altura
 *  (vazia) sai com height 0 — o paginador a pula. */
export function measureLines(svg: SVGSVGElement): LineBox[] {
  const o = svg.getBoundingClientRect();
  return [...svg.querySelectorAll<SVGGElement>("g.ChantLine")].map((g) => {
    const r = g.getBoundingClientRect();
    const ink = chantInkRight(g, o.left);
    return { top: r.top - o.top, height: Math.max(0, r.bottom - r.top), left: r.left - o.left, right: Math.max(r.right - o.left, ink) };
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
  fixGreextraLetters(clone);
  const { x, width: w } = lineExtent(box, widthPx);
  clone.setAttribute("viewBox", `${x} ${box.top} ${w} ${box.height}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(box.height));
  return clone;
}

/** `x`/`widthPx`: recorte horizontal (px); sem eles, a largura da linha + folga. */
export interface RenderedLine { heightPx: number; svg: SVGSVGElement; x?: number; widthPx?: number }
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
    const lines = measureLines(svg).map((b, i) => {
      const e = lineExtent(b, o.widthPx);
      return { heightPx: b.height, svg: isolateLine(svg, i, b, o.widthPx), x: e.x, widthPx: e.width };
    });
    svg.remove();
    for (const l of lines) box.appendChild(l.svg); // o svg2pdf.js lê estilos de elementos no documento
    return { lines, dispose: () => box.remove() };
  } catch (e) {
    box.remove();
    throw e;
  }
}
