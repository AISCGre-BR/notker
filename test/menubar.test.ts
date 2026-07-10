import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMenubar, type MenuSpec } from "../src/ui/menubar";
import type { Commands } from "../src/ui/commands";

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
  return { host, run, bar };
}

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

beforeEach(() => { document.body.innerHTML = ""; });

describe("menubar", () => {
  it("renderiza os rótulos de topo, sem dropdown aberto", () => {
    const { host } = mount(BASIC);
    const tops = [...host.querySelectorAll(".menubar-top")].map((b) => b.textContent);
    expect(tops).toEqual(["Arquivo", "Exibir"]);
    expect(host.querySelector(".menu-pop")).toBeNull();
  });

  it("clique no topo abre o dropdown com itens, atalhos e separador", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".menubar-top")[0].click();
    const pop = host.querySelector(".menu-pop")!;
    expect(pop).not.toBeNull();
    expect(pop.textContent).toContain("Abrir…");
    expect(pop.textContent).toContain("Ctrl+O");
    expect(pop.querySelectorAll(".menu-sep")).toHaveLength(1);
  });

  it("clique em item roda o comando e fecha o menu", () => {
    const { host, run } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".menubar-top")[0].click();
    const item = [...host.querySelectorAll<HTMLButtonElement>(".menu-item")]
      .find((b) => b.textContent!.includes("Salvar"))!;
    item.click();
    expect(run).toHaveBeenCalledWith("saveFile");
    expect(host.querySelector(".menu-pop")).toBeNull();
  });

  it("checked() true exibe o fleuron ❧", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".menubar-top")[1].click();
    const item = host.querySelector(".menu-item")!;
    expect(item.querySelector(".menu-check")!.textContent).toContain("❧");
  });

  it("enabled() false desabilita o item (clique não roda)", () => {
    const menus: MenuSpec[] = [{
      label: "Interpretação",
      items: [{ cmd: "resetWave", label: "Resetar onda", enabled: () => false }],
    }];
    const { host, run } = mount(menus);
    host.querySelector<HTMLButtonElement>(".menubar-top")!.click();
    const item = host.querySelector<HTMLButtonElement>(".menu-item")!;
    expect(item.disabled).toBe(true);
    item.click();
    expect(run).not.toHaveBeenCalled();
  });

  it("Esc fecha; clique fora fecha", () => {
    const { host } = mount(BASIC);
    host.querySelectorAll<HTMLButtonElement>(".menubar-top")[0].click();
    expect(host.querySelector(".menu-pop")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.querySelector(".menu-pop")).toBeNull();

    host.querySelectorAll<HTMLButtonElement>(".menubar-top")[0].click();
    expect(host.querySelector(".menu-pop")).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(host.querySelector(".menu-pop")).toBeNull();
  });

  it("com um menu aberto, hover no vizinho troca o dropdown", () => {
    const { host } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".menubar-top");
    tops[0].click();
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Abrir…");
    tops[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Partitura");
  });

  it("fechado, hover NÃO abre menu", () => {
    const { host } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".menubar-top");
    tops[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(host.querySelector(".menu-pop")).toBeNull();
  });

  it("teclado: ↓/↑ movem o foco entre itens, Enter executa, → troca de menu", () => {
    const { host, run } = mount(BASIC);
    const tops = host.querySelectorAll<HTMLButtonElement>(".menubar-top");
    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    let items = [...host.querySelectorAll<HTMLButtonElement>(".menu-item")];
    expect(document.activeElement).toBe(items[0]); // Abrir…
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[1]); // Salvar (pula separador)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(run).toHaveBeenCalledWith("openFile");
    expect(host.querySelector(".menu-pop")).toBeNull();

    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Partitura");
  });

  it("a11y: roles e aria de menu (haspopup/expanded/menuitemcheckbox/checked)", () => {
    const { host } = mount(BASIC);
    const top = host.querySelectorAll<HTMLButtonElement>(".menubar-top")[1];
    expect(top.getAttribute("aria-haspopup")).toBe("menu");
    expect(top.getAttribute("aria-expanded")).toBe("false");
    top.click();
    expect(top.getAttribute("aria-expanded")).toBe("true");
    const pop = host.querySelector(".menu-pop")!;
    expect(pop.getAttribute("role")).toBe("menu");
    const item = pop.querySelector(".menu-item")!; // Partitura, checked()=true
    expect(item.getAttribute("role")).toBe("menuitemcheckbox");
    expect(item.getAttribute("aria-checked")).toBe("true");
    top.click();
    expect(top.getAttribute("aria-expanded")).toBe("false");
    // item sem checked() é menuitem simples
    const tops = host.querySelectorAll<HTMLButtonElement>(".menubar-top");
    tops[0].click();
    expect(host.querySelector(".menu-item")!.getAttribute("role")).toBe("menuitem");
  });

  it("clicar de novo no mesmo topo fecha; closeAll() fecha programaticamente", () => {
    const { host, bar } = mount(BASIC);
    const top = host.querySelectorAll<HTMLButtonElement>(".menubar-top")[0];
    top.click();
    expect(host.querySelector(".menu-pop")).not.toBeNull();
    top.click();
    expect(host.querySelector(".menu-pop")).toBeNull();
    top.click();
    bar.closeAll();
    expect(host.querySelector(".menu-pop")).toBeNull();
  });

  it("teclado: ← troca de menu com wrap; menu todo desabilitado não quebra ↓", () => {
    const menus: MenuSpec[] = [
      { label: "A", items: [{ cmd: "x", label: "X", enabled: () => false }] },
      { label: "B", items: [{ cmd: "y", label: "Y" }] },
    ];
    const { host } = mount(menus);
    const tops = host.querySelectorAll<HTMLButtonElement>(".menubar-top");
    tops[0].click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); // sem itens habilitados: no-op
    expect(host.querySelector(".menu-pop")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); // wrap 0 → último
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Y");
  });

  it("label() e checked() são reavaliados a cada abertura", () => {
    let on = false;
    const menus: MenuSpec[] = [{
      label: "Interpretação",
      items: [{ cmd: "modeToggle", label: () => (on ? "Modo: Solfejo" : "Modo: Interpretado"), checked: () => on }],
    }];
    const { host } = mount(menus);
    const top = host.querySelector<HTMLButtonElement>(".menubar-top")!;
    top.click();
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Modo: Interpretado");
    expect(host.querySelector(".menu-check")!.textContent).not.toContain("❧");
    top.click(); // fecha
    on = true;
    top.click(); // reabre — estado fresco
    expect(host.querySelector(".menu-pop")!.textContent).toContain("Modo: Solfejo");
    expect(host.querySelector(".menu-check")!.textContent).toContain("❧");
  });
});
