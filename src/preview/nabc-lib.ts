import type { PreviewEngine, RenderResult, SyllableSource } from "./engine";
import { extractNoteAnchors, rootOffset, type LayoutLike } from "./note-anchors";

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
  async render(doc: string, opts?: { widthPx?: number; extraLineSpacingPx?: number; horizontalSpreadFactor?: number }): Promise<RenderResult> {
    const [lib, fonts] = await Promise.all([
      import("@testneumz/nabc-lib"),
      import("./nabc-fonts"),
    ]);
    const { ChantContext, GregorioScore, GregorianChantSVGRenderer } = lib;
    // As fontes precisam estar no document.fonts ANTES de medir/renderizar (ver nabc-fonts.ts).
    await fonts.ensureChantFonts();
    const container = document.createElement("div");
    const ctx = new ChantContext();
    // Largura de linha = largura útil do painel (preview responsivo); fallback 800.
    if (opts?.widthPx && opts.widthPx > 120) ctx.lineWidthPx = Math.round(opts.widthPx);
    // Espaçamento extra ENTRE sistemas (vão p/ as lanes da onda). O empilhamento de
    // linhas usa `spaceabovelines` (default 0); lengthToPx(mm) = space × pxInCm/10,
    // então convertemos o px desejado para mm com o pxInCm do contexto.
    // (Casts pontuais: o pacote nabc-lib não publica `types`, então essas props não
    //  estão na tipagem inferida — mas existem em runtime, ver dist/types/.)
    if (opts?.extraLineSpacingPx && opts.extraLineSpacingPx > 0) {
      const LengthCtor = (lib as unknown as { Length: new (n: number, u: string) => unknown }).Length;
      const pxInCm = (ctx as unknown as { pxInCm?: number }).pxInCm ?? 55.22;
      (ctx as unknown as { spaceabovelines: unknown }).spaceabovelines =
        new LengthCtor((opts.extraLineSpacingPx * 10) / pxInCm, "mm");
    }
    // Espalhamento HORIZONTAL: multiplica o `space` base dos espaços elásticos entre
    // notas/glifos (gabc e nabc) — afasta notas em melismas densos sem deformar glifos.
    if (opts?.horizontalSpreadFactor && opts.horizontalSpreadFactor > 1) {
      const f = opts.horizontalSpreadFactor;
      const libx = lib as unknown as {
        Length: new (n: number, u: string) => unknown;
        RubberLength: new (s: unknown, st: unknown, sh: unknown) => unknown;
      };
      type Len = { space: number; unit: string };
      type Rub = { space: Len; stretch: unknown; shrink: unknown };
      const cx = ctx as unknown as Record<string, unknown>;
      const scaleRub = (rl: Rub) =>
        new libx.RubberLength(new libx.Length(rl.space.space * f, rl.space.unit), rl.stretch, rl.shrink);
      const scaleLen = (l: Len) => new libx.Length(l.space * f, l.unit);
      for (const k of [
        "interglyphspace", "interelementspace", "glyphspace", "largerspace", "halfspace",
        "interwordspacenotes", "nabcinterelementspace", "nabclargerspace",
      ]) {
        if (cx[k]) cx[k] = scaleRub(cx[k] as Rub);
      }
      if (cx.intersyllablespacenotes) cx.intersyllablespacenotes = scaleLen(cx.intersyllablespacenotes as Len);
    }
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
    const distinct = svgEl
      ? new Set(
          Array.from(svgEl.querySelectorAll('[class*="syllable-"]'))
            .map((el) => /(?:^|\s)syllable-(\d+)(?:\s|$)/.exec(el.getAttribute("class") ?? "")?.[1])
            .filter((x): x is string => x != null),
        ).size
      : 0;
    if (distinct !== numbered) {
      console.warn(`[f3] desalinhamento sílaba↔span: índices distintos=${distinct} numeradas=${numbered}`);
    }
    // Âncoras reais das cabeças de nota (modelo de layout pós-render) p/ a onda.
    const noteAnchors = extractNoteAnchors(renderer as unknown as LayoutLike, rootOffset(svgEl));
    return { svg, sourceMap: spans, noteAnchors };
  }
}
