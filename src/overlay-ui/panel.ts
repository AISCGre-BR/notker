import type { EffectiveEntry, Overlay, OverlayEntry } from "../neume/types";
import { glyphSvgEl } from "../neume/render";
import { hasConflict, promoteToDefault } from "./conflict";

export interface OverlayPanelOpts {
  entries: () => EffectiveEntry[];
  onSave: (o: Overlay) => void;
}
export interface OverlayPanel {
  open(): void; close(): void;
  addName(id: string, name: string): void;
  setHidden(id: string, hidden: boolean): void;
  promote(id: string, name: string): void;
}

export function createOverlayPanel(host: HTMLElement, opts: OverlayPanelOpts): OverlayPanel {
  let draft: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: {} };

  function ensure(id: string): OverlayEntry { return (draft.entries[id] ??= {}); }
  function render(): void {
    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "overlay-panel";
    for (const e of opts.entries()) {
      const row = document.createElement("div");
      row.className = "overlay-row";
      row.appendChild(glyphSvgEl(e.svg, 28));
      const label = document.createElement("span");
      label.textContent = e.displayNames.join(" · ");
      if (hasConflict(e, draft.entries[e.id])) label.classList.add("overlay-conflict");
      row.appendChild(label);
      root.appendChild(row);
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
