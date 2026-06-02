import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt, outermostNabcAt } from "../editor/context";
import type { EffectiveEntry, Family } from "./types";
import { glyphSvgEl } from "./render";

function familyLabel(f: Family): string {
  return f === "stgall" ? "St. Gall" : "Laon";
}

export function nabcHover(
  getTree: () => Tree | null,
  lookupByNabc: (nabc: string) => EffectiveEntry[],
  activeFamily: () => Family,
) {
  return hoverTooltip((view, pos) => {
    const tree = getTree();
    if (!tree) return null;
    const doc = view.state.doc.toString();

    // Tenta primeiro o neuma MAIS EXTERNO (composto inteiro).
    let ctx = outermostNabcAt(tree as any, doc, pos);
    let token = ctx.inNabc
      ? doc.slice(ctx.tokenFrom, ctx.tokenTo).replace(/^\|/, "").trim()
      : "";

    let entries: EffectiveEntry[] = ctx.inNabc ? lookupByNabc(token) : [];

    // Fallback: token interno (parcial) se o composto não deu resultado.
    if (!ctx.inNabc || entries.length === 0) {
      const inner = nabcContextAt(tree as any, doc, pos);
      if (!inner.inNabc) return null;
      const innerToken = doc.slice(inner.tokenFrom, inner.tokenTo).replace(/^\|/, "").trim();
      const innerEntries = lookupByNabc(innerToken);
      if (!ctx.inNabc || innerEntries.length > 0) {
        ctx = inner;
        token = innerToken;
        entries = innerEntries;
      }
      if (!ctx.inNabc) return null;
    }

    // Ordena: família ativa primeiro.
    const af = activeFamily();
    const sorted = entries.slice().sort(
      (a, b) => Number(b.family === af) - Number(a.family === af),
    );

    return {
      pos: ctx.tokenFrom, end: ctx.tokenTo, above: true,
      create(_view: EditorView) {
        const dom = document.createElement("div");
        dom.className = "neume-tooltip";

        if (sorted.length === 0) {
          dom.textContent = `NABC: ${token}`;
          return { dom };
        }

        for (const entry of sorted) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";

          row.appendChild(glyphSvgEl(entry.svg, 32));

          const info = document.createElement("div");
          const isActive = entry.family === af;
          const familyStr = familyLabel(entry.family as Family);
          const activeMark = isActive ? " <small>• ativa</small>" : "";
          info.innerHTML =
            `<strong>${entry.displayNames[0]}</strong> · <em>${familyStr}</em>${activeMark}` +
            (entry.qualifiers.length ? `<br><small>${entry.qualifiers.join(" ")}</small>` : "") +
            (entry.meaning ? `<br>${entry.meaning}` : "");
          row.appendChild(info);
          dom.appendChild(row);
        }

        return { dom };
      },
    };
  });
}
