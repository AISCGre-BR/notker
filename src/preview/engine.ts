export interface SyllableSource {
  syllableIndex: number;  // 0 = clave (sem syllable-N); 1..M = sílabas reais
  from: number;           // offset inicial no doc
  to: number;             // offset final (exclusivo)
}
export interface RenderResult { svg: string; sourceMap: SyllableSource[]; }
export interface RenderOptions { widthPx?: number; }
export interface PreviewEngine {
  readonly id: string;
  render(doc: string, opts?: RenderOptions): Promise<RenderResult>;
}

// Reusa a MESMA numeração clave-ciente do motor real, p/ que o FakeEngine reflita
// fielmente a convenção do nabc-lib (clave sem `syllable-N`; reais de 1 em diante).
import { syllableSpans } from "./nabc-lib";

/** Motor falso e determinístico p/ testar painel/sync sem o motor real (webview-only).
 *  Emite `<g class="syllable">` p/ a clave (índice 0) e `<g class="syllable syllable-N">`
 *  p/ cada sílaba real — espelhando o que o nabc-lib produz. */
export class FakeEngine implements PreviewEngine {
  readonly id = "fake";
  async render(doc: string): Promise<RenderResult> {
    const sourceMap = syllableSpans(doc);
    const body = sourceMap
      .map((s) =>
        s.syllableIndex === 0
          ? `<g class="syllable"></g>`
          : `<g class="syllable syllable-${s.syllableIndex}"></g>`,
      )
      .join("");
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, sourceMap };
  }
}
