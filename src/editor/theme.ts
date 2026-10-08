/**
 * theme.ts — tema do editor (Fase 3, frontend-design).
 *
 * Estética "scriptorium": fundo creme, tinta sépia/ferro-galha, rubricação (vermelho)
 * como único acento forte. Hairlines de 1px, sem cantos arredondados. As cores dos
 * tokens GABC/NABC (classes `tok-*` aplicadas pelo highlighter) ficam num registro
 * quente e quase-monocromático, com rubrica reservada a clave/barra/separador.
 *
 * Usa as CSS vars de `src/ui/notker.css` (carregadas em :root) p/ coesão com o resto.
 */
import { EditorView } from "@codemirror/view";

export const highlightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--surface)",
      color: "var(--ink)",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      fontSize: "15px",
      lineHeight: "1.7",
    },
    ".cm-content": { caretColor: "var(--rubric)", padding: "8px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--rubric)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--rubric-wash)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--parchment-deep)",
      color: "var(--ink-muted)",
      border: "none",
      borderRight: "1px solid var(--rule)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      fontSize: "11px",
      padding: "0 8px 0 12px",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-activeLine": { backgroundColor: "var(--ink-wash)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--surface)", color: "var(--ink-soft)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--parchment-deep)",
      border: "1px solid var(--rule)",
      color: "var(--ink-muted)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface)",
      border: "1px solid var(--rule)",
      borderRadius: "0",
      boxShadow: "var(--elev-3)",
      fontFamily: "var(--font-sans)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--parchment-deep)",
      color: "var(--ink)",
    },
    // ── tokens GABC/NABC: tinta quente, quase-monocromática, rubrica nos sinais ──
    ".tok-header-key": { color: "var(--tok-header-key)", fontWeight: "600" },
    ".tok-header-val": { color: "var(--tok-header-val)" },
    ".tok-separator": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-lyric": { color: "var(--ink)" },
    ".tok-clef": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-note": { color: "var(--tok-note)" },
    ".tok-alteration": { color: "var(--tok-alteration)", fontWeight: "600" },
    ".tok-rhythmic": { color: "var(--tok-rhythmic)" },
    ".tok-nabc": { color: "var(--tok-nabc)" },
    ".tok-neume-shape": { color: "var(--tok-neume-shape)", fontWeight: "600" },
    ".tok-bar": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-comment": { color: "var(--ink-muted)", fontStyle: "italic" },
  },
  { dark: false },
);
