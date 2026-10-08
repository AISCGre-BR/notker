import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToolbar, type ToolbarEntry } from "../src/ui/toolbar";
import type { Commands } from "../src/app/commands";

describe("toolbar", () => {
  it("cada botão dispara o comando correspondente", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const host = document.createElement("div");
    createToolbar(host, { run, ids: () => ["openFile", "openSearch", "togglePreview"] } as any, [
      { id: "openFile", label: "Abrir" },
      { id: "openSearch", label: "Buscar" },
      { id: "togglePreview", label: "Preview" },
    ]);
    const btns = host.querySelectorAll("button.toolbar-btn");
    expect(btns.length).toBe(3);
    (btns[1] as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledWith("openSearch");
  });
});

function mount(items: ToolbarEntry[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const run = vi.fn(async () => {});
  const commands: Commands = { ids: () => [], run };
  const handle = createToolbar(host, commands, items);
  return { host, run, handle };
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("toolbar contextual (spec B)", () => {
  it("botões ganham data-cmd", () => {
    const { host } = mount([{ id: "playToggle", label: "Tocar" }]);
    expect(host.querySelector<HTMLButtonElement>('[data-cmd="playToggle"]')).not.toBeNull();
  });

  it('"|" vira separador de grupo', () => {
    const { host } = mount([
      { id: "playToggle", label: "Tocar" },
      "|",
      { id: "moveUp", label: "▲" },
    ]);
    expect(host.querySelectorAll(".toolbar-sep")).toHaveLength(1);
  });

  it("setLabel troca o texto pelo data-cmd (sem hack de title)", () => {
    const { host, handle } = mount([{ id: "playToggle", label: "Tocar" }]);
    handle.setLabel("playToggle", "Parar");
    expect(host.querySelector('[data-cmd="playToggle"]')!.textContent).toBe("Parar");
  });

  it("setPressed liga aria-pressed e classe .pressed", () => {
    const { host, handle } = mount([{ id: "toggleWave", label: "Onda" }]);
    const btn = host.querySelector<HTMLButtonElement>('[data-cmd="toggleWave"]')!;
    handle.setPressed("toggleWave", true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.classList.contains("pressed")).toBe(true);
    handle.setPressed("toggleWave", false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.classList.contains("pressed")).toBe(false);
  });

  it("primary marca o botão com .toolbar-primary", () => {
    const { host } = mount([{ id: "playToggle", label: "Tocar", primary: true }]);
    expect(host.querySelector('[data-cmd="playToggle"]')!.classList.contains("toolbar-primary")).toBe(true);
  });
});
