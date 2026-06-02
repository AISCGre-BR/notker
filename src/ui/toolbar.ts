import type { Commands } from "./commands";

export interface ToolbarItem { id: string; label: string; title?: string; }

export function createToolbar(host: HTMLElement, commands: Commands, items: ToolbarItem[]): void {
  const bar = document.createElement("div");
  bar.className = "toolbar";
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "toolbar-btn";
    b.textContent = it.label;
    if (it.title) b.title = it.title;
    b.addEventListener("click", () => { void commands.run(it.id); });
    bar.appendChild(b);
  }
  host.appendChild(bar);
}
