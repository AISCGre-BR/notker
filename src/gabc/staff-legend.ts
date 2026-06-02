import { showPanel, keymap, type Panel, type EditorView } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { Tree } from "web-tree-sitter";
import { activeClefAt } from "../editor/context";
import { pitchName } from "./gabc-pitch";

export const toggleLegend = StateEffect.define<boolean>();
export const legendVisible = StateField.define<boolean>({
  create: () => false,
  update(v, tr) { for (const e of tr.effects) if (e.is(toggleLegend)) return e.value; return v; },
  provide: (f) => showPanel.from(f, (on) => (on ? legendPanel : null)),
});

let treeGetter: () => Tree | null = () => null;
export function setLegendTreeGetter(g: () => Tree | null) { treeGetter = g; }

function legendPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "staff-legend";
  const draw = () => {
    const tree = treeGetter();
    const doc = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const clef = (tree ? activeClefAt(tree as any, doc, pos) : "c4") ?? "c4";
    const letters = "abcdefghijklm".split("");
    dom.innerHTML =
      `<span class="legend-clef" title="clave ativa">✛ ${clef}</span>` +
      `<span class="legend-cells">` +
      letters
        .map((l) => `<span class="legend-cell"><b>${l}</b><i>${pitchName(l, clef)}</i></span>`)
        .join("") +
      `</span>`;
  };
  draw();
  return { dom, update: () => draw() };
}

export function legendKeymap() {
  return keymap.of([{ key: "Ctrl-Alt-l", run: (v) => { v.dispatch({ effects: toggleLegend.of(!v.state.field(legendVisible)) }); return true; } }]);
}
