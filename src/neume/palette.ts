import { type EditorView, keymap } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt, inNabcTextual } from "../editor/context";
import { computeInsertion, type Placement } from "./insert";
import { glyphSvgEl } from "./render";
import type { NeumeSearch } from "./search";
import type { EffectiveEntry } from "./types";

export interface PaletteDeps {
  getTree: () => Tree | null;
  search: () => NeumeSearch;
  onAddName: (id: string) => void;
}

/** Grupo de entradas com o mesmo código NABC (St. Gall e/ou Laon). */
interface NabcGroup {
  nabc: string;
  entries: EffectiveEntry[];
}

/** Agrupa uma lista plana de entradas por nabc, preservando a ordem de primeira aparição. */
function groupByNabc(flat: EffectiveEntry[]): NabcGroup[] {
  const map = new Map<string, EffectiveEntry[]>();
  const order: string[] = [];
  for (const e of flat) {
    if (!map.has(e.nabc)) { map.set(e.nabc, []); order.push(e.nabc); }
    map.get(e.nabc)!.push(e);
  }
  return order.map((nabc) => ({ nabc, entries: map.get(nabc)! }));
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

    let groups: NabcGroup[] = [];
    let sel = 0;
    const placement: Placement = "outside";

    const render = () => {
      const flat = deps.search().query(input.value, 120);
      groups = groupByNabc(flat);
      sel = Math.min(sel, Math.max(0, groups.length - 1));
      list.innerHTML = "";
      groups.forEach((g, i) => {
        const row = document.createElement("div");
        row.className = "neume-row" + (i === sel ? " sel" : "");

        // Células: [miniatura + rótulo de família] │ [miniatura + rótulo de família]
        const thumbs = document.createElement("div");
        thumbs.style.cssText = "display:flex;align-items:center;gap:4px;";
        g.entries.forEach((e, ei) => {
          if (ei > 0) {
            const sep = document.createElement("span");
            sep.className = "neume-fam-sep";
            thumbs.appendChild(sep);
          }
          const cell = document.createElement("div");
          cell.className = "neume-fam-cell";
          cell.appendChild(glyphSvgEl(e.svg, 24));
          const cap = document.createElement("span");
          cap.textContent = e.family === "stgall" ? "St. Gall" : "Laon";
          cell.appendChild(cap);
          thumbs.appendChild(cell);
        });
        row.appendChild(thumbs);

        // Label: Nome · nabc
        const lbl = document.createElement("span");
        lbl.textContent = `${g.entries[0].displayNames[0]}  ·  ${g.nabc}`;
        row.appendChild(lbl);

        row.onclick = () => insertNabc(g.nabc);
        list.appendChild(row);
      });
    };
    const close = () => root.remove();
    const insertNabc = (nabc: string) => {
      const pos = view.state.selection.main.head;
      const doc = view.state.doc.toString();
      const tree = deps.getTree();
      const ctx = tree ? nabcContextAt(tree as any, doc, pos) : { inNabc: false, tokenFrom: pos, tokenTo: pos };
      const ins = computeInsertion(ctx, nabc, pos, placement);
      view.dispatch({ changes: { from: ins.from, to: ins.to, insert: ins.insert } });
      close(); view.focus();
    };

    input.addEventListener("input", render);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { close(); view.focus(); }
      else if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, groups.length - 1); render(); ev.preventDefault(); }
      else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
      else if (ev.key === "Enter") { if (groups[sel]) insertNabc(groups[sel].nabc); ev.preventDefault(); }
      else if (ev.ctrlKey && ev.key === "n") {
        if (groups[sel]) {
          groups[sel].entries.forEach((e) => deps.onAddName(e.id));
        }
        ev.preventDefault();
      }
    });
    input.addEventListener("blur", () => { setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 150); });
    render();
  }

  const openRun = (v: EditorView): boolean => {
    const pos = v.state.selection.main.head;
    if (inNabcTextual(v.state.doc.toString(), pos)) { startCompletion(v); return true; }
    open(v);
    return true;
  };
  return keymap.of([
    { key: "Mod-Shift-p", run: openRun },  // Cmd/Ctrl+Shift+P — cross-platform "command palette"
    { key: "F2", run: openRun },           // alternativa rápida
    { key: "Ctrl-Space", run: openRun },   // padrão do spec (capturado pelo IME no Linux)
  ]);
}
