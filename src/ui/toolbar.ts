import type { Commands } from "./commands";

export interface ToolbarItem { id: string; label: string; title?: string; primary?: boolean; }
export type ToolbarEntry = ToolbarItem | "|";

/** Handle para atualizar botões pelo id do comando (substitui o antigo hack
 *  de querySelector por title). setPressed dá estado visível aos toggles. */
export interface ToolbarHandle {
  setLabel(id: string, label: string): void;
  setPressed(id: string, on: boolean): void;
}

export function createToolbar(host: HTMLElement, commands: Commands, items: ToolbarEntry[]): ToolbarHandle {
  const bar = document.createElement("div");
  bar.className = "toolbar";

  const byCmd = new Map<string, HTMLButtonElement>();
  for (const it of items) {
    if (it === "|") {
      const sep = document.createElement("span");
      sep.className = "toolbar-sep";
      bar.appendChild(sep);
      continue;
    }
    const b = document.createElement("button");
    b.className = "toolbar-btn" + (it.primary ? " toolbar-primary" : "");
    b.dataset.cmd = it.id;
    b.textContent = it.label;
    if (it.title) b.title = it.title;
    b.addEventListener("click", () => { void commands.run(it.id); });
    bar.appendChild(b);
    byCmd.set(it.id, b);
  }
  host.appendChild(bar);

  return {
    setLabel: (id, label) => { const b = byCmd.get(id); if (b) b.textContent = label; },
    setPressed: (id, on) => {
      const b = byCmd.get(id);
      if (!b) return;
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("pressed", on);
    },
  };
}
