import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMenubar, type MenuSpec } from "../src/ui/menubar";
import type { Commands } from "../src/app/commands";

function fakeCommands() {
  const run = vi.fn(async () => {});
  const commands: Commands = { ids: () => [], run };
  return { commands, run };
}

function mount(menus: MenuSpec[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const { commands, run } = fakeCommands();
  const bar = createMenubar(host, commands, menus);
  bars.push(bar);
  return { host, run, bar };
}
const bars: { destroy(): void }[] = [];

const BASIC: MenuSpec[] = [
  {
    label: "Arquivo",
    items: [
      { cmd: "openFile", label: "Abrir…", shortcut: "Ctrl+O" },
      "---",
      { cmd: "saveFile", label: "Salvar", shortcut: "Ctrl+S" },
    ],
  },
  {
    label: "Exibir",
    items: [{ cmd: "togglePreview", label: "Partitura", checked: () => true }],
  },
];

beforeEach(() => { bars.splice(0).forEach((b) => b.destroy()); document.body.innerHTML = ""; });

describe("menubar", () => {
  it("renderiza os rótulos de topo, sem dropdown aberto", () => {
    const { host } = mount(BASIC);
    const tops = [...host.querySelectorAll(".sc-menubar__top")].map((b) => b.textContent);
    expect(tops).toEqual(["Arquivo", "Exibir"]);
    expect(host.querySelector(".sc-menu")).toBeNull();
  });

  it("clique no topo abre o dropdown com itens, atalhos e separador", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[0].click();
    const pop = host.querySelector(".sc-menu")!;
    expect(pop).not.toBeNull();
    expect(pop.textContent).toContain("Abrir…");
    expect(pop.textContent).toContain("Ctrl+O");
    expect(pop.querySelectorAll(".sc-menu__sep")).toHaveLength(1);
  });

  it("clique em item roda o comando e fecha o menu", () => {
    const { host, run } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[0].click();
    const item = [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")]
      .find((b) => b.textContent!.includes("Salvar"))!;
    item.click();
    expect(run).toHaveBeenCalledWith("saveFile");
    expect(host.querySelector(".sc-menu")).toBeNull();
  });

  it("checked() true exibe o check ✓", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[1].click();
    const item = host.querySelector(".sc-menu__item")!;
    expect(item.querySelector(".sc-menu__check")!.textContent).toContain("✓");
  });

  it("enabled() false desabilita o item (clique não roda)", () => {
    const menus: MenuSpec[] = [{
      label: "Interpretação",
      items: [{ cmd: "resetWave", label: "Resetar onda", enabled: () => false }],
    }];
    const { host, run } = mount(menus);
    host.querySelector<HTMLButtonElement>(".sc-menubar__top")!.click();
    const item = host.querySelector<HTMLButtonElement>(".sc-menu__item")!;
    expect(item.disabled).toBe(true);
    item.click();
    expect(run).not.toHaveBeenCalled();
  });

  it("Esc fecha; clique fora fecha", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[0].click();
    expect(host.querySelector(".sc-menu")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.querySelector(".sc-menu")).toBeNull();

    host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[0].click();
    expect(host.querySelector(".sc-menu")).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(host.querySelector(".sc-menu")).toBeNull();
  });

  it("com um menu aberto, hover no vizinho troca o dropdown", () => {
    const { host } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top");
    tops[0].click();
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Abrir…");
    tops[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Partitura");
  });

  it("fechado, hover NÃO abre menu", () => {
    const { host } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top");
    tops[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(host.querySelector(".sc-menu")).toBeNull();
  });

  it("teclado: ↓/↑ movem o foco entre itens, Enter executa, → troca de menu", () => {
    const { host, run } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top");
    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    let items = [...host.querySelectorAll<HTMLButtonElement>(".sc-menu__item")];
    expect(document.activeElement).toBe(items[0]); // Abrir…
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[1]); // Salvar (pula separador)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(run).toHaveBeenCalledWith("openFile");
    expect(host.querySelector(".sc-menu")).toBeNull();

    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Partitura");
  });

  it("a11y: roles e aria de menu (haspopup/expanded/menuitemcheckbox/checked)", () => {
    const { host } = mount(BASIC);
    const top = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[1];
    expect(top.getAttribute("aria-haspopup")).toBe("menu");
    expect(top.getAttribute("aria-expanded")).toBe("false");
    top.click();
    expect(top.getAttribute("aria-expanded")).toBe("true");
    const pop = host.querySelector(".sc-menu")!;
    expect(pop.getAttribute("role")).toBe("menu");
    const item = pop.querySelector(".sc-menu__item")!; // Partitura, checked()=true
    expect(item.getAttribute("role")).toBe("menuitemcheckbox");
    expect(item.getAttribute("aria-checked")).toBe("true");
    top.click();
    expect(top.getAttribute("aria-expanded")).toBe("false");
    // item sem checked() é menuitem simples
    const tops = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top");
    tops[0].click();
    expect(host.querySelector(".sc-menu__item")!.getAttribute("role")).toBe("menuitem");
  });

  it("clicar de novo no mesmo topo fecha; closeAll() fecha programaticamente", () => {
    const { host, bar } = mount(BASIC);
    const top = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top")[0];
    top.click();
    expect(host.querySelector(".sc-menu")).not.toBeNull();
    top.click();
    expect(host.querySelector(".sc-menu")).toBeNull();
    top.click();
    bar.closeAll();
    expect(host.querySelector(".sc-menu")).toBeNull();
  });

  it("teclado: ← troca de menu com wrap; menu todo desabilitado não quebra ↓", () => {
    const menus: MenuSpec[] = [
      { label: "A", items: [{ cmd: "x", label: "X", enabled: () => false }] },
      { label: "B", items: [{ cmd: "y", label: "Y" }] },
    ];
    const { host } = mount(menus);
    const tops = host.querySelectorAll<HTMLButtonElement>(".sc-menubar__top");
    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); // sem itens habilitados: no-op
    expect(host.querySelector(".sc-menu")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); // wrap 0 → último
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Y");
  });

  it("label() e checked() são reavaliados a cada abertura", () => {
    let on = false;
    const menus: MenuSpec[] = [{
      label: "Interpretação",
      items: [{ cmd: "modeToggle", label: () => (on ? "Modo: Solfejo" : "Modo: Interpretado"), checked: () => on }],
    }];
    const { host } = mount(menus);
    const top = host.querySelector<HTMLButtonElement>(".sc-menubar__top")!;
    top.click();
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Modo: Interpretado");
    expect(host.querySelector(".sc-menu__check")!.textContent).not.toContain("✓");
    top.click(); // fecha
    on = true;
    top.click(); // reabre — estado fresco
    expect(host.querySelector(".sc-menu")!.textContent).toContain("Modo: Solfejo");
    expect(host.querySelector(".sc-menu__check")!.textContent).toContain("✓");
  });
});

