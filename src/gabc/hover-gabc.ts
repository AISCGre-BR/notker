import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nodeKindAt, activeClefAt, nabcContextAt } from "../editor/context";
import { pitchLabel } from "./gabc-pitch";
import { t } from "../i18n";

export function gabcHover(getTree: () => Tree | null) {
  return hoverTooltip((view, pos) => {
    const tree = getTree();
    if (!tree) return null;
    const doc = view.state.doc.toString();
    if (nabcContextAt(tree as any, doc, pos).inNabc) return null;
    const kind = nodeKindAt(tree as any, pos);
    const ch = doc[pos] ?? "";
    let text = t("gabcHover.element", { kind });
    if (/[a-mA-M]/.test(ch)) {
      const clef = activeClefAt(tree as any, doc, pos);
      text = t("gabcHover.note", { letter: ch, pitch: pitchLabel(ch, clef), clef: clef ?? "c4" });
    }
    return {
      pos, above: true,
      create(_view: EditorView) {
        const dom = document.createElement("div");
        dom.className = "gabc-tooltip";
        dom.textContent = text;
        return { dom };
      },
    };
  });
}
