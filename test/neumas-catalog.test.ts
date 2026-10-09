// test/neumas-catalog.test.ts — cartão Catálogo (DOM)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCatalog, type CatalogCallbacks, type CatalogState } from "../src/neumas/catalog";
import { catalogSections } from "../src/neumas/catalog-model";
import type { EffectiveEntry, Family } from "../src/neume/types";

const svg = { path: "M0", viewBox: "0 0 1 1", advance: 1 };
const e = (id: string, extra: Partial<EffectiveEntry> = {}): EffectiveEntry => {
  const seq = id.startsWith("seq:");
  const family = (seq ? id.split(":")[1] : id.split(":")[0]) as Family;
  const code = seq ? id.split(":")[2] : id.split(":")[1];
  return { id, family, code, nabc: code, nabcValid: true, base: code.slice(0, 2), name: code, qualifiers: [], letters: [],
    terms: [code], meaning: "", svg: seq ? undefined : svg, displayNames: [...(extra.userNames ?? []), code], hidden: false, ...extra };
};
const ALL = [
  e("seq:stgall:pe!vi", { synthetic: true, userSequence: true, userNames: ["<b>pes</b> com virga"] }),
  e("stgall:pe"), e("stgall:vi", { hidden: true }), e("stgall:cl"),
];
const cbs = (): CatalogCallbacks => ({
  onQuery: vi.fn(), onFamily: vi.fn(), onFilter: vi.fn(), onSelect: vi.fn(), onActivate: vi.fn(), onNewSequence: vi.fn(), onSearchEscape: vi.fn(),
});
const st = (over: Partial<CatalogState> = {}): CatalogState => ({ family: "stgall", filter: "todos", query: "", selectedId: null, composing: false, ...over });
let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); });
const key = (t: HTMLElement, k: string) => t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const card = (id: string) => host.querySelector<HTMLElement>(`.neumas-card[data-id="${id}"]`)!;

describe("cartão Catálogo", () => {
  it("seções na ordem, nome do usuário em rubrica e por textContent, oculto esmaecido", () => {
    const c = createCatalog(host, cbs());
    c.render(catalogSections(ALL, "stgall", "todos", ""), st({ selectedId: "stgall:pe" }));
    expect([...host.querySelectorAll<HTMLElement>(".neumas-section")].map((s) => s.dataset.section)).toEqual(["minhas", "glifos"]);
    expect(host.querySelector(".neumas-section__title")!.textContent).toBe("Minhas sequências (1)");
    const seq = card("seq:stgall:pe!vi");
    expect(seq.querySelector(".neumas-card__name")!.textContent).toBe("<b>pes</b> com virga");
    expect(seq.querySelector("b")).toBeNull();
    expect(seq.querySelector(".neumas-card__name")!.classList.contains("is-mine")).toBe(true);
    expect(seq.querySelector(".neumas-card__mine")).not.toBeNull();
    expect(card("stgall:vi").classList.contains("is-hidden")).toBe(true);
    expect(card("stgall:pe").getAttribute("aria-selected")).toBe("true");
    expect(card("stgall:pe").tabIndex).toBe(0);
    expect(card("stgall:cl").tabIndex).toBe(-1);
  });
  it("família e filtro marcados; cliques viram callbacks", () => {
    const cb = cbs();
    const c = createCatalog(host, cb);
    c.render(catalogSections(ALL, "stgall", "meus", ""), st({ filter: "meus" }));
    expect(host.querySelector('[data-family="stgall"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-filter="meus"]')!.getAttribute("aria-pressed")).toBe("true");
    host.querySelector<HTMLButtonElement>('[data-family="laon"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-filter="sem-nome"]')!.click();
    host.querySelector<HTMLButtonElement>(".neumas-new")!.click();
    expect(cb.onFamily).toHaveBeenCalledWith("laon");
    expect(cb.onFilter).toHaveBeenCalledWith("sem-nome");
    expect(cb.onNewSequence).toHaveBeenCalled();
    expect(host.querySelector("input[type=radio], select")).toBeNull();
  });
  it("setas mudam a seleção (foco itinerante); Enter e clique ativam", () => {
    const cb = cbs();
    const c = createCatalog(host, cb);
    c.render(catalogSections(ALL, "stgall", "todos", ""), st({ selectedId: "stgall:pe" }));
    card("stgall:pe").focus();
    key(card("stgall:pe"), "ArrowRight");
    expect(cb.onSelect).toHaveBeenLastCalledWith("stgall:vi");
    expect(document.activeElement).toBe(card("stgall:vi"));
    key(card("stgall:vi"), "Home");
    expect(cb.onSelect).toHaveBeenLastCalledWith("seq:stgall:pe!vi");
    key(card("seq:stgall:pe!vi"), "Enter");
    expect(cb.onActivate).toHaveBeenLastCalledWith("seq:stgall:pe!vi");
    card("stgall:cl").click();
    expect(cb.onActivate).toHaveBeenLastCalledWith("stgall:cl");
  });
  it("busca: digita → onQuery; Esc e ↓ devolvem à grade; render não apaga o que está sendo digitado", () => {
    const cb = cbs();
    const c = createCatalog(host, cb);
    c.render(catalogSections(ALL, "stgall", "todos", ""), st());
    c.focusSearch();
    const s = host.querySelector<HTMLInputElement>(".neumas-search")!;
    s.value = "pe"; s.dispatchEvent(new Event("input"));
    expect(cb.onQuery).toHaveBeenCalledWith("pe");
    c.render(catalogSections(ALL, "stgall", "todos", "pe"), st({ query: "pe" }));
    expect(document.activeElement).toBe(s);
    key(s, "Escape");
    expect(cb.onSearchEscape).toHaveBeenCalledTimes(1);
  });
  it("busca sem resultado mostra aviso; focusGrid sem cartões devolve false", () => {
    const c = createCatalog(host, cbs());
    c.render(catalogSections(ALL, "laon", "todos", "zzz"), st({ family: "laon", query: "zzz" }));
    expect(host.textContent).toContain("Nada encontrado para “zzz”.");
    expect(c.focusGrid()).toBe(false);
  });
});
