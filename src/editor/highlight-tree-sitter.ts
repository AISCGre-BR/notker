/**
 * highlight-tree-sitter.ts
 *
 * CodeMirror 6 ViewPlugin that uses web-tree-sitter + tree-sitter-gregorio
 * to decorate GABC/NABC source with syntax-highlighting CSS mark classes.
 *
 * Usage:
 *   import runtimeWasmUrl from "../../src/assets/tree-sitter.wasm?url";
 *   import grammarWasmUrl from "../../src/assets/tree-sitter-gregorio.wasm?url";
 *   const { extension, getTree } = await makeTreeSitterHighlighter(runtimeWasmUrl, grammarWasmUrl);
 *   // add extension to EditorView extensions; call getTree() to read the current parse tree
 */

import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type EditorView,
} from "@codemirror/view";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import { Parser, Language, type Tree } from "web-tree-sitter";

/**
 * Map of tree-sitter node type names → CodeMirror CSS mark class names.
 *
 * Node types discovered by parsing a real GABC+NABC sample with
 * tree-sitter-gregorio v0.5.2 (see scripts/build-grammar-wasm.sh).
 *
 * Strategy: we only decorate types in this map; parent containers are NOT
 * listed, so the visit function collects them at a consistent depth and
 * the final sort+dedup pass guarantees non-overlapping ascending ranges
 * for RangeSetBuilder.
 */
const NODE_CLASS: Record<string, string> = {
  // Header fields — only decorate the terminal/leaf-level nodes so that
  // parent containers (header_generic, header_numeric_*) are NOT also
  // decorated, which would create nested overlapping ranges.
  header_name: "tok-header-key",
  header_value_numeric: "tok-header-val",
  section_separator: "tok-separator",

  // Syllable / lyric text
  syllable_text: "tok-lyric",
  syllable_translation: "tok-lyric",

  // Clef tokens
  c_clef: "tok-clef",
  f_clef: "tok-clef",
  gabc_clef: "tok-clef",

  // Pitch / neume body
  pitch_lowercase: "tok-note",
  pitch_uppercase: "tok-note",
  gabc_neume: "tok-note",

  // Alterations
  flat: "tok-alteration",
  natural: "tok-alteration",
  sharp: "tok-alteration",
  gabc_alteration: "tok-alteration",

  // Rhythmic / episema modifiers
  punctum_mora: "tok-rhythmic",
  ictus: "tok-rhythmic",
  vertical_episema: "tok-rhythmic",
  episema: "tok-rhythmic",

  // NABC annotations
  nabc_snippet: "tok-nabc",
  nabc_glyph_descriptor: "tok-nabc",
  nabc_complex_glyph_descriptor: "tok-nabc",
  nabc_significant_letter_descriptor: "tok-nabc",

  // Shape descriptors (neume names in NABC)
  pes: "tok-neume-shape",
  clivis: "tok-neume-shape",
  torculus: "tok-neume-shape",
  porrectus: "tok-neume-shape",
  scandicus: "tok-neume-shape",
  climacus: "tok-neume-shape",
  virga: "tok-neume-shape",
  punctum: "tok-neume-shape",
  quilisma: "tok-neume-shape",
  oriscus: "tok-neume-shape",
  stropha: "tok-neume-shape",
  distropha: "tok-neume-shape",
  tristropha: "tok-neume-shape",

  // Divisio / bar lines
  divisio_finalis: "tok-bar",
  divisio_maior: "tok-bar",
  divisio_maior_dotted: "tok-bar",
  divisio_minor: "tok-bar",
  divisio_minimis: "tok-bar",
  divisio_minima: "tok-bar",
  dominican_bar: "tok-bar",
  gabc_separation_bar: "tok-bar",

  // Comments
  comment: "tok-comment",
};

interface Span {
  start: number;
  end: number;
  cls: string;
}

/** Collect all decoratable spans from a tree node recursively. */
function collectSpans(node: { type: string; startIndex: number; endIndex: number; childCount: number; child(i: number): typeof node | null }, spans: Span[]): void {
  const cls = NODE_CLASS[node.type];
  if (cls && node.startIndex < node.endIndex) {
    spans.push({ start: node.startIndex, end: node.endIndex, cls });
    // Do NOT descend into children of a decorated node — avoids overlapping
    // parent/child ranges that would violate RangeSetBuilder ordering.
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectSpans(child, spans);
  }
}

/** Build a DecorationSet from a tree-sitter parse tree. */
function buildDecorations(root: { type: string; startIndex: number; endIndex: number; childCount: number; child(i: number): typeof root | null }): DecorationSet {
  const spans: Span[] = [];
  collectSpans(root, spans);

  // Sort ascending by start; break ties by putting shorter spans first
  // (shorter = more specific leaf), then deduplicate overlaps.
  spans.sort((a, b) => a.start !== b.start ? a.start - b.start : (a.end - a.start) - (b.end - b.start));

  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  for (const { start, end, cls } of spans) {
    if (start < lastEnd) continue; // skip overlapping
    if (start >= end) continue;    // skip zero-length
    builder.add(start, end, Decoration.mark({ class: cls }));
    lastEnd = end;
  }
  return builder.finish();
}

/**
 * Initialize web-tree-sitter, load the GABC/NABC grammar, and return a
 * CodeMirror ViewPlugin that syntax-highlights GABC+NABC documents.
 *
 * @param runtimeWasmUrl - URL to tree-sitter.wasm (web-tree-sitter runtime)
 * @param grammarWasmUrl  - URL to tree-sitter-gregorio.wasm (language grammar)
 */
export async function makeTreeSitterHighlighter(
  runtimeWasmUrl: string,
  grammarWasmUrl: string
): Promise<{ extension: Extension; getTree: () => Tree | null }> {
  await Parser.init({ locateFile: () => runtimeWasmUrl });
  const lang = await Language.load(grammarWasmUrl);
  const parser = new Parser();
  parser.setLanguage(lang);

  let lastTree: Tree | null = null;

  const extension = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(u: { docChanged: boolean; view: EditorView }) {
        if (u.docChanged) {
          this.decorations = this.build(u.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const text = view.state.doc.toString();
        const tree = parser.parse(text);
        lastTree = tree;
        if (!tree) return Decoration.none;
        return buildDecorations(tree.rootNode);
      }
    },
    { decorations: (v) => v.decorations }
  );

  return { extension, getTree: () => lastTree };
}

/** Exported for testing: build decorations directly from source text. */
export function buildDecorationsFromSource(
  parser: Parser,
  source: string
): DecorationSet {
  const tree = parser.parse(source);
  if (!tree) return Decoration.none;
  return buildDecorations(tree.rootNode);
}
