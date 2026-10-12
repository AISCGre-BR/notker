// test/toolbar.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToolbar } from "../src/ui/toolbar";
import { createRegistry } from "../src/app/commands";

beforeEach(() => { document.body.innerHTML = ""; });

function setup() {
  const r = createRegistry();
  let wave = false, playing = false;
  const fmt = vi.fn();
  r.register([
    { id: "edit.format", label: "Formatar", icon: "wand-sparkles", keys: ["Ctrl+Shift+F"], run: fmt },
    { id: "wave.toggle", label: "Onda de interpretação", icon: "chart-column", run: () => { wave = !wave; }, checked: () => wave },
    { id: "wave.reset", label: "Resetar onda", icon: "rotate-ccw", run: () => {}, enabled: () => wave },
    { id: "play.toggle", label: () => (playing ? "Parar" : "Tocar"), run: () => { playing = !playing; } },
  ]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const h = createToolbar(host, r, [{ group: ["edit.format"] }, { group: ["wave.toggle", "wave.reset"] }, "spacer", { primary: "play.toggle" }]);
  return { host, h, fmt };
}

describe("toolbar Parchment", () => {
  it("ferramentas são só ícone, com aria-label e tooltip com atalho", () => {
    const { host } = setup();
    const b = host.querySelector<HTMLButtonElement>('[data-cmd="edit.format"]')!;
    expect(b.classList.contains("is-icon")).toBe(true);
    expect(b.textContent).toBe("");
    expect(b.querySelector("svg")).not.toBeNull();
    expect(b.getAttribute("aria-label")).toBe("Formatar");
    expect(b.dataset.tip).toBe("Formatar (Ctrl+Shift+F)");
    expect(b.hasAttribute("title")).toBe(false); // tooltip próprio, não o nativo
    expect(b.closest(".sc-seg")).not.toBeNull();
  });
  it("clique executa o comando", async () => {
    const { host, fmt } = setup();
    host.querySelector<HTMLButtonElement>('[data-cmd="edit.format"]')!.click();
    await Promise.resolve();
    expect(fmt).toHaveBeenCalledTimes(1);
  });
  it("toggle reflete aria-pressed; contextual fica desabilitado até aplicável", async () => {
    const { host } = setup();
    const wave = host.querySelector<HTMLButtonElement>('[data-cmd="wave.toggle"]')!;
    const reset = host.querySelector<HTMLButtonElement>('[data-cmd="wave.reset"]')!;
    expect(wave.getAttribute("aria-pressed")).toBe("false");
    expect(reset.disabled).toBe(true);
    wave.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(wave.getAttribute("aria-pressed")).toBe("true");
    expect(reset.disabled).toBe(false);
  });
  it("ação principal é a única preenchida, com texto, e troca Tocar/Parar no refresh", async () => {
    const { host, h } = setup();
    const p = host.querySelector<HTMLButtonElement>('[data-cmd="play.toggle"]')!;
    expect(host.querySelectorAll(".sc-btn--filled").length).toBe(1);
    expect(p.textContent).toBe("Tocar");
    p.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(p.textContent).toBe("Parar");
    h.refresh();
    expect(p.textContent).toBe("Parar");
  });
  it("run() fora do clique (menu/teclado) também atualiza a toolbar", async () => {
    const r = createRegistry();
    let on = false, playing = false;
    r.register([
      { id: "v.t", label: "Alternar", icon: "columns-2", run: () => { on = !on; }, checked: () => on },
      { id: "p.t", label: () => (playing ? "Parar" : "Tocar"), run: () => { playing = !playing; } },
    ]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    createToolbar(host, r, [{ group: ["v.t"] }, { primary: "p.t" }]);
    await r.run("v.t");
    await r.run("p.t");
    expect(host.querySelector('[data-cmd="v.t"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-cmd="p.t"]')!.textContent).toBe("Parar");
  });
  it("comando de grupo sem ícone não gera botão vazio", () => {
    const r = createRegistry();
    r.register([{ id: "x", label: "X", run: () => {} }]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createToolbar(host, r, [{ group: ["x"] }]);
    expect(host.querySelector("button")).toBeNull();
  });
});
