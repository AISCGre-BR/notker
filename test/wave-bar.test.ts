import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWaveBar } from "../src/ui/wave-bar";

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const onReset = vi.fn();
  const bar = createWaveBar(host, onReset);
  return { host, onReset, bar };
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("barra da onda", () => {
  it("nasce oculta; setVisible mostra título + instrução", () => {
    const { host, bar } = mount();
    const el = host.querySelector<HTMLElement>(".wave-bar")!;
    expect(el.style.display).toBe("none");
    bar.setVisible(true);
    expect(el.style.display).not.toBe("none");
    expect(el.textContent).toContain("Onda de interpretação");
    expect(el.textContent).toContain("arraste um tique na vertical");
    bar.setVisible(false);
    expect(el.style.display).toBe("none");
  });

  it("contador: N notas ajustadas; 0 = interpretação neumática pura", () => {
    const { host, bar } = mount();
    bar.setVisible(true);
    bar.setCount(3);
    expect(host.textContent).toContain("3 notas ajustadas");
    bar.setCount(1);
    expect(host.textContent).toContain("1 nota ajustada");
    bar.setCount(0);
    expect(host.textContent).toContain("interpretação neumática pura");
  });

  it("setReading substitui a instrução; null restaura", () => {
    const { host, bar } = mount();
    bar.setVisible(true);
    bar.setReading("alongamento ×1,50 — nota 2 de 3");
    expect(host.textContent).toContain("alongamento ×1,50 — nota 2 de 3");
    expect(host.textContent).not.toContain("arraste um tique");
    bar.setReading(null);
    expect(host.textContent).toContain("arraste um tique na vertical");
  });

  it("setSolfejo mostra o aviso de modo", () => {
    const { host, bar } = mount();
    bar.setVisible(true);
    bar.setSolfejo(true);
    expect(host.textContent).toContain("edição da onda só no modo interpretado");
    bar.setSolfejo(false);
    expect(host.textContent).toContain("arraste um tique na vertical");
  });

  it("botão Resetar chama onReset", () => {
    const { host, bar, onReset } = mount();
    bar.setVisible(true);
    host.querySelector<HTMLButtonElement>(".wave-bar-reset")!.click();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
