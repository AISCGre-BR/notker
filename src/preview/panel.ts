import type { PreviewEngine, SyllableSource } from "./engine";
import { debounce } from "./debounce";

/** Extrai N de um elemento com classe `syllable-N`, ou null. */
export function syllableIndexFromGroup(el: Element | null): number | null {
  if (!el) return null;
  const m = /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(el.getAttribute("class") ?? "");
  return m ? Number(m[1]) : null;
}

export interface PreviewPanel {
  update(doc: string): void;
  sourceMap(): SyllableSource[];
  svgEl(): SVGSVGElement | null;
  onSyllable(cb: (syllableIndex: number) => void): void;
  destroy(): void;
}

export function createPreviewPanel(
  host: HTMLElement,
  engine: PreviewEngine,
  opts: { debounceMs: number },
): PreviewPanel {
  let map: SyllableSource[] = [];
  let cb: ((n: number) => void) | null = null;

  async function doRender(doc: string) {
    const r = await engine.render(doc);
    map = r.sourceMap;
    host.innerHTML = r.svg;
    host.querySelector("svg")?.addEventListener("click", (ev) => {
      const g = (ev.target as Element).closest('[class*="syllable-"]');
      const n = syllableIndexFromGroup(g);
      if (n != null && cb) cb(n);
    });
  }
  const render = debounce((doc: string) => { void doRender(doc); }, opts.debounceMs);

  return {
    update: (doc) => render(doc),
    sourceMap: () => map,
    svgEl: () => host.querySelector("svg"),
    onSyllable: (fn) => { cb = fn; },
    destroy: () => render.cancel(),
  };
}