describe("menubar — marca e título", () => {
  it("marca do app 'N' e título centralizado com estado", () => {
    const { host, bar } = mount(BASIC);
    expect(host.querySelector(".sc-menubar__brand")!.textContent).toBe("N");
    bar.setTitle("Missa de Natal", true);
    expect(host.querySelector(".sc-menubar__title")!.textContent).toBe("Missa de Natal— Editado");
    expect(host.querySelector(".sc-menubar__state")!.textContent).toBe("— Editado");
    bar.setTitle("Missa de Natal", false);
    expect(host.querySelector(".sc-menubar__state")).toBeNull();
  });
});

describe("menubar — Alt e foco", () => {
  const key = (type: string, k: string, extra: KeyboardEventInit = {}) =>
    document.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, ...extra }));

  it("Alt sozinho foca o 1º botão de topo", () => {
    const { host } = mount(BASIC);
    key("keydown", "Alt", { altKey: true });
    key("keyup", "Alt");
    expect(document.activeElement).toBe(host.querySelector(".sc-menubar__top"));
  });

  it("Alt com outra tecla no meio não foca", () => {
    mount(BASIC);
    key("keydown", "Alt", { altKey: true });
    key("keydown", "ArrowLeft", { altKey: true });
    key("keyup", "Alt");
    expect(document.activeElement).toBe(document.body);
  });

  it("Alt dentro de input não foca", () => {
    mount(BASIC);
    const inp = document.createElement("input");
    document.body.appendChild(inp);
    inp.focus();
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
    expect(document.activeElement).toBe(inp);
  });

  it("ao fechar com Esc, o foco volta a quem tinha antes de abrir", () => {
    const { host } = mount(BASIC);
    const ed = document.createElement("textarea");
    document.body.appendChild(ed);
    ed.focus();
    host.querySelector<HTMLButtonElement>(".sc-menubar__top")!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(ed);
  });

  it("abrir com o mouse (mousedown, foco no botão, click) e Esc devolve o foco", () => {
    const { host } = mount(BASIC);
    const ed = document.createElement("textarea");
    document.body.appendChild(ed);
    ed.focus();
    const top = host.querySelector<HTMLButtonElement>(".sc-menubar__top")!;
    top.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    top.focus();
    top.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(ed);
  });

  it("Alt com menu aberto fecha o menu e devolve o foco", () => {
    const { host } = mount(BASIC);
    const ed = document.createElement("textarea");
    document.body.appendChild(ed);
    ed.focus();
    host.querySelector<HTMLButtonElement>(".sc-menubar__top")!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }));
    expect(host.querySelector(".sc-menu")).toBeNull();
    expect(document.activeElement).toBe(ed);
  });
});
