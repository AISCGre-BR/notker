import type { PreviewEngine, RenderResult, SyllableSource } from "./engine";

/** Spans 1-based de cada sílaba (grupo de notas) no corpo gabc (após `%%`).
 *  from = início da letra/sílaba (logo após o grupo anterior, sem espaço à esquerda);
 *  to   = fim do grupo `(...)` atual. Casa em ORDEM com os grupos `.syllable-N` do SVG. */
export function syllableSpans(doc: string): SyllableSource[] {
  const sep = doc.indexOf("%%");
  if (sep < 0) return [];
  const bodyStart = sep + 2;
  const spans: SyllableSource[] = [];
  const re = /\([^)]*\)/g;
  re.lastIndex = bodyStart;
  let m: RegExpExecArray | null;
  let cursor = bodyStart;
  let n = 0;
  while ((m = re.exec(doc))) {
    const groupEnd = m.index + m[0].length;
    let from = cursor;
    while (from < m.index && /\s/.test(doc[from])) from++;
    spans.push({ syllableIndex: ++n, from, to: groupEnd });
    cursor = groupEnd;
  }
  return spans;
}

export class NabcLibEngine implements PreviewEngine {
  readonly id = "nabc-lib";
  async render(doc: string): Promise<RenderResult> {
    const { ChantContext, GregorioScore, GregorianChantSVGRenderer } = await import("@testneumz/nabc-lib");
    const container = document.createElement("div");
    const ctx = new ChantContext();
    const score = new GregorioScore(ctx);
    score.interprete(doc);
    score.determineElements();
    const renderer = new GregorianChantSVGRenderer(container);
    renderer.renderSvg(score);
    const svgEl = container.querySelector("svg");
    const svg = svgEl ? svgEl.outerHTML : "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    const spans = syllableSpans(doc);
    const groups = svgEl ? svgEl.querySelectorAll('[class*="syllable-"]').length : 0;
    if (groups !== spans.length) {
      console.warn(`[f3] desalinhamento sílaba↔span: svg=${groups} spans=${spans.length}`);
    }
    return { svg, sourceMap: spans };
  }
}
