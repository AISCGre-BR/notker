import { describe, it, expect, vi } from "vitest";
import { createDocList } from "../src/project/doc-list";
import { newProject, addDoc } from "../src/project/model";

describe("lista de documentos", () => {
  it("renderiza um item por doc, marca o ativo e dispara onSelect", () => {
    const host = document.createElement("div");
    let p = newProject({ family: "stgall", name: "A" });
    p = addDoc(p, { title: "B", content: "name: B;\n%%\n(c4) b" });
    const onSelect = vi.fn();
    const list = createDocList(host, { onSelect, onAdd: vi.fn(), onRemove: vi.fn() });
    list.render(p);
    const items = host.querySelectorAll(".doc-item");
    expect(items.length).toBe(2);
    expect(host.querySelector(".doc-item.active")!.textContent).toContain("A");
    (items[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith(p.docs[1].id);
  });

  it("o botão + chama onAdd e o × chama onRemove com o id do ativo", () => {
    const host = document.createElement("div");
    let p = newProject({ family: "stgall", name: "A" });
    p = addDoc(p, { title: "B", content: "name: B;\n%%\n(c4) b" }); // × só aparece com >1 doc
    const onAdd = vi.fn(); const onRemove = vi.fn();
    const list = createDocList(host, { onSelect: vi.fn(), onAdd, onRemove });
    list.render(p);
    host.querySelector<HTMLButtonElement>(".doc-add")!.click();
    expect(onAdd).toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>(".doc-remove")!.click(); // × do 1º doc (ativo)
    expect(onRemove).toHaveBeenCalledWith(p.activeId);
  });
});
