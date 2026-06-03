import type { NotkerProject } from "./model";

export interface DocListOpts {
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}
export interface DocList { render(p: NotkerProject): void; }

export function createDocList(host: HTMLElement, opts: DocListOpts): DocList {
  function render(p: NotkerProject): void {
    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "doc-list";

    const head = document.createElement("div");
    head.className = "doc-list-head";
    head.appendChild(
      Object.assign(document.createElement("span"), {
        className: "doc-list-title",
        textContent: "Cantos",
      })
    );
    const add = document.createElement("button");
    add.className = "doc-add";
    add.textContent = "+";
    add.title = "Adicionar canto";
    add.addEventListener("click", () => opts.onAdd());
    head.appendChild(add);
    root.appendChild(head);

    for (const d of p.docs) {
      const item = document.createElement("div");
      item.className = "doc-item" + (d.id === p.activeId ? " active" : "");

      // Select handler on the whole item div — click anywhere on the row selects it
      item.addEventListener("click", () => opts.onSelect(d.id));

      const label = document.createElement("span");
      label.className = "doc-item-label";
      label.textContent = d.title;
      item.appendChild(label);

      if (p.docs.length > 1) {
        const x = document.createElement("button");
        x.className = "doc-remove";
        x.textContent = "×";
        x.title = "Remover canto";
        x.addEventListener("click", (ev) => {
          ev.stopPropagation(); // prevent select from also firing
          opts.onRemove(d.id);
        });
        item.appendChild(x);
      }
      root.appendChild(item);
    }
    host.appendChild(root);
  }
  return { render };
}
