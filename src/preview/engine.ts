import type { Family } from "../neume/types";

export interface SyllableSource {
  syllableIndex: number;  // 0 = clave (sem syllable-N); 1..M = sílabas reais
  from: number;           // offset inicial no doc
  to: number;             // offset final (exclusivo)
}
/** Âncora REAL de uma cabeça de nota (espaço de usuário do <svg>), em ordem de
 *  documento — usada pela onda p/ pôr cada coluna sob a sua nota. */
export interface NoteAnchor {
  syllableIndex: number; // índice REAL (syllable-N)
  x: number;             // centro da cabeça de nota
  y: number;             // topo da linha (pauta) onde a nota caiu — escolhe o sistema
  pitch: number;         // altura numérica do engine (só a forma da sequência importa)
}
export interface RenderResult { svg: string; sourceMap: SyllableSource[]; noteAnchors?: NoteAnchor[]; }
export interface RenderOptions {
  widthPx?: number;
  /** Família do nabc (St. Gall/Laon): escolhe o parser e a fonte dos neumas. Sem ela,
   *  o nabc-lib usa St. Gall. */
  family?: Family;
  /** Espaçamento EXTRA (px) acima de cada sistema — usado p/ abrir vão p/ as lanes
   *  da onda quando ela está ativa. Some-se ao chantLineTopPaddingPx padrão. */
  extraLineSpacingPx?: number;
  /** Fator de ESPALHAMENTO horizontal (>1) — multiplica os espaços entre notas/glifos
   *  (gabc e nabc) p/ afastar notas em melismas densos quando a onda está ativa. */
  horizontalSpreadFactor?: number;
}
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
