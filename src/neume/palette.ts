import { type EditorView, keymap } from "@codemirror/view";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt } from "../editor/context";
import { computeInsertion, type Placement } from "./insert";
import { glyphSvgEl } from "./render";
import type { NeumeSearch } from "./search";
import type { EffectiveEntry } from "./types";

export interface PaletteDeps {
  getTree: () => Tree | null;
  search: () => NeumeSearch;
  onAddName: (id: string) => void;
}

export function neumePalette(deps: PaletteDeps) {
  function open(view: EditorView) {
    if (document.querySelector(".neume-palette")) return; // já aberta
    const root = document.createElement("div");
    root.className = "neume-palette";
    const input = document.createElement("input");
    input.placeholder = "buscar neuma (nome ou código)…";
    const list = document.createElement("div");
    list.className = "neume-palette-list";
    root.append(input, list);
    (view.dom.closest("body") ?? document.body).appendChild(root);
    input.focus();

    let results: EffectiveEntry[] = [];
    let sel = 0;
    const placement: Placement = "outside";

    const render = () => {
      results = deps.search().query(input.value, 60);
      sel = Math.min(sel, Math.max(0, results.length - 1));
      list.innerHTML = "";
      results.forEach((e, i) => {
        const row = document.createElement("div");
        row.className = "neume-row" + (i === sel ? " sel" : "");
        row.appendChild(glyphSvgEl(e.svg, 24));
        const lbl = document.createElement("span");
        lbl.textContent = `${e.displayNames[0]}  ·  ${e.nabc}  ·  ${e.family}`;
        row.appendChild(lbl);
        row.onclick = () => insert(e);
        list.appendChild(row);
      });
    };
    const close = () => root.remove();
    const insert = (e: EffectiveEntry) => {
      const pos = view.state.selection.main.head;
      const doc = view.state.doc.toString();
      const tree = deps.getTree();
      const ctx = tree ? nabcContextAt(tree as any, doc, pos) : { inNabc: false, tokenFrom: pos, tokenTo: pos };
      const ins = computeInsertion(ctx, e.nabc, pos, placement);
      view.dispatch({ changes: { from: ins.from, to: ins.to, insert: ins.insert } });
      close(); view.focus();
    };

    input.addEventListener("input", render);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { close(); view.focus(); }
      else if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, results.length - 1); render(); ev.preventDefault(); }
      else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
      else if (ev.key === "Enter") { if (results[sel]) insert(results[sel]); ev.preventDefault(); }
      else if (ev.ctrlKey && ev.key === "n") { if (results[sel]) deps.onAddName(results[sel].id); ev.preventDefault(); }
    });
    input.addEventListener("blur", () => { setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 150); });
    render();
  }

  // Vários atalhos: Ctrl+Space (padrão do spec) costuma ser capturado pelo
  // IME no Linux (ibus/GNOME); F2 e Alt+N são alternativas à prova de IME/WM.
  const openRun = (v: EditorView): boolean => { open(v); return true; };
  return keymap.of([
    { key: "Ctrl-Space", run: openRun },   // padrão do spec; no Linux o ibus costuma capturá-lo
    { key: "F2", run: openRun },            // confiável (WM/IME não capturam F-keys)
    { key: "Ctrl-Shift-p", run: openRun },  // estilo command-palette, confiável no webkit
    { key: "Alt-n", run: openRun },         // pode ser comido pelo mnemônico GTK em alguns ambientes
  ]);
}
