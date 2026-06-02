import { ViewPlugin, Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { composeFromField } from "./compose-state";

export const nabcComposeHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: any) { if (u.docChanged || u.selectionSet || u.transactions.length) this.decorations = this.build(u.view); }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>();
    const from = view.state.field(composeFromField);
    const head = view.state.selection.main.head;
    if (from !== null && head > from) b.add(from, head, Decoration.mark({ class: "nabc-composing" }));
    return b.finish();
  }
}, { decorations: (v) => v.decorations });
