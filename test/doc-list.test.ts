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

  // Botão "+" antigo (doc-add) foi removido do cabeçalho; agora é doc-add-row no rodapé.
  it("o doc-add-row chama onAdd e o × chama onRemove com o id do ativo", () => {
    const host = document.createElement("div");
    let p = newProject({ family: "stgall", name: "A" });
    p = addDoc(p, { title: "B", content: "name: B;\n%%\n(c4) b" }); // × só aparece com >1 doc
    const onAdd = vi.fn(); const onRemove = vi.fn();
    const list = createDocList(host, { onSelect: vi.fn(), onAdd, onRemove });
    list.render(p);
    // Linha "+ Adicionar canto" (substitui o botão "+" do cabeçalho)
    host.querySelector<HTMLButtonElement>(".doc-add-row")!.click();
    expect(onAdd).toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>(".doc-remove")!.click(); // × do 1º doc (ativo)
    expect(onRemove).toHaveBeenCalledWith(p.activeId);
  });

  it("renderiza .doc-add-row com texto '+ Adicionar canto' após os itens", () => {
    const host = document.createElement("div");
    const p = newProject({ family: "stgall", name: "A" });
    const list = createDocList(host, { onSelect: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() });
    list.render(p);
    const btn = host.querySelector<HTMLButtonElement>(".doc-add-row");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("+ Adicionar canto");
    // Deve aparecer após os itens de doc no DOM
    const allChildren = Array.from(host.querySelector(".doc-list")!.children);
    const itemIdx = allChildren.findIndex((el) => el.classList.contains("doc-item"));
    const addRowIdx = allChildren.findIndex((el) => el.classList.contains("doc-add-row"));
    expect(addRowIdx).toBeGreaterThan(itemIdx);
  });

  it("NÃO existe mais botão .doc-add no cabeçalho", () => {
    const host = document.createElement("div");
    const p = newProject({ family: "stgall", name: "A" });
    const list = createDocList(host, { onSelect: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() });
    list.render(p);
    expect(host.querySelector(".doc-add")).toBeNull();
    expect(host.querySelector(".doc-list-head .doc-add")).toBeNull();
  });
});
