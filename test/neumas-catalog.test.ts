// test/neumas-catalog.test.ts — cartão Catálogo (DOM)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setLocale } from "../src/i18n";
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
  onQuery: vi.fn(), onFamily: vi.fn(), onFilter: vi.fn(), onSelect: vi.fn(), onActivate: vi.fn(), onNewSequence: vi.fn(), onSearchEscape: vi.fn(), onMore: vi.fn(),
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

describe("onda final: catálogo", () => {
  const NOSEQ = [e("stgall:pe"), e("stgall:vi")];
  it("4. 'Nenhuma sequência ainda' só com busca vazia e filtro todos; com busca/filtro não há seção Minhas", () => {
    const c = createCatalog(host, cbs());
    c.render(catalogSections(NOSEQ, "stgall", "todos", ""), st());
    expect(host.textContent).toContain("Nenhuma sequência ainda");
    c.render(catalogSections(NOSEQ, "stgall", "todos", "pe"), st({ query: "pe" }));
    expect(host.textContent).not.toContain("Nenhuma sequência ainda");
    expect(host.querySelector('[data-section="minhas"]')).toBeNull();
    c.render(catalogSections(NOSEQ, "stgall", "sem-nome", ""), st({ filter: "sem-nome" }));
    expect(host.querySelector('[data-section="minhas"]')).toBeNull();
    c.render(catalogSections(NOSEQ, "stgall", "sequencias", ""), st({ filter: "sequencias" }));
    expect(host.textContent).toContain("Nenhuma sequência ainda");
  });
  it("15. a bolinha 'tem nome seu' é role=img", () => {
    const c = createCatalog(host, cbs());
    c.render(catalogSections(ALL, "stgall", "todos", ""), st());
    expect(host.querySelector(".neumas-card__mine")!.getAttribute("role")).toBe("img");
  });
});

describe("paginação incremental por seção", () => {
  const MANY = Array.from({ length: 400 }, (_, i) => e(`stgall:g${String(i).padStart(3, "0")}`));
  it("o modelo aceita teto por seção e informa o total", () => {
    const g = (caps?: { glifos?: number }) => catalogSections(MANY, "stgall", "todos", "", { caps }).find((s) => s.id === "glifos")!;
    expect(g().items.length).toBe(150);
    expect(g({ glifos: 300 }).items.length).toBe(300);
    expect(g({ glifos: Infinity }).items.length).toBe(400);
    expect(g({ glifos: Infinity }).total).toBe(400);
  });
  it("seção cortada mostra 'Mostrar mais (N restantes)' e 'Mostrar todos' (botões elevados) que viram onMore", () => {
    const cb = cbs();
    const c = createCatalog(host, cb);
    c.render(catalogSections(MANY, "stgall", "todos", ""), st());
    expect(host.querySelectorAll(".neumas-card").length).toBe(150);
    expect(host.querySelector(".neumas-more")!.textContent).toContain("mostrando 150 de 400");
    const more = host.querySelector<HTMLButtonElement>(".neumas-more-btn")!;
    const all = host.querySelector<HTMLButtonElement>(".neumas-all-btn")!;
    expect(more.textContent).toBe("Mostrar mais (250 restantes)");
    expect(all.textContent).toBe("Mostrar todos");
    expect(more.classList.contains("sc-btn--elevated")).toBe(true);
    expect(all.classList.contains("sc-btn--elevated")).toBe(true);
    more.click();
    expect(cb.onMore).toHaveBeenLastCalledWith("glifos", false);
    all.click();
    expect(cb.onMore).toHaveBeenLastCalledWith("glifos", true);
  });
  it("seção inteira não mostra botões", () => {
    const c = createCatalog(host, cbs());
    c.render(catalogSections(ALL, "stgall", "todos", ""), st());
    expect(host.querySelector(".neumas-more-btn")).toBeNull();
  });
});

describe("catálogo — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("busca, filtros, seções e 'mostrar mais' em inglês", () => {
    setLocale("en");
    const c = createCatalog(host, cbs());
    c.render(catalogSections(ALL, "stgall", "todos", ""), st());
    expect(host.querySelector<HTMLInputElement>(".neumas-search")!.placeholder).toBe("Search name or code…");
    expect([...host.querySelectorAll(".neumas-filter")].map((b) => b.textContent)).toEqual(["All", "With my names", "Unnamed", "Sequences"]);
    expect(host.querySelector(".neumas-section__title")!.textContent).toBe("My sequences (1)");
    c.render(catalogSections(ALL, "stgall", "todos", "zzz"), st({ query: "zzz" }));
    expect(host.querySelector(".sc-empty")!.textContent).toBe("Nothing found for “zzz”.");
  });
});
