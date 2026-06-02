export interface SyllableSource {
  syllableIndex: number;  // 1-based
  from: number;           // offset inicial no doc
  to: number;             // offset final (exclusivo)
}
export interface RenderResult { svg: string; sourceMap: SyllableSource[]; }
export interface PreviewEngine {
  readonly id: string;
  render(doc: string): Promise<RenderResult>;
}

/** Motor falso e determinístico p/ testar painel/sync sem o motor real (webview-only).
 *  Trata cada grupo `(...)` do doc como uma sílaba, emitindo `<g class="syllable syllable-N">`. */
export class FakeEngine implements PreviewEngine {
  readonly id = "fake";
  async render(doc: string): Promise<RenderResult> {
    const sourceMap: SyllableSource[] = [];
    const re = /\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    let n = 0;
    let body = "";
    while ((m = re.exec(doc))) {
      const from = m.index + 1, to = m.index + 1 + m[1].length;
      const syllableIndex = ++n;
      sourceMap.push({ syllableIndex, from, to });
      body += `<g class="syllable syllable-${syllableIndex}"></g>`;
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, sourceMap };
  }
}
