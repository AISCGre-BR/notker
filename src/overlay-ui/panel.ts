import type { EffectiveEntry, Overlay, OverlayEntry } from "../neume/types";
import { glyphSvgEl } from "../neume/render";
import { hasConflict, promoteToDefault } from "./conflict";
import { NeumeSearch } from "../neume/search";

export interface OverlayPanelOpts {
  entries: () => EffectiveEntry[];
  onSave: (o: Overlay) => void;
  onClose?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}
export interface OverlayPanel {
  open(): void; close(): void;
  addName(id: string, name: string): void;
  setHidden(id: string, hidden: boolean): void;
  promote(id: string, name: string): void;
}

export function createOverlayPanel(host: HTMLElement, opts: OverlayPanelOpts): OverlayPanel {
  let draft: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: {} };
  let filterQuery = "";

  function ensure(id: string): OverlayEntry { return (draft.entries[id] ??= {}); }

  function filteredEntries(): EffectiveEntry[] {
    const all = opts.entries();
    if (!filterQuery.trim()) return all;
    const search = new NeumeSearch(all);
    return search.query(filterQuery);
  }

  function render(): void {
    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "overlay-panel";

    const header = document.createElement("div");
    header.className = "overlay-header";
    const title = document.createElement("span");
    title.className = "overlay-title";
    title.textContent = "Nomes de neumas";
    header.appendChild(title);
    if (opts.onClose) {
      const close = document.createElement("button");
      close.className = "overlay-close";
      close.textContent = "×";
      close.title = "Fechar";
      close.addEventListener("click", () => opts.onClose!());
      header.appendChild(close);
    }
    root.appendChild(header);

    // Campo de busca/filtro
    const searchInput = document.createElement("input");
    searchInput.className = "overlay-search";
    searchInput.type = "text";
    searchInput.placeholder = "Filtrar neumas…";
    searchInput.value = filterQuery;
    searchInput.addEventListener("input", (ev) => {
      filterQuery = (ev.target as HTMLInputElement).value;
      render();
    });
    root.appendChild(searchInput);

    for (const e of filteredEntries()) {
      const row = document.createElement("div");
      row.className = "overlay-row";
      row.appendChild(glyphSvgEl(e.svg, 28));
      const label = document.createElement("span");
      label.textContent = e.displayNames.join(" · ");
      if (hasConflict(e, draft.entries[e.id])) label.classList.add("overlay-conflict");
      // Proveniência: tooltip com a primeira fonte
      if (e.provenance?.length) {
        label.title = e.provenance[0].source;
      }
      row.appendChild(label);
      // Selo de sequência sintética
      if (e.synthetic) {
        const badge = document.createElement("span");
        badge.className = "overlay-synthetic-badge";
        badge.textContent = "seq";
        row.appendChild(badge);
      }
      root.appendChild(row);
    }

    // Botões Exportar / Importar
    if (opts.onExport !== undefined) {
      const exportBtn = document.createElement("button");
      exportBtn.className = "overlay-export";
      exportBtn.textContent = "Exportar";
      exportBtn.addEventListener("click", () => opts.onExport!());
      root.appendChild(exportBtn);
    }
    if (opts.onImport !== undefined) {
      const importBtn = document.createElement("button");
      importBtn.className = "overlay-import";
      importBtn.textContent = "Importar";
      importBtn.addEventListener("click", () => opts.onImport!());
      root.appendChild(importBtn);
    }

    const save = document.createElement("button");
    save.className = "overlay-save";
    save.textContent = "Salvar";
    save.addEventListener("click", () => opts.onSave(draft));
    root.appendChild(save);
    host.appendChild(root);
  }
  return {
    open: () => render(),
    close: () => { host.innerHTML = ""; },
    addName: (id, name) => {
      const e = ensure(id);
      e.names = Array.from(new Set([...(e.names ?? []), name]));
      render();
    },
    setHidden: (id, hidden) => { ensure(id).hidden = hidden; render(); },
    promote: (id, name) => { draft = promoteToDefault(draft, id, name); render(); },
  };
}
