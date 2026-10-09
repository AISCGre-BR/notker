import { describe, it, expect, vi, beforeEach } from "vitest";
import { openContextMenu } from "../src/ui/pd/context-menu";

beforeEach(() => { document.body.innerHTML = '<div id="anchor"></div><button id="back">b</button>'; });

describe("menu de contexto", () => {
  it("abre sc-menu com role=menu no ponto, foca o 1º item; clique executa e fecha", () => {
    const run = vi.fn();
    const anchor = document.getElementById("anchor")!;
    openContextMenu(anchor, 10, 20, [{ label: "Mover para cima", run }, "---", { label: "Excluir canto", run: vi.fn(), danger: true }]);
    const m = anchor.querySelector<HTMLElement>('.sc-menu[role="menu"]')!;
    expect(m.style.left).toBe("10px");
    expect(document.activeElement).toBe(m.querySelector(".sc-menu__item"));
    expect(m.querySelectorAll(".sc-menu__sep").length).toBe(1);
    (m.querySelector(".sc-menu__item") as HTMLButtonElement).click();
    expect(run).toHaveBeenCalled();
    expect(anchor.querySelector(".sc-menu")).toBeNull();
  });
  it("Esc fecha e devolve o foco", () => {
    const anchor = document.getElementById("anchor")!;
    const back = document.getElementById("back")!;
    openContextMenu(anchor, 0, 0, [{ label: "A", run: vi.fn() }], back);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(anchor.querySelector(".sc-menu")).toBeNull();
    expect(document.activeElement).toBe(back);
  });
  it("↓/↑ navegam entre os itens", () => {
    const anchor = document.getElementById("anchor")!;
    openContextMenu(anchor, 0, 0, [{ label: "A", run: vi.fn() }, { label: "B", run: vi.fn() }]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement!.textContent).toContain("B");
  });
  it("Tab fecha; abrir outro menu fecha o anterior sem vazar listeners", () => {
    const anchor = document.getElementById("anchor")!;
    openContextMenu(anchor, 0, 0, [{ label: "A", run: vi.fn() }]);
    openContextMenu(anchor, 0, 0, [{ label: "B", run: vi.fn() }]);
    expect(anchor.querySelectorAll(".sc-menu").length).toBe(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(anchor.querySelector(".sc-menu")).toBeNull();
  });
});
