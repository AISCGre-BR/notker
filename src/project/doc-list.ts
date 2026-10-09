import { type NotkerProject, flattenChants } from "./tree";
import type { Family } from "../neume/types";
import { icon } from "../ui/pd/icons";
import { openContextMenu, closeContextMenu, type CtxEntry } from "../ui/pd/context-menu";

export interface DocListOpts {
  onSelect(id: string): void; onAdd(): void; onImport(): void; onRemove(id: string): void;
  onSetFamily(id: string, f: Family): void; onMove(id: string, delta: -1 | 1): void;
}
const FAMILY_LABEL: Record<Family, string> = { stgall: "St. Gall", laon: "Laon" };

export function createDocList(host: HTMLElement, opts: DocListOpts): { render(p: NotkerProject): void } {
  let project: NotkerProject | null = null;

  function rowMenu(row: HTMLElement, id: string, x: number, y: number): void {
    const p = project!;
    const docs = flattenChants(p);
    const d = docs.find((x) => x.id === id)!;
    const fam = d.family ?? p.family;
    const idx = docs.findIndex((x) => x.id === id);
    const items: CtxEntry[] = [
      { label: "Família: St. Gall", checked: fam === "stgall", run: () => opts.onSetFamily(id, "stgall") },
      { label: "Família: Laon", checked: fam === "laon", run: () => opts.onSetFamily(id, "laon") },
      "---",
      ...(idx > 0 ? [{ label: "Mover para cima", run: () => opts.onMove(id, -1) }] : []),
      ...(idx < docs.length - 1 ? [{ label: "Mover para baixo", run: () => opts.onMove(id, 1) }] : []),
    ];
    if (docs.length > 1) items.push("---", { label: "Excluir canto", danger: true, run: () => opts.onRemove(id) });
    openContextMenu(host, x, y, items, row);
  }

  function render(p: NotkerProject): void {
    project = p;
    closeContextMenu();
    const ae = document.activeElement;
    const focusId = ae && host.contains(ae) ? (ae as HTMLElement).closest<HTMLElement>(".notker-row")?.dataset.id : undefined;
    host.innerHTML = "";
    const list = document.createElement("div");
    list.className = "notker-sidebar__list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Cantos do projeto");
    const rows: HTMLElement[] = [];
    flattenChants(p).forEach((d, i) => {
      const row = document.createElement("div");
      row.className = "notker-row";
      row.setAttribute("role", "option");
      row.dataset.id = d.id;
      const active = d.id === p.activeId;
      row.setAttribute("aria-selected", String(active));
      row.tabIndex = active ? 0 : -1;
      const name = Object.assign(document.createElement("span"), { className: "notker-row__name", textContent: d.title });
      const meta = Object.assign(document.createElement("span"), { className: "notker-row__meta", textContent: FAMILY_LABEL[d.family ?? p.family] });
      row.append(name, meta);
      row.addEventListener("click", () => opts.onSelect(d.id));
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); rowMenu(row, d.id, e.clientX, e.clientY); });
      row.addEventListener("keydown", (e) => {
        // Alt+←/→/↑/↓ pertence ao editor (mover neuma): aqui é consumido sem efeito.
        if (e.altKey && e.key.startsWith("Arrow")) { e.preventDefault(); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const n = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1
            : Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
          rows[n].focus();
        } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onSelect(d.id); }
        else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault();
          const r = row.getBoundingClientRect();
          rowMenu(row, d.id, r.left + 16, r.bottom);
        }
      });
      rows.push(row);
      list.appendChild(row);
    });
    const foot = document.createElement("div");
    foot.className = "notker-sidebar__foot";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "sc-btn sc-btn--elevated notker-split__main";
    add.append(icon("plus"), document.createTextNode("Novo canto"));
    add.addEventListener("click", () => opts.onAdd());
    const more = document.createElement("button");
    more.type = "button";
    more.className = "sc-btn sc-btn--elevated sc-btn--icon notker-split__more";
    more.setAttribute("aria-label", "Mais opções");
    more.dataset.tip = "Mais opções";
    more.appendChild(icon("chevron-up"));
    more.addEventListener("click", () => {
      const r = more.getBoundingClientRect();
      openContextMenu(host, r.left, r.top - 8, [
        { label: "Novo canto", run: () => opts.onAdd() },
        { label: "Importar .gabc…", run: () => opts.onImport() },
      ], more, { openUp: true });
    });
    foot.append(add, more);
    host.append(list, foot);
    if (focusId) rows.find((r) => r.dataset.id === focusId)?.focus();
  }
  return { render };
}
