const STRONG = "hl-strong";

export function clearHighlight(svg: SVGSVGElement | Element): void {
  svg.querySelectorAll("." + STRONG).forEach((el) => el.classList.remove(STRONG));
}
/** Realça a sílaba `syllableIndex` (1-based) sobre o SVG já renderizado, sem
 *  re-render. Uma sílaba pode ter VÁRIOS fragmentos `<g>` com a mesma classe
 *  `syllable-N` (quebra de linha divide a sílaba mantendo o índice) — todos
 *  são acesos. Limpa qualquer realce anterior. Índice inexistente só limpa. */
export function highlightSyllable(svg: SVGSVGElement | Element, syllableIndex: number): void {
  clearHighlight(svg);
  svg.querySelectorAll(`.syllable-${syllableIndex}`).forEach((el) => el.classList.add(STRONG));
}
