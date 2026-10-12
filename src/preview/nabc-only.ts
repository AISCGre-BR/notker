/** nabc-only.ts — desenho de uma cadeia nabc solta (sem pauta), pelo motor do preview
 *  (nabc-lib em modo "só nabc"). WEBVIEW-ONLY (mede com getBoundingClientRect).
 *  Devolve null quando o nabc-lib não sabe desenhar a cadeia (erro de lex/parse ou
 *  glifo ausente na fonte — ele desenha um retângulo vermelho de 4×10 no lugar). */
import type { Family } from "../neume/types";

export interface NabcOnlyRenderer { render(family: Family, nabc: string): Promise<SVGSVGElement | null> }

/** O nabc-lib desenha um retângulo com contorno no lugar de um glifo que a fonte não tem. */
export function looksLikePlaceholder(svg: SVGSVGElement): boolean {
  if (svg.querySelector(".nabc-nueme rect[stroke]")) return true;
  return svg.querySelector(".nabc-nueme text") === null;
}

/** Recorta o SVG ao retângulo `box` (unidades do SVG), tira fundo branco, camada
 *  interativa e comentário, e fixa a altura em px (largura proporcional). */
export function finishNabcOnlySvg(svg: SVGSVGElement, box: { x: number; y: number; width: number; height: number }, heightPx: number): SVGSVGElement {
  const pad = 2;
  const vb = { x: box.x - pad, y: box.y - pad, w: box.width + 2 * pad, h: box.height + 2 * pad };
  Array.from(svg.children).find((c) => c.tagName.toLowerCase() === "rect")?.remove(); // fundo branco
  svg.querySelectorAll(".chantLineInteractive, text.commentary").forEach((n) => n.remove());
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("height", String(heightPx));
  svg.setAttribute("width", String(Math.round((heightPx * vb.w) / vb.h)));
  svg.setAttribute("class", "neume-drawing");
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

export function createNabcOnlyRenderer(measureHost: HTMLElement, heightPx = 96): NabcOnlyRenderer {
  return {
    async render(family, nabc) {
      const [lib, fonts] = await Promise.all([import("@testneumz/nabc-lib"), import("./nabc-fonts")]);
      await fonts.ensureChantFonts();
      const box = document.createElement("div");
      measureHost.appendChild(box);
      try {
        const ctx = new lib.ChantContext();
        const c = ctx as unknown as Record<string, unknown>;
        c.nabcOnlyParser = true;
        c.nabcOnlyMode = true;
        c.nabcMode = family === "laon" ? "laon" : "gall";
        c.nabcColor = "currentColor";
        ctx.lineWidthPx = 2000;
        const score = new lib.GregorioScore(ctx);
        const r = score.interprete(`(${nabc})`);
        if (r.lexErrors.length || r.parseErrors.length) return null;
        score.determineElements();
        new lib.GregorianChantSVGRenderer(box).renderSvg(score);
        const svg = box.querySelector("svg");
        if (!svg || looksLikePlaceholder(svg)) return null;
        const ink = svg.querySelector(".ChantLineInner") ?? svg;
        const a = ink.getBoundingClientRect();
        const o = svg.getBoundingClientRect();
        if (a.width <= 0 || a.height <= 0) return null;
        return finishNabcOnlySvg(svg, { x: a.left - o.left, y: a.top - o.top, width: a.width, height: a.height }, heightPx);
      } catch {
        return null;
      } finally {
        box.remove();
      }
    },
  };
}
