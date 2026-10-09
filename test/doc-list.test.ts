import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDocList, type DocListOpts } from "../src/project/doc-list";
import type { NotkerProject } from "../src/project/model";

const proj = (over: Partial<NotkerProject> = {}): NotkerProject => ({
  schema: 1, kind: "notker-project", title: "P", family: "stgall", activeId: "a",
  docs: [
    { id: "a", title: "Puer natus", content: "" },
    { id: "b", title: "Viderunt", content: "", family: "laon" },
    { id: "c", title: "Dies", content: "" },
  ], ...over,
});
const opts = (): DocListOpts => ({ onSelect: vi.fn(), onAdd: vi.fn(), onImport: vi.fn(), onRemove: vi.fn(), onSetFamily: vi.fn(), onMove: vi.fn() });
let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("aside"); document.body.appendChild(host); });

describe("barra lateral de cantos", () => {
  it("linhas sem botões; ativa com aria-selected; legenda com a família efetiva", () => {
    createDocList(host, opts()).render(proj());
    const rows = host.querySelectorAll<HTMLElement>(".notker-row");
    expect(rows.length).toBe(3);
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[0].tabIndex).toBe(0);
    expect(rows[1].tabIndex).toBe(-1);
    expect(host.querySelector(".notker-sidebar__list button")).toBeNull();
    expect([...rows].map((r) => r.querySelector(".notker-row__meta")!.textContent)).toEqual(["St. Gall", "Laon", "St. Gall"]);
  });
  it("clique e Enter selecionam; ↓ move o foco", () => {
    const o = opts();
    createDocList(host, o).render(proj());
    const rows = host.querySelectorAll<HTMLElement>(".notker-row");
    rows[1].click();
    expect(o.onSelect).toHaveBeenCalledWith("b");
    rows[0].focus();
    rows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(o.onSelect).toHaveBeenLastCalledWith("b");
  });
  it("menu de contexto: família, mover e excluir", () => {
    const o = opts();
    createDocList(host, o).render(proj());
    const row = host.querySelectorAll<HTMLElement>(".notker-row")[2];
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }));
    const labels = [...host.querySelectorAll(".sc-menu__item")].map((b) => b.textContent);
    expect(labels.some((l) => l!.includes("Família: Laon"))).toBe(true);
    [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")].find((b) => b.textContent!.includes("Família: Laon"))!.click();
    expect(o.onSetFamily).toHaveBeenCalledWith("c", "laon");
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
    [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")].find((b) => b.textContent!.includes("Excluir canto"))!.click();
    expect(o.onRemove).toHaveBeenCalledWith("c");
  });
  it("com um só canto não há Excluir no menu", () => {
    createDocList(host, opts()).render(proj({ docs: [{ id: "a", title: "Só", content: "" }] }));
    host.querySelector<HTMLElement>(".notker-row")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect([...host.querySelectorAll(".sc-menu__item")].some((b) => b.textContent!.includes("Excluir"))).toBe(false);
  });
  it("rodapé: + Novo canto e menu para cima com Importar .gabc…", () => {
    const o = opts();
    createDocList(host, o).render(proj());
    const [add, more] = host.querySelectorAll<HTMLButtonElement>(".notker-sidebar__foot button");
    add.click();
    expect(o.onAdd).toHaveBeenCalled();
    more.click();
    [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")].find((b) => b.textContent!.includes("Importar .gabc"))!.click();
    expect(o.onImport).toHaveBeenCalled();
  });
});
