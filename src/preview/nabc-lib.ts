import type { PreviewEngine, RenderResult, SyllableSource } from "./engine";

/** Token de clave gabc (c1..c4 / f1..f4, com bemol opcional). A clave é o 1º grupo
 *  `(...)` e, no nabc-lib, recebe `_index` 0 → sai como `class="syllable"` SEM
 *  `syllable-N`. Por isso ela leva o índice 0 aqui e as sílabas reais numeram de 1. */
const CLEF = /^[cf]b?[1-4]$/i;

/** Spans de cada grupo de notas `(...)` no corpo gabc (após `%%`, ou doc inteiro se não houver).
 *  A clave inicial recebe índice 0 (não numerada no SVG); as sílabas reais recebem 1..M,
 *  casando em ORDEM com os grupos `.syllable-N` que o nabc-lib emite.
 *  from = início da letra/sílaba (logo após o grupo anterior, sem espaço à esquerda);
 *  to   = fim do grupo `(...)` atual. */
export function syllableSpans(doc: string): SyllableSource[] {
  const sep = doc.indexOf("%%");
  const bodyStart = sep >= 0 ? sep + 2 : 0;
  const spans: SyllableSource[] = [];
  const re = /\(([^)]*)\)/g;
  re.lastIndex = bodyStart;
  let m: RegExpExecArray | null;
  let cursor = bodyStart;
  let n = 0;
  let first = true;
  while ((m = re.exec(doc))) {
    const groupEnd = m.index + m[0].length;
    let from = cursor;
    while (from < m.index && /\s/.test(doc[from])) from++;
    const isClef = first && CLEF.test(m[1].trim());
    spans.push({ syllableIndex: isClef ? 0 : ++n, from, to: groupEnd });
    cursor = groupEnd;
    first = false;
  }
  return spans;
}

export class NabcLibEngine implements PreviewEngine {
  readonly id = "nabc-lib";
  async render(doc: string): Promise<RenderResult> {
    const [lib, fonts] = await Promise.all([
      import("@testneumz/nabc-lib"),
      import("./nabc-fonts"),
    ]);
    const { ChantContext, GregorioScore, GregorianChantSVGRenderer } = lib;
    // As fontes precisam estar no document.fonts ANTES de medir/renderizar (ver nabc-fonts.ts).
    await fonts.ensureChantFonts();
    const container = document.createElement("div");
    const ctx = new ChantContext();
    const score = new GregorioScore(ctx);
    // O nabc-lib espera APENAS o corpo da partitura (depois do `%%`); os cabeçalhos
    // (name/mode/nabc-lines/…) são metadados e, se passados, são renderizados como
    // texto cantado. Os offsets do source-map seguem referenciando o doc completo.
    const sep = doc.indexOf("%%");
    const body = sep >= 0 ? doc.slice(sep + 2) : doc;
    score.interprete(body);
    score.determineElements();
    const renderer = new GregorianChantSVGRenderer(container);
    renderer.renderSvg(score);
    const svgEl = container.querySelector("svg");
    const svg = svgEl ? svgEl.outerHTML : "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    const spans = syllableSpans(doc);
    const numbered = spans.filter((s) => s.syllableIndex >= 1).length;
    const groups = svgEl ? svgEl.querySelectorAll('[class*="syllable-"]').length : 0;
    if (groups !== numbered) {
      console.warn(`[f3] desalinhamento sílaba↔span: svg=${groups} numeradas=${numbered}`);
    }
    return { svg, sourceMap: spans };
  }
}
