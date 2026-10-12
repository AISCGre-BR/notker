import { showPanel, type Panel, type EditorView } from "@codemirror/view";
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

/** Liga/desliga "Letras na pauta" (estado mora no main, como o comando view.staffLetters). */
export interface LegendLettersHook { on: () => boolean; toggle: () => void }
let lettersHook: LegendLettersHook = { on: () => false, toggle: () => {} };
export function setLegendLetters(h: LegendLettersHook) { lettersHook = h; }

function legendPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "staff-legend";
  const body = document.createElement("span");
  body.className = "legend-body";
  // Botão persistente (não entra no innerHTML redesenhado: não perde o foco a cada tecla).
  const letters = document.createElement("button");
  letters.type = "button";
  letters.className = "sc-btn legend-letters";
  letters.textContent = "Letras na pauta";
  letters.dataset.tip = "Mostrar a letra gabc de cada linha e espaço à esquerda da partitura";
  letters.addEventListener("click", () => {
    lettersHook.toggle();
    letters.setAttribute("aria-pressed", String(lettersHook.on()));
  });
  dom.append(body, letters);
  const draw = () => {
    const tree = treeGetter();
    const doc = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const clef = (tree ? activeClefAt(tree as any, doc, pos) : "c4") ?? "c4";
    const cells = "abcdefghijklm".split("");
    letters.setAttribute("aria-pressed", String(lettersHook.on()));
    body.innerHTML =
      `<span class="legend-clef" title="clave ativa">✛ ${clef}</span>` +
      `<span class="legend-cells">` +
      cells
        .map((l) => `<span class="legend-cell"><b>${l}</b><i>${pitchName(l, clef)}</i></span>`)
        .join("") +
      `</span>`;
  };
  draw();
  return { dom, update: () => draw() };
}
