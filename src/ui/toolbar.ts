/** Toolbar do Parchment (44px): grupos segmentados SÓ de ícone (tooltip com atalho),
 *  espaçador e a ação principal da vista (única preenchida, com texto). Estado
 *  (rótulo, pressionado, habilitado) vem do registro — refresh() reavalia. */
import type { CommandRegistry } from "../app/commands";
import { icon, type IconName } from "./pd/icons";

export type ToolbarEntry = { group: string[] } | { primary: string } | "spacer" | "sep";
export interface ToolbarHandle { refresh(): void; }

export function createToolbar(host: HTMLElement, commands: CommandRegistry, items: ToolbarEntry[]): ToolbarHandle {
  const bar = document.createElement("div");
  bar.className = "sc-toolbar";
  bar.setAttribute("role", "toolbar");
  const updaters: (() => void)[] = [];
  const handle: ToolbarHandle = { refresh: () => updaters.forEach((u) => u()) };
  // O estado é reavaliado a cada comando executado, venha do clique, do menu ou do teclado.
  commands.onDidRun(() => handle.refresh());
  const click = (id: string) => () => { void commands.run(id).catch((err) => console.error(`[notker] comando ${id}:`, err)); };

  for (const it of items) {
    if (it === "spacer") { bar.appendChild(Object.assign(document.createElement("span"), { className: "sc-toolbar__spacer" })); continue; }
    if (it === "sep") { bar.appendChild(Object.assign(document.createElement("span"), { className: "sc-toolbar__sep" })); continue; }
    if ("group" in it) {
      const seg = document.createElement("div");
      seg.className = "sc-seg";
      for (const id of it.group) {
        const def = commands.get(id);
        if (!def) continue;
        if (!def.icon) { console.warn(`[notker] toolbar: comando ${id} sem ícone; ignorado`); continue; }
        const b = document.createElement("button");
        b.type = "button";
        b.className = "is-icon";
        b.dataset.cmd = id;
        b.appendChild(icon(def.icon));
        b.addEventListener("click", click(id));
        seg.appendChild(b);
        updaters.push(() => {
          b.setAttribute("aria-label", commands.label(id));
          b.dataset.tip = commands.tooltip(id);
          if (def.checked) b.setAttribute("aria-pressed", String(def.checked()));
          b.disabled = def.enabled ? !def.enabled() : false;
        });
      }
      bar.appendChild(seg);
      continue;
    }
    const id = it.primary;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sc-btn sc-btn--filled";
    b.dataset.cmd = id;
    b.addEventListener("click", click(id));
    bar.appendChild(b);
    updaters.push(() => {
      const label = commands.label(id);
      const ic: IconName = label === "Parar" ? "square" : "play";
      b.replaceChildren(icon(ic), document.createTextNode(label));
      b.dataset.tip = commands.tooltip(id);
      b.disabled = commands.get(id)?.enabled ? !commands.get(id)!.enabled!() : false;
    });
  }
  host.appendChild(bar);
  handle.refresh();
  return handle;
}
