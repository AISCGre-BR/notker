// test/palette-ui.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setLocale } from "../src/i18n";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { neumePalette } from "../src/neume/palette";
import { NeumeSearch } from "../src/neume/search";
import type { EffectiveEntry, Family } from "../src/neume/types";

const SVG = { path: "M0 0h10v10H0z", viewBox: "0 0 10 10", advance: 10 };
const entry = (id: string, nabc: string, names: string[]): EffectiveEntry => ({
  id, family: "stgall", code: nabc, nabc, nabcValid: true, base: nabc, name: names[0],
  qualifiers: [], letters: [], terms: [nabc, ...names], meaning: "", svg: SVG,
  displayNames: names, hidden: false,
});

let entries: EffectiveEntry[];
let view: EditorView;
beforeEach(() => {
  family = "stgall";
  document.body.innerHTML = "";
  entries = [entry("stgall:pe", "pe", ["pes"]), entry("stgall:cl", "cl", ["clivis"])];
  view = new EditorView({ state: EditorState.create({ doc: "(f)" }), parent: document.body });
});
let family: Family = "stgall";
const deps = (onName = vi.fn()) => ({ getTree: () => null, search: () => new NeumeSearch(entries), activeFamily: () => family, onName });
const kd = (el: Element, key: string, mods: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));

describe("paleta de neumas", () => {
  it("open() abre com a busca focada e a 1ª tecla filtra", () => {
    neumePalette(deps()).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    expect(document.activeElement).toBe(input);
    input.value = "cliv";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelectorAll(".neume-row").length).toBe(1);
  });
  it("abrir de novo não duplica", () => {
    const p = neumePalette(deps());
    p.open(view); p.open(view);
    expect(document.querySelectorAll(".neume-palette").length).toBe(1);
  });
  it("Ctrl+Enter abre campo de nome inline; Enter grava e o nome fica buscável na hora", async () => {
    const onName = vi.fn((ids: string[], name: string) => {
      // espelha o reindex do main: o nome do usuário vira termo de busca
      entries = entries.map((e) => (ids.includes(e.id)
        ? { ...e, displayNames: [name, ...e.displayNames], terms: [name, ...e.terms] } : e));
    });
    neumePalette(deps(onName)).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter", { ctrlKey: true });
    const nameField = document.querySelector<HTMLInputElement>(".neume-row.sel .neume-name-input")!;
    expect(document.activeElement).toBe(nameField);
    nameField.value = "  podatus  ";
    kd(nameField, "Enter");
    await Promise.resolve();
    expect(onName).toHaveBeenCalledWith(["stgall:pe"], "podatus");
    expect(document.activeElement).toBe(input);
    input.value = "podatus";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".neume-row")!.textContent).toContain("pe");
  });
  it("nome vazio/só espaços não grava; Esc no campo volta à lista sem fechar a paleta", () => {
    const onName = vi.fn();
    neumePalette(deps(onName)).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter", { ctrlKey: true });
    let nameField = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    nameField.value = "   ";
    kd(nameField, "Enter");
    expect(onName).not.toHaveBeenCalled();
    kd(input, "Enter", { ctrlKey: true });
    nameField = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    kd(nameField, "Escape");
    expect(document.querySelector(".neume-palette")).not.toBeNull();
    expect(document.querySelector(".neume-name-input")).toBeNull();
    expect(document.activeElement).toBe(input);
  });
  it("Enter (sem Ctrl) insere e fecha, devolvendo o foco ao editor", () => {
    neumePalette(deps()).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter");
    expect(document.querySelector(".neume-palette")).toBeNull();
    expect(view.state.doc.toString()).toContain("pe");
  });
});

describe("paleta de neumas: robustez", () => {
  it("Ctrl+K com o foco na própria busca só refoca, sem criar 2ª paleta", () => {
    const p = neumePalette(deps());
    p.open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    input.value = "cl";
    p.open(view);
    expect(document.querySelectorAll(".neume-palette").length).toBe(1);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("cl");
  });
  it("raiz é dialog; lista é listbox; linhas são option com aria-selected", () => {
    neumePalette(deps()).open(view);
    const root = document.querySelector(".neume-palette")!;
    expect(root.getAttribute("role")).toBe("dialog");
    expect(root.getAttribute("aria-label")).toBe("Buscar neuma");
    expect(root.querySelector(".neume-palette-list")!.getAttribute("role")).toBe("listbox");
    const rows = root.querySelectorAll(".neume-row");
    expect(rows[0].getAttribute("role")).toBe("option");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[1].getAttribute("aria-selected")).toBe("false");
  });
});

describe("paleta de neumas: cadastro rápido", () => {
  it("resolver o onName de A não apaga o texto digitado no campo de B", async () => {
    let resolveA!: () => void;
    const onName = vi.fn(() => new Promise<void>((r) => { resolveA = r; }));
    neumePalette(deps(onName)).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter", { ctrlKey: true });
    const a = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    a.value = "alfa";
    kd(a, "Enter");
    kd(input, "ArrowDown");
    kd(input, "Enter", { ctrlKey: true });
    const b = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    b.value = "abc";
    resolveA();
    await new Promise((r) => setTimeout(r, 0));
    const now = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    expect(now.value).toBe("abc");
    expect(document.activeElement).toBe(now);
  });
  it("clicar no campo de nome não insere nem fecha", () => {
    neumePalette(deps()).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter", { ctrlKey: true });
    const f = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    f.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".neume-palette")).not.toBeNull();
    expect(view.state.doc.toString()).toBe("(f)");
  });
  it("Enter durante composição (IME) não grava", () => {
    const onName = vi.fn();
    neumePalette(deps(onName)).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    kd(input, "Enter", { ctrlKey: true });
    const f = document.querySelector<HTMLInputElement>(".neume-name-input")!;
    f.value = "x";
    kd(f, "Enter", { isComposing: true });
    expect(onName).not.toHaveBeenCalled();
    expect(document.querySelector(".neume-name-input")).toBe(f);
  });
  it("mostra SÓ a família do canto, lida a cada consulta (trocar a família muda sem reabrir a paleta)", () => {
    entries = [
      entry("stgall:pe", "pe", ["pes"]),
      { ...entry("laon:un", "un", ["uncinus"]), id: "laon:un", family: "laon" },
    ];
    neumePalette(deps()).open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    const rows = () => [...document.querySelectorAll(".neume-row-code")].map((n) => n.textContent);
    expect(rows()).toEqual(["pe"]);
    family = "laon";
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(rows()).toEqual(["un"]);
  });
});

describe("paleta — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("rótulo e placeholder em italiano", () => {
    setLocale("it");
    neumePalette(deps()).open(view);
    const root = document.querySelector<HTMLElement>(".neume-palette")!;
    expect(root.getAttribute("aria-label")).toBe("Cerca neuma");
    expect(root.querySelector<HTMLInputElement>("input")!.placeholder).toBe("Cerca neumi per nome o codice");
  });
});
