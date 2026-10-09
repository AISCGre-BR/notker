// src/neume/draw.ts — desenho grande de um item da vista Neumas (bancada).
// Ordem: (1) glifo da fonte do catálogo (exato, síncrono); (2) motor do preview em modo
// "só nabc" (cadeias que a fonte desenha: ligaduras, `/`, letras significativas), com
// cache por família+nabc; (3) glifos das partes lado a lado; (4) o código em mono.
import type { Family } from "./types";
import { normalizeNabc } from "./overlay";
import { glyphSvgEl } from "./render";
import { partGlyphs, type GlyphLookup } from "./effective";
import type { NabcOnlyRenderer } from "../preview/nabc-only";

export interface NeumeDrawer {
  /** Elemento NOVO a cada chamada (pode ser inserido onde quiser). */
  draw(family: Family, nabc: string, sizePx?: number): Promise<Element>;
}

export function createNeumeDrawer(glyphOf: GlyphLookup, engine: NabcOnlyRenderer | null): NeumeDrawer {
  const cache = new Map<string, Promise<SVGSVGElement | null>>();
  const viaEngine = (family: Family, nabc: string): Promise<SVGSVGElement | null> => {
    if (!engine) return Promise.resolve(null);
    const key = `${family}:${nabc}`;
    let p = cache.get(key);
    if (!p) {
      p = engine.render(family, nabc).catch(() => null);
      cache.set(key, p);
    }
    return p;
  };
  return {
    async draw(family, raw, sizePx = 96) {
      const nabc = normalizeNabc(raw);
      const wrap = document.createElement("span");
      wrap.className = "neume-drawing-wrap";
      const exact = nabc ? glyphOf(family, nabc) : undefined;
      if (exact) { wrap.appendChild(glyphSvgEl(exact, sizePx)); return wrap; }
      const svg = nabc ? await viaEngine(family, nabc) : null;
      if (svg) {
        const copy = svg.cloneNode(true) as SVGSVGElement;
        const vb = (copy.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
        if (vb.length === 4 && vb[3] > 0) {
          copy.setAttribute("height", String(sizePx));
          copy.setAttribute("width", String(Math.round((sizePx * vb[2]) / vb[3])));
        }
        wrap.appendChild(copy);
        return wrap;
      }
      const parts = nabc ? partGlyphs(family, nabc, glyphOf) : undefined;
      if (parts) {
        wrap.classList.add("neume-drawing-wrap--parts");
        for (const g of parts) wrap.appendChild(glyphSvgEl(g, sizePx));
        return wrap;
      }
      wrap.classList.add("neume-drawing-wrap--code");
      wrap.textContent = nabc || "—";
      return wrap;
    },
  };
}
