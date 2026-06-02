const STRONG = "hl-strong";

export function clearHighlight(svg: SVGSVGElement | Element): void {
  svg.querySelectorAll("." + STRONG).forEach((el) => el.classList.remove(STRONG));
}
/** Realça a sílaba `syllableIndex` (1-based) sobre o SVG já renderizado, sem re-render.
 *  Limpa qualquer realce anterior. Índice inexistente apenas limpa. */
export function highlightSyllable(svg: SVGSVGElement | Element, syllableIndex: number): void {
  clearHighlight(svg);
  svg.querySelector(`.syllable-${syllableIndex}`)?.classList.add(STRONG);
}
