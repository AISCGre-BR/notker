import { ViewPlugin, Decoration, type DecorationSet, type EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { nabcFieldStart } from "../editor/context";

export const nabcComposeHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: any) { if (u.docChanged || u.selectionSet) this.decorations = this.build(u.view); }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc.toString();
    const head = view.state.selection.main.head;
    const start = nabcFieldStart(doc, head);
    if (start !== -1) {
      // fim do campo = até ) , | seguinte, \n ou fim do documento
      let end = start;
      while (end < doc.length && doc[end] !== ")" && doc[end] !== "\n") end++;
      if (end > start) b.add(start, end, Decoration.mark({ class: "nabc-composing" }));
    }
    return b.finish();
  }
}, { decorations: (v) => v.decorations });
