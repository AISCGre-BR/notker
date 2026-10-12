// test/tree-panel.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTreePanel, type TreePanelOpts } from "../src/project/tree-panel";
import type { NotkerProject, TreeNode, ChantNode, GroupNode } from "../src/project/tree";
import { createRegistry } from "../src/app/commands";

const c = (id: string, title: string, extra: Partial<ChantNode> = {}): ChantNode => ({ kind: "chant", id, title, content: "", ...extra });
const g = (id: string, title: string, children: TreeNode[], extra: Partial<GroupNode> = {}): GroupNode => ({ kind: "group", id, title, children, ...extra });
/** a · Natal(n)[ b(Laon) · Oitava(o)[ c ] ] · d      — ativo: b */
const proj = (over: Partial<NotkerProject> = {}): NotkerProject => ({
  schema: 2, kind: "notker-project", title: "P", family: "stgall", activeId: "b",
  root: [c("a", "Puer natus"), g("n", "Natal", [c("b", "Viderunt", { family: "laon" }), g("o", "Oitava", [c("c", "Dies")])]), c("d", "Lux")],
  ...over,
});
const opts = (): TreePanelOpts => ({
  onSelect: vi.fn(), onToggle: vi.fn(), onRename: vi.fn(), onMoveBy: vi.fn(), onMove: vi.fn(),
  onDuplicate: vi.fn(), onRemove: vi.fn(), onSetFamily: vi.fn(), onNewChant: vi.fn(), onNewGroup: vi.fn(), onImport: vi.fn(),
});
let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("aside"); document.body.appendChild(host); });
const rows = () => [...host.querySelectorAll<HTMLElement>(".notker-row")];
const row = (id: string) => host.querySelector<HTMLElement>(`.notker-row[data-id="${id}"]`)!;
const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};
const menuLabels = () => [...host.querySelectorAll<HTMLElement>(".sc-menu__item")].map((b) => b.children[1].textContent);
const clickMenu = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")].find((b) => b.children[1].textContent === label)!.click();
const openMenuOn = (id: string) => row(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

describe("árvore: estrutura ARIA", () => {
  it("linhas planas com nível, grupo expandido, ativo e legenda da família", () => {
    createTreePanel(host, opts()).render(proj());
    expect(host.querySelector('[role="tree"]')!.getAttribute("aria-label")).toBe("Cantos do projeto");
    expect(rows().map((r) => r.dataset.id)).toEqual(["a", "n", "b", "o", "c", "d"]);
    expect(rows().map((r) => r.getAttribute("aria-level"))).toEqual(["1", "1", "2", "2", "3", "1"]);
    expect(rows().every((r) => r.getAttribute("role") === "treeitem")).toBe(true);
    expect(row("n").getAttribute("aria-expanded")).toBe("true");
    expect(row("n").getAttribute("aria-posinset")).toBe("2");
    expect(row("n").getAttribute("aria-setsize")).toBe("3");
    expect(row("b").getAttribute("aria-selected")).toBe("true");
    expect(row("a").getAttribute("aria-selected")).toBe("false");
    expect(row("n").hasAttribute("aria-selected")).toBe(false);
    expect(row("b").querySelector(".notker-row__meta")!.textContent).toBe("Laon");
    expect(row("a").querySelector(".notker-row__meta")!.textContent).toBe("St. Gall");
    expect(row("n").querySelector(".notker-row__meta")).toBeNull();
    expect(row("b").tabIndex).toBe(0);
    expect(rows().filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(host.querySelector('[role="tree"] button')).toBeNull();
  });
  it("grupo recolhido esconde os filhos; com o ativo escondido, o tabindex vai ao grupo", () => {
    createTreePanel(host, opts()).render(proj({ root: [c("a", "A"), g("n", "Natal", [c("b", "B")], { collapsed: true })] }));
    expect(rows().map((r) => r.dataset.id)).toEqual(["a", "n"]);
    expect(row("n").getAttribute("aria-expanded")).toBe("false");
    expect(row("n").tabIndex).toBe(0);
  });
  it("título com marcação aparece como texto (sem innerHTML)", () => {
    createTreePanel(host, opts()).render(proj({ root: [c("a", '<img src=x onerror="alert(1)">')], activeId: "a" }));
    expect(row("a").querySelector("img")).toBeNull();
    expect(row("a").querySelector(".notker-row__name")!.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("árvore: mouse e teclado", () => {
  it("clique: canto abre; grupo (ou o chevron dele) alterna", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    row("d").click();
    expect(o.onSelect).toHaveBeenCalledWith("d");
    row("n").click();
    expect(o.onToggle).toHaveBeenCalledWith("n", true);
    row("o").querySelector<HTMLElement>(".notker-tree__chevron")!.click();
    expect(o.onToggle).toHaveBeenLastCalledWith("o", true);
  });
  it("↑/↓/Home/End percorrem as linhas visíveis", () => {
    createTreePanel(host, opts()).render(proj());
    row("a").focus();
    key(row("a"), "ArrowDown");
    expect(document.activeElement).toBe(row("n"));
    key(row("n"), "End");
    expect(document.activeElement).toBe(row("d"));
    key(row("d"), "ArrowUp");
    expect(document.activeElement).toBe(row("c"));
    key(row("c"), "Home");
    expect(document.activeElement).toBe(row("a"));
    expect(row("a").tabIndex).toBe(0);
    expect(rows().filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
  it("→ expande o recolhido ou entra no 1º filho; ← recolhe o aberto ou sobe ao pai", () => {
    const o = opts();
    const panel = createTreePanel(host, o);
    panel.render(proj({ root: [g("n", "Natal", [c("b", "B")], { collapsed: true })] }));
    row("n").focus();
    key(row("n"), "ArrowRight");
    expect(o.onToggle).toHaveBeenCalledWith("n", false);
    panel.render(proj());
    row("n").focus();
    key(row("n"), "ArrowRight");
    expect(document.activeElement).toBe(row("b"));
    key(row("b"), "ArrowLeft");
    expect(document.activeElement).toBe(row("n"));
    key(row("n"), "ArrowLeft");
    expect(o.onToggle).toHaveBeenLastCalledWith("n", true);
  });
  it("Enter abre o canto; Enter/Espaço no grupo alternam; Enter em composição é ignorado", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    key(row("d"), "Enter", { isComposing: true });
    expect(o.onSelect).not.toHaveBeenCalled();
    key(row("d"), "Enter");
    expect(o.onSelect).toHaveBeenCalledWith("d");
    key(row("n"), " ");
    expect(o.onToggle).toHaveBeenCalledWith("n", true);
  });
  it("teclas da árvore não disparam os comandos da janela (F2 = renomear, Alt+↑ = mover nó)", () => {
    const reg = createRegistry();
    const palette = vi.fn();
    const moveNeume = vi.fn();
    reg.register([
      { id: "neume.palette", label: "Buscar neuma…", run: palette, keys: ["F2"] },
      { id: "neume.moveUp", label: "Mover neuma", run: moveNeume, keys: ["Alt+ArrowUp"], allowRepeat: true },
    ]);
    const onWin = (e: KeyboardEvent) => { reg.handleKey(e); };
    window.addEventListener("keydown", onWin);
    try {
      const o = opts();
      createTreePanel(host, o).render(proj());
      row("d").focus();
      expect(key(row("d"), "ArrowUp", { altKey: true }).defaultPrevented).toBe(true);
      expect(o.onMoveBy).toHaveBeenCalledWith("d", -1);
      expect(key(row("d"), "ArrowLeft", { altKey: true }).defaultPrevented).toBe(true);
      expect(key(row("a"), "F2").defaultPrevented).toBe(true);
      expect(palette).not.toHaveBeenCalled();
      expect(moveNeume).not.toHaveBeenCalled();
      expect(row("a").querySelector("input.notker-tree__rename")).not.toBeNull();
    } finally {
      window.removeEventListener("keydown", onWin);
    }
  });
  it("Del exclui, Alt+↓ desce e Ctrl+D duplica", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    key(row("c"), "Delete");
    expect(o.onRemove).toHaveBeenCalledWith("c");
    key(row("a"), "ArrowDown", { altKey: true });
    expect(o.onMoveBy).toHaveBeenCalledWith("a", 1);
    key(row("n"), "d", { ctrlKey: true });
    expect(o.onDuplicate).toHaveBeenCalledWith("n");
  });
});

describe("árvore: Alt+0", () => {
  it("é consumido na linha (não move neuma no editor)", () => {
    createTreePanel(host, opts()).render(proj());
    expect(key(row("a"), "0", { altKey: true }).defaultPrevented).toBe(true);
  });
});

describe("árvore: renomear inline", () => {
  it("F2 abre o campo com o título; Enter grava aparado e devolve o foco à linha", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    row("a").focus();
    key(row("a"), "F2");
    const input = row("a").querySelector<HTMLInputElement>("input.notker-tree__rename")!;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Puer natus");
    input.value = "  Puer natus est  ";
    key(input, "Enter");
    expect(o.onRename).toHaveBeenCalledWith("a", "Puer natus est");
    expect(row("a").querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(row("a"));
  });
  it("Esc cancela; vazio ou igual não grava; Enter em composição não grava; blur grava", () => {
    const o = opts();
    const panel = createTreePanel(host, o);
    panel.render(proj());
    panel.startRename("n");
    let input = row("n").querySelector<HTMLInputElement>("input")!;
    input.value = "Outro";
    key(input, "Escape");
    expect(o.onRename).not.toHaveBeenCalled();
    expect(row("n").querySelector(".notker-row__name")!.textContent).toBe("Natal");
    panel.startRename("n");
    input = row("n").querySelector<HTMLInputElement>("input")!;
    input.value = "   ";
    key(input, "Enter");
    expect(o.onRename).not.toHaveBeenCalled();
    panel.startRename("n");
    input = row("n").querySelector<HTMLInputElement>("input")!;
    input.value = "Natal do Senhor";
    key(input, "Enter", { isComposing: true });
    expect(o.onRename).not.toHaveBeenCalled();
    input.dispatchEvent(new FocusEvent("blur"));
    expect(o.onRename).toHaveBeenCalledWith("n", "Natal do Senhor");
    expect(o.onRename).toHaveBeenCalledTimes(1);
  });
});

describe("árvore: menu de contexto e rodapé", () => {
  it("menu do canto: itens, família, aqui e mover", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    openMenuOn("a");
    expect(menuLabels()).toEqual(["Renomear", "Duplicar", "Família: St. Gall", "Família: Laon", "Novo canto aqui", "Novo grupo aqui", "Mover para baixo", "Excluir canto"]);
    clickMenu("Família: Laon");
    expect(o.onSetFamily).toHaveBeenCalledWith("a", "laon");
    expect(host.querySelector(".sc-menu")).toBeNull();
    openMenuOn("a");
    clickMenu("Novo canto aqui");
    expect(o.onNewChant).toHaveBeenCalledWith(null, 1);
    openMenuOn("c");
    expect(menuLabels()).not.toContain("Mover para cima");
    expect(menuLabels()).not.toContain("Mover para baixo");
  });
  it("menu do grupo: sem família; 'aqui' = último filho; Renomear abre o campo", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    openMenuOn("n");
    expect(menuLabels()).toEqual(["Renomear", "Duplicar", "Novo canto aqui", "Novo grupo aqui", "Mover para cima", "Mover para baixo", "Excluir grupo"]);
    clickMenu("Novo grupo aqui");
    expect(o.onNewGroup).toHaveBeenCalledWith("n", 2);
    openMenuOn("n");
    clickMenu("Excluir grupo");
    expect(o.onRemove).toHaveBeenCalledWith("n");
    openMenuOn("n");
    clickMenu("Renomear");
    expect(document.activeElement).toBe(row("n").querySelector("input.notker-tree__rename"));
  });
  it("Shift+F10 abre o menu da linha; Esc fecha e devolve o foco", () => {
    createTreePanel(host, opts()).render(proj());
    row("d").focus();
    key(row("d"), "F10", { shiftKey: true });
    expect(host.querySelector('.sc-menu[role="menu"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.querySelector(".sc-menu")).toBeNull();
    expect(document.activeElement).toBe(row("d"));
  });
  it("rodapé: + Novo canto e menu com Novo canto · Novo grupo · Importar .gabc…", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    const [add, more] = host.querySelectorAll<HTMLButtonElement>(".notker-sidebar__foot button");
    add.click();
    expect(o.onNewChant).toHaveBeenCalledWith(null, Infinity);
    more.click();
    expect(menuLabels()).toEqual(["Novo canto", "Novo grupo", "Importar .gabc…"]);
    clickMenu("Novo grupo");
    expect(o.onNewGroup).toHaveBeenCalledWith(null, Infinity);
    more.click();
    clickMenu("Importar .gabc…");
    expect(o.onImport).toHaveBeenCalled();
  });
  it("render mantém o foco na linha do mesmo nó e fecha o menu aberto", () => {
    const panel = createTreePanel(host, opts());
    panel.render(proj());
    row("d").focus();
    openMenuOn("a");
    row("d").focus();
    panel.render(proj());
    expect(host.querySelector(".sc-menu")).toBeNull();
    expect(document.activeElement).toBe(row("d"));
  });
  it("focusNode foca a linha, ou a do ancestral visível", () => {
    const panel = createTreePanel(host, opts());
    panel.render(proj({ root: [c("a", "A"), g("n", "Natal", [c("b", "B")], { collapsed: true })], activeId: "a" }));
    panel.focusNode("b");
    expect(document.activeElement).toBe(row("n"));
    panel.focusNode("a");
    expect(document.activeElement).toBe(row("a"));
  });
  it("render com renomear aberto encerra o campo sem chamar onRename", () => {
    const o = opts();
    const panel = createTreePanel(host, o);
    panel.render(proj());
    panel.startRename("a");
    const input = row("a").querySelector<HTMLInputElement>("input")!;
    input.value = "Mudado";
    // Navegadores reais disparam blur ao remover o elemento focado (jsdom não): simula.
    const list = host.querySelector<HTMLElement>('[role="tree"]')!;
    const orig = list.replaceChildren.bind(list);
    list.replaceChildren = (...n: (Node | string)[]) => { input.dispatchEvent(new Event("blur")); orig(...n); };
    panel.render(proj());
    expect(host.querySelector("input.notker-tree__rename")).toBeNull();
    expect(o.onRename).not.toHaveBeenCalled();
  });
});

describe("árvore: arrastar e soltar (Pointer Events)", () => {
  const rect = (i: number) => ({ top: i * 30, bottom: i * 30 + 30, height: 30, left: 0, right: 240, width: 240, x: 0, y: i * 30, toJSON() { return this; } }) as DOMRect;
  const layout = () => rows().forEach((r, i) => { r.getBoundingClientRect = () => rect(i); });
  const down = (id: string, y: number) => row(id).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 20, clientY: y }));
  const move = (y: number) => window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: y, buttons: 1 }));
  const up = (y: number) => window.dispatchEvent(new MouseEvent("pointerup", { clientX: 20, clientY: y }));

  it("soltar no meio de um grupo põe dentro dele; o clique seguinte não abre canto", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(105);                                   // meio de "o"
    expect(row("o").classList.contains("is-drop-inside")).toBe(true);
    expect(document.body.classList.contains("notker-dragging")).toBe(true);
    up(105);
    expect(o.onMove).toHaveBeenCalledWith("a", "o", 1);
    expect(row("o").classList.contains("is-drop-inside")).toBe(false);
    expect(document.body.classList.contains("notker-dragging")).toBe(false);
    row("a").click();
    expect(o.onSelect).not.toHaveBeenCalled();
  });
  it("entre linhas mostra o indicador rubrica na borda", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(152);                                   // topo de "d"
    const ind = host.querySelector<HTMLElement>(".notker-tree__drop")!;
    expect(ind.hidden).toBe(false);
    expect(ind.style.top).toBe("149px");
    up(152);
    expect(o.onMove).toHaveBeenCalledWith("a", null, 2);
    expect(ind.hidden).toBe(true);
  });
  it("menos de 4 px é clique, não arrasto", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(12);
    up(12);
    expect(o.onMove).not.toHaveBeenCalled();
    row("a").click();
    expect(o.onSelect).toHaveBeenCalledWith("a");
  });
  it("grupo não entra em si mesmo nem num descendente", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("n", 40);
    move(135);                                   // "c", dentro de "o", dentro de "n"
    up(135);
    expect(o.onMove).not.toHaveBeenCalled();
  });
  it("Esc cancela o arrasto", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(105);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    up(105);
    expect(o.onMove).not.toHaveBeenCalled();
    expect(host.querySelector(".is-drop-inside")).toBeNull();
  });
  it("pointerup perdido: mover sem botão pressionado encerra o arrasto e nunca chama onMove", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(105);                                   // arrasto ativo
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 105, buttons: 0 }));
    expect(document.body.classList.contains("notker-dragging")).toBe(false);
    move(105);
    up(105);
    row("d").click();
    expect(o.onMove).not.toHaveBeenCalled();
  });
  it("perder o foco da janela (blur) encerra o arrasto sem mover", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(105);
    window.dispatchEvent(new Event("blur"));
    expect(document.body.classList.contains("notker-dragging")).toBe(false);
    up(105);
    expect(o.onMove).not.toHaveBeenCalled();
  });
  it("novo pointerdown com arrasto antigo pendurado encerra o velho e funciona", () => {
    const o = opts();
    createTreePanel(host, o).render(proj());
    layout();
    down("a", 10);
    move(105);                                   // pendurado (pointerup perdido)
    down("d", 130);
    move(75);                                    // topo de "n"... qualquer alvo válido
    up(75);
    expect(o.onMove).toHaveBeenCalledTimes(1);
    expect((o.onMove as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("d");
  });
  it("o painel não usa a API HTML5 de arrastar", () => {
    createTreePanel(host, opts()).render(proj());
    expect(host.querySelector("[draggable]")).toBeNull();
  });
});

describe("árvore: seleção para o Exportar PDF", () => {
  it("focusedId: a linha do canto ativo até o usuário focar outra; depois, a última focada (grupo inclusive)", () => {
    const panel = createTreePanel(host, opts());
    panel.render(proj());
    expect(panel.focusedId()).toBe("b");
    row("n").focus();
    expect(panel.focusedId()).toBe("n");
    (document.activeElement as HTMLElement).blur(); // foco foi para o editor: a seleção fica
    panel.render(proj());
    expect(panel.focusedId()).toBe("n");
  });
});
