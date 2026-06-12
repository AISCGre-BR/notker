// test/tabs.test.ts — abas do painel direito (Partitura | Interpretação).
import { describe, it, expect, vi } from "vitest";
import { createTabs } from "../src/ui/tabs";

function host(): HTMLElement {
  document.body.innerHTML = `<div id="h"></div>`;
  return document.querySelector<HTMLElement>("#h")!;
}

describe("createTabs", () => {
  it("T1. cria cabeçalho com 2 abas e 2 painéis; Partitura ativa por padrão (D6)", () => {
    const t = createTabs(host(), ["Partitura", "Interpretação"]);
    const btns = document.querySelectorAll(".panel-tab");
    expect(btns).toHaveLength(2);
    expect(btns[0].classList.contains("active")).toBe(true);
    expect(t.pane(0).style.display).not.toBe("none");
    expect(t.pane(1).style.display).toBe("none");
  });
  it("T2. select(1) alterna painel e classe ativa; onChange notifica", () => {
    const t = createTabs(host(), ["Partitura", "Interpretação"]);
    const cb = vi.fn();
    t.onChange(cb);
    t.select(1);
    expect(t.pane(1).style.display).not.toBe("none");
    expect(t.pane(0).style.display).toBe("none");
    expect(document.querySelectorAll(".panel-tab")[1].classList.contains("active")).toBe(true);
    expect(cb).toHaveBeenCalledWith(1);
  });
  it("T3. clique no botão da aba seleciona", () => {
    const t = createTabs(host(), ["Partitura", "Interpretação"]);
    (document.querySelectorAll(".panel-tab")[1] as HTMLElement).click();
    expect(t.active()).toBe(1);
  });
});
