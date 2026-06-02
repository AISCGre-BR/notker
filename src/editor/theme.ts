/**
 * theme.ts — tema do editor (Fase 3, frontend-design).
 *
 * Estética "scriptorium": fundo creme, tinta sépia/ferro-galha, rubricação (vermelho)
 * como único acento forte. Hairlines de 1px, sem cantos arredondados. As cores dos
 * tokens GABC/NABC (classes `tok-*` aplicadas pelo highlighter) ficam num registro
 * quente e quase-monocromático, com rubrica reservada a clave/barra/separador.
 *
 * Usa as CSS vars de `src/ui/tokens.css` (carregadas em :root) p/ coesão com o resto.
 */
import { EditorView } from "@codemirror/view";

export const highlightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--cream)",
      color: "var(--ink)",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: '"Source Serif 4", "Charter", Georgia, serif',
      fontSize: "15px",
      lineHeight: "1.7",
    },
    ".cm-content": { caretColor: "var(--rubric)", padding: "8px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--rubric)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(160, 37, 49, 0.13)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--cream-deep)",
      color: "var(--ink-muted)",
      border: "none",
      borderRight: "1px solid var(--rule)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      fontSize: "11px",
      padding: "0 8px 0 12px",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-activeLine": { backgroundColor: "rgba(120, 90, 40, 0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--cream)", color: "var(--ink-soft)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--cream-deep)",
      border: "1px solid var(--rule)",
      color: "var(--ink-muted)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface)",
      border: "1px solid var(--rule)",
      borderRadius: "0",
      boxShadow: "0 6px 22px rgba(58, 46, 30, 0.16)",
      fontFamily: '"Source Serif 4", serif',
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--cream-deep)",
      color: "var(--ink)",
    },
    // ── tokens GABC/NABC: tinta quente, quase-monocromática, rubrica nos sinais ──
    ".tok-header-key": { color: "#6b5636", fontWeight: "600" },
    ".tok-header-val": { color: "#8a7a5e" },
    ".tok-separator": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-lyric": { color: "var(--ink)" },
    ".tok-clef": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-note": { color: "#3f4a6b" },
    ".tok-alteration": { color: "#6d4a86", fontWeight: "600" },
    ".tok-rhythmic": { color: "#8a6d1f" },
    ".tok-nabc": { color: "#9c5a2e" },
    ".tok-neume-shape": { color: "#7a4521", fontWeight: "600" },
    ".tok-bar": { color: "var(--rubric)", fontWeight: "700" },
    ".tok-comment": { color: "#9a8f7e", fontStyle: "italic" },
  },
  { dark: false },
);
