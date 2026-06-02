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
