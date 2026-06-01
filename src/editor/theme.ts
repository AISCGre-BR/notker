/**
 * theme.ts — paleta de realce para os tokens GABC/NABC.
 *
 * O highlighter (highlight-tree-sitter.ts) aplica `Decoration.mark({class:"tok-*"})`,
 * mas marcas sem CSS são invisíveis. Este tema CodeMirror define as cores das classes
 * `tok-*`. Sempre incluído no editor, independente de o WASM do realce ter carregado.
 *
 * Paleta provisória, sóbria (tons de tinta/sépia, dignidade paleográfica). O design
 * visual definitivo é tema da Fase 3 (frontend-design); aqui só garantimos legibilidade
 * e diferenciação dos tokens.
 */
import { EditorView } from "@codemirror/view";

export const highlightTheme = EditorView.theme({
  ".tok-header-key": { color: "#2e6e9e", fontWeight: "600" },
  ".tok-header-val": { color: "#0f7b6c" },
  ".tok-separator": { color: "#8a6d1f", fontWeight: "700" },
  ".tok-lyric": { color: "#1a1a1a" },
  ".tok-clef": { color: "#a01c2c", fontWeight: "700" },
  ".tok-note": { color: "#1f3a93" },
  ".tok-alteration": { color: "#7a3e9d", fontWeight: "600" },
  ".tok-rhythmic": { color: "#b25f00" },
  ".tok-nabc": { color: "#9c5a2e" },
  ".tok-neume-shape": { color: "#7a4521", fontWeight: "600" },
  ".tok-bar": { color: "#7a1f1f", fontWeight: "700" },
  ".tok-comment": { color: "#8a8a8a", fontStyle: "italic" },
});
