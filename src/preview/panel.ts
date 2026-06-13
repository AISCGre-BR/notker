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
  onRender(cb: () => void): void;
  /** Layout da onda: vão extra (px) entre sistemas + fator de espalhamento horizontal
   *  (>1 afasta notas em melismas densos). Mudar qualquer valor re-renderiza. */
  setWaveSpacing(extraLineSpacingPx: number, horizontalSpread: number): void;
  destroy(): void;
}

export function createPreviewPanel(
  host: HTMLElement,
  engine: PreviewEngine,
  opts: { debounceMs: number },
): PreviewPanel {
  let map: SyllableSource[] = [];
  let cb: ((n: number) => void) | null = null;
  let renderCb: (() => void) | null = null;
  let lastDoc = "";
  let extraLineSpacingPx = 0;
  let horizontalSpread = 1;

  async function doRender(doc: string) {
    // Largura útil da prancha (descontando padding ~22px de cada lado + moldura).
    const inner = host.clientWidth ? host.clientWidth - 48 : 0;
    const r = await engine.render(doc, {
      widthPx: inner > 120 ? inner : undefined,
      extraLineSpacingPx: extraLineSpacingPx || undefined,
      horizontalSpreadFactor: horizontalSpread > 1 ? horizontalSpread : undefined,
    });
    map = r.sourceMap;
    host.innerHTML = r.svg;
    host.querySelector("svg")?.addEventListener("click", (ev) => {
      const g = (ev.target as Element).closest('[class*="syllable-"]');
      const n = syllableIndexFromGroup(g);
      if (n != null && cb) cb(n);
    });
    renderCb?.();
  }
  const render = debounce((doc: string) => { void doRender(doc); }, opts.debounceMs);

  // Re-renderiza ao redimensionar o painel (preview responsivo).
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => { if (lastDoc) render(lastDoc); });
    ro.observe(host);
  }

  return {
    update: (doc) => { lastDoc = doc; render(doc); },
    sourceMap: () => map,
    svgEl: () => host.querySelector("svg"),
    onSyllable: (fn) => { cb = fn; },
    onRender: (fn) => { renderCb = fn; },
    setWaveSpacing: (px, spread) => {
      if (px === extraLineSpacingPx && spread === horizontalSpread) return;
      extraLineSpacingPx = px;
      horizontalSpread = spread;
      if (lastDoc) render(lastDoc);
    },
    destroy: () => { render.cancel(); ro?.disconnect(); },
  };
}
