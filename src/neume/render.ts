import type { GlyphSvg } from "./types";
export function glyphSvgEl(svg: GlyphSvg, sizePx = 28): SVGSVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", svg.viewBox);
  el.setAttribute("height", String(sizePx));
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", svg.path);
  p.setAttribute("fill", "currentColor");
  el.appendChild(p);
  return el;
}

/** Miniatura de qualquer entrada: glifo da fonte; para sequências (do catálogo ou do
 *  usuário) os glifos das partes lado a lado; sem nada disso, o código nabc em mono. */
export function neumeThumb(
  e: { svg?: GlyphSvg; partSvgs?: GlyphSvg[]; nabc: string; synthetic?: boolean },
  sizePx = 28,
): Element {
  if (e.partSvgs?.length && (e.synthetic || !e.svg)) {
    const span = document.createElement("span");
    span.className = "neume-thumb neume-thumb--parts";
    for (const p of e.partSvgs) span.appendChild(glyphSvgEl(p, sizePx));
    return span;
  }
  if (e.svg) return glyphSvgEl(e.svg, sizePx);
  const code = document.createElement("span");
  code.className = "neume-thumb neume-thumb--code";
  code.textContent = e.nabc;
  return code;
}
