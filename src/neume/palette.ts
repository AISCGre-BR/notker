import { type EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { startCompletion } from "@codemirror/autocomplete";
import type { Tree } from "web-tree-sitter";
import { inNabcTextual } from "../editor/context";
import { insertNabcAtCursor } from "./insert";
import { neumeThumb } from "./render";
import type { NeumeSearch } from "./search";
import type { EffectiveEntry } from "./types";

export interface NeumePalette {
  keymap: Extension;
  open(view: EditorView): void;
}

export interface PaletteDeps {
  getTree: () => Tree | null;
  search: () => NeumeSearch;
  onName: (ids: string[], name: string) => void | Promise<void>;
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

export function neumePalette(deps: PaletteDeps): NeumePalette {
  function openPalette(view: EditorView) {
    const existing = document.querySelector<HTMLElement>(".neume-palette");
    if (existing) { // já aberta: só devolve o foco (nunca cria uma 2ª)
      (existing.querySelector<HTMLElement>(".neume-name-input")
        ?? existing.querySelector<HTMLElement>("input"))?.focus();
      return;
    }
    const root = document.createElement("div");
    root.className = "neume-palette sc-menu";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Buscar neuma");
    const input = document.createElement("input");
    input.className = "sc-input";
    input.placeholder = "Buscar neuma por nome ou código";
    const list = document.createElement("div");
    list.className = "neume-palette-list";
    list.setAttribute("role", "listbox");
    root.append(input, list);
    (view.dom.closest("body") ?? document.body).appendChild(root);
    input.focus();

    let groups: NabcGroup[] = [];
    let sel = 0;
    let naming: number | null = null;

    const render = () => {
      const flat = deps.search().query(input.value, 120);
      groups = groupByNabc(flat);
      sel = Math.min(sel, Math.max(0, groups.length - 1));
      if (naming !== null && naming >= groups.length) naming = null;
      list.innerHTML = "";
      let nameField = null as HTMLInputElement | null;
      groups.forEach((g, i) => {
        const row = document.createElement("div");
        row.className = "neume-row" + (i === sel ? " sel" : "");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === sel ? "true" : "false");

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
          cell.appendChild(neumeThumb(e, 24));
          const cap = document.createElement("span");
          cap.textContent = e.family === "stgall" ? "St. Gall" : "Laon";
          cell.appendChild(cap);
          thumbs.appendChild(cell);
        });
        row.appendChild(thumbs);

        if (naming === i) {
          const ni = document.createElement("input");
          ni.className = "sc-input neume-name-input";
          ni.placeholder = "Novo nome";
          ni.setAttribute("aria-label", "Novo nome do neuma");
          ni.addEventListener("keydown", (ev) => {
            ev.stopPropagation();
            if (ev.isComposing) return;
            if (ev.key === "Escape") { ev.preventDefault(); naming = null; render(); input.focus(); }
            else if (ev.key === "Enter") {
              ev.preventDefault();
              const name = ni.value.trim();
              const ids = groups[i].entries.map((e) => e.id);
              naming = null;
              if (!name) { render(); input.focus(); return; }
              void Promise.resolve(deps.onName(ids, name))
                .catch(() => { /* quem grava já avisou o erro */ })
                .finally(() => {
                  if (!root.isConnected || naming !== null) return; // outro cadastro em curso: não mexe
                  const ae = document.activeElement;
                  render();
                  if (ae === input || ae === document.body || ae === null) input.focus();
                });
              render(); input.focus();
            }
          });
          ni.addEventListener("blur", onBlur);
          for (const t of ["click", "mousedown"]) ni.addEventListener(t, (ev) => ev.stopPropagation());
          row.appendChild(ni);
          nameField = ni;
        } else {
          const nm = document.createElement("span");
          nm.className = "neume-row-name";
          nm.textContent = g.entries[0].displayNames[0];
          row.appendChild(nm);
        }
        const code = document.createElement("span");
        code.className = "neume-row-code caption";
        code.textContent = g.nabc;
        row.appendChild(code);

        row.onclick = () => insertNabc(g.nabc);
        list.appendChild(row);
      });
      nameField?.focus();
    };
    const close = () => root.remove();
    function onBlur() {
      setTimeout(() => { if (root.isConnected && !root.contains(document.activeElement)) close(); }, 150);
    }
    const insertNabc = (nabc: string) => {
      insertNabcAtCursor(view, deps.getTree() as Parameters<typeof insertNabcAtCursor>[1], nabc);
      close(); view.focus();
    };

    input.addEventListener("input", render);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { close(); view.focus(); }
      else if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, groups.length - 1); render(); ev.preventDefault(); }
      else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
      else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        if (groups[sel]) { naming = sel; render(); }
        ev.preventDefault();
      }
      else if (ev.key === "Enter") { if (groups[sel]) insertNabc(groups[sel].nabc); ev.preventDefault(); }
    });
    input.addEventListener("blur", onBlur);
    render();
  }

  const openRun = (v: EditorView): boolean => {
    const pos = v.state.selection.main.head;
    if (inNabcTextual(v.state.doc.toString(), pos)) { startCompletion(v); return true; }
    openPalette(v);
    return true;
  };
  return {
    open: openPalette,
    keymap: keymap.of([
      { key: "F2", run: openRun },         // alternativa rápida
      { key: "Ctrl-Space", run: openRun }, // padrão do spec (capturado pelo IME no Linux)
    ]),
  };
}
