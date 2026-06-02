import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt } from "../editor/context";
import type { EffectiveEntry } from "./types";
import { glyphSvgEl } from "./render";

export function nabcHover(
  getTree: () => Tree | null,
  lookupByNabc: (nabc: string) => EffectiveEntry | undefined,
) {
  return hoverTooltip((view, pos) => {
    const tree = getTree();
    if (!tree) return null;
    const doc = view.state.doc.toString();
    const ctx = nabcContextAt(tree as any, doc, pos);
    if (!ctx.inNabc) return null;
    const token = doc.slice(ctx.tokenFrom, ctx.tokenTo).replace(/^\|/, "").trim();
    const entry = lookupByNabc(token);
    return {
      pos: ctx.tokenFrom, end: ctx.tokenTo, above: true,
      create(_view: EditorView) {
        const dom = document.createElement("div");
        dom.className = "neume-tooltip";
        if (!entry) { dom.textContent = `NABC: ${token}`; return { dom }; }
        dom.appendChild(glyphSvgEl(entry.svg, 32));
        const t = document.createElement("div");
        t.innerHTML = `<strong>${entry.displayNames[0]}</strong> · ${entry.family}` +
          (entry.qualifiers.length ? `<br><small>${entry.qualifiers.join(" ")}</small>` : "") +
          (entry.meaning ? `<br>${entry.meaning}` : "");
        dom.appendChild(t);
        return { dom };
      },
    };
  });
}
