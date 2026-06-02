import { EditorView } from "@codemirror/view";
import type { SyllableSource } from "./engine";
import { syllableAtOffset, sourceOfSyllable } from "./source-map";
import { highlightSyllable, clearHighlight } from "./highlight";
import type { PreviewPanel } from "./panel";

export function resolveEditorToSyllable(map: SyllableSource[], offset: number): number | null {
  return syllableAtOffset(map, offset)?.syllableIndex ?? null;
}

/** Liga preview→editor: clique numa sílaba posiciona o cursor no trecho do fonte. */
export function installSync(view: EditorView, panel: PreviewPanel): void {
  panel.onSyllable((n) => {
    const src = sourceOfSyllable(panel.sourceMap(), n);
    if (!src) return;
    view.dispatch({ selection: { anchor: src.from, head: src.to } });
    view.focus();
  });
}

/** Editor→preview: realça a sílaba sob o cursor atual. */
export function syncFromCursor(view: EditorView, panel: PreviewPanel): void {
  const svg = panel.svgEl();
  if (!svg) return;
  const n = resolveEditorToSyllable(panel.sourceMap(), view.state.selection.main.head);
  if (n == null) { clearHighlight(svg); return; }
  highlightSyllable(svg, n);
}
