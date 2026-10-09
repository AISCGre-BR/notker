// test/neumas-view.test.ts — vista Neumas: fluxos de teclado, sequências, dedupe, excluir/desfazer
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNeumasView, type NeumasDeps } from "../src/neumas/view";
import { buildEffective } from "../src/neume/effective";
import { emptyOverlay, addName, addSequence } from "../src/neume/overlay";
import type { NeumeEntry, Family, Overlay } from "../src/neume/types";
import type { NabcValidity } from "../src/neume/validate-nabc";

const svg = (d: string) => ({ path: d, viewBox: "0 0 10 10", advance: 10 });
const ne = (family: Family, code: string, nabc: string, name: string, extra: Partial<NeumeEntry> = {}): NeumeEntry => ({
  id: `${family}:${code}`, family, code, nabc, nabcValid: true, base: nabc.slice(0, 2), name,
  qualifiers: [], letters: [], terms: [name, nabc], meaning: "", svg: svg("M" + code), ...extra,
});
const CAT = [ne("stgall", "pe", "pe", "pes"), ne("stgall", "vi", "vi", "virga"), ne("stgall", "cl", "cl", "clivis"), ne("laon", "un", "un", "uncinus")];
const T = "2026-10-09T12:00:00.000Z";

function setup(initial: Overlay = emptyOverlay()) {
  let overlay = initial;
  const toasts: { text: string; opts?: Parameters<NeumasDeps["toast"]>[1] }[] = [];
  const deps: NeumasDeps = {
    entries: () => buildEffective(CAT, overlay),
    overlay: () => overlay,
    commit: vi.fn(async (o: Overlay) => { overlay = o; }),
    validate: (n: string): NabcValidity => (!n.trim() ? "empty" : /^(pe|vi|cl|un)(!(pe|vi|cl|un))*$/.test(n.replace(/\s+/g, "")) ? "valid" : "invalid"),
    draw: vi.fn(async () => document.createElement("span")),
    insert: vi.fn(),
    exit: vi.fn(),
    toast: vi.fn((text, opts) => { toasts.push({ text, opts }); }),
    now: () => T,
  };
  document.body.innerHTML = "";
  const host = document.createElement("main");
  document.body.appendChild(host);
  const view = createNeumasView(host, deps);
  return { view, deps, host, toasts, ov: () => overlay };
}
const q = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const card = (id: string) => q<HTMLElement>(`.neumas-card[data-id="${id}"]`);
const key = (t: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  t.dispatchEvent(ev);
  return ev;
};
const type = (input: HTMLInputElement, v: string) => { input.value = v; input.dispatchEvent(new Event("input")); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => { document.body.innerHTML = ""; });

describe("cadastro rápido: seta, N, digitar, Enter", () => {
  it("nomeia dois glifos seguidos só com teclado e o foco volta à grade", async () => {
    const { view, ov } = setup();
    view.open({ family: "stgall", select: "stgall:pe" });
    expect(document.activeElement).toBe(card("stgall:pe"));
    key(card("stgall:pe"), "n");
    expect(document.activeElement).toBe(q(".neumas-newname"));
    type(q(".neumas-newname"), "podatus");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().entries["stgall:pe"].names).toEqual(["podatus"]);
    expect(document.activeElement).toBe(card("stgall:pe"));
    key(card("stgall:pe"), "ArrowRight");
    expect(document.activeElement).toBe(card("stgall:vi"));
    key(card("stgall:vi"), "N");
    type(q(".neumas-newname"), "virga alta");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().entries["stgall:vi"].names).toEqual(["virga alta"]);
    expect(card("stgall:pe").querySelector(".neumas-card__name")!.textContent).toBe("podatus");
    expect(q(".neumas-savestate").textContent).toBe("salvo ✓");
  });
  it("nome repetido avisa e não grava; letras em campos não viram atalhos", async () => {
    const { view, deps } = setup(addName(emptyOverlay(), "stgall:pe", "podatus"));
    view.open({ select: "stgall:pe", focus: "name" });
    const n = q<HTMLInputElement>(".neumas-newname");
    key(n, "s"); key(n, "i"); key(n, "/");
    expect(q(".sc-panel__title").textContent).toBe("Glifo"); // nenhum "S" criou rascunho
    expect(deps.insert).not.toHaveBeenCalled();
    type(n, "PODATUS");
    key(n, "Enter");
    await flush();
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalledWith("Esse nome já existe.", { kind: "warn" });
  });
});

describe("sequências", () => {
  it("S abre rascunho com foco na cadeia; Enter cria; Novo nome vai para a sequência; busca acha pelo nome", async () => {
    const { view, ov } = setup();
    view.open({ family: "stgall" });
    key(document.activeElement!, "s");
    const chain = q<HTMLInputElement>(".neumas-chain__input");
    expect(document.activeElement).toBe(chain);
    expect(q(".neumas-compose").getAttribute("aria-pressed")).toBe("true");
    type(chain, "pe ! vi");
    expect(q(".neumas-validity").textContent).toBe("válido");
    key(chain, "Enter");
    await flush();
    expect(Object.keys(ov().sequences)).toEqual(["seq:stgall:pe!vi"]);
    expect(document.activeElement).toBe(q(".neumas-newname"));
    type(q(".neumas-newname"), "pes com virga");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().sequences["seq:stgall:pe!vi"].names).toEqual(["pes com virga"]);
    view.focusSearch();
    type(q(".neumas-search"), "pes com");
    expect([...document.querySelectorAll<HTMLElement>(".neumas-card")].map((c) => c.dataset.id)).toEqual(["seq:stgall:pe!vi"]);
  });
  it("Novo nome direto no rascunho cria a sequência com o nome; cadeia inválida não cria", async () => {
    const { view, ov, deps } = setup();
    view.open({ family: "stgall", newChain: "zz" });
    expect(q(".neumas-validity").textContent).toBe("inválido");
    type(q(".neumas-newname"), "nada");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().sequences).toEqual({});
    expect(deps.toast).toHaveBeenCalledWith("Cadeia nabc inválida — corrija antes de salvar.", { kind: "warn" });
    type(q(".neumas-chain__input"), "cl!pe");
    type(q(".neumas-newname"), "clivis pes");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().sequences["seq:stgall:cl!pe"]).toMatchObject({ names: ["clivis pes"], created: T });
  });
  it("dedupe: cadeia igual a glifo ou sequência mostra Já existe; nome vai para o existente; Ir para ele", async () => {
    const start = addSequence(emptyOverlay(), "stgall", "pe!vi", T).overlay;
    const { view, ov } = setup(start);
    view.open({ family: "stgall", newChain: "" });
    type(q(".neumas-chain__input"), "pe!vi");
    expect(q(".neumas-dup").textContent).toContain("Já existe:");
    type(q(".neumas-newname"), "pes com virga");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(Object.keys(ov().sequences)).toEqual(["seq:stgall:pe!vi"]);
    expect(ov().sequences["seq:stgall:pe!vi"].names).toEqual(["pes com virga"]);
    view.open({ newChain: "pe" });
    q<HTMLButtonElement>(".neumas-goto").click();
    expect(card("stgall:pe").getAttribute("aria-selected")).toBe("true");
    expect(q(".sc-panel__title").textContent).toBe("Glifo");
  });
  it("compor clicando: com o rascunho, clicar em cartões acrescenta os códigos com !", () => {
    const { view } = setup();
    view.open({ family: "stgall", newChain: "" });
    q<HTMLButtonElement>(".neumas-compose").click(); // newChain abre sem compor; liga
    card("stgall:pe").click();
    card("stgall:vi").click();
    expect(q<HTMLInputElement>(".neumas-chain__input").value).toBe("pe!vi");
    expect(q(".sc-panel__title").textContent).toBe("Nova sequência");
  });
  it("editar a cadeia de uma sequência do usuário troca o id; colisão não troca", async () => {
    let o = addSequence(emptyOverlay(), "stgall", "pe!vi", T).overlay;
    o = addSequence(o, "stgall", "cl!pe", T).overlay;
    const { view, ov } = setup(o);
    view.open({ select: "seq:stgall:pe!vi" });
    const chain = q<HTMLInputElement>(".neumas-chain__input");
    type(chain, "cl!pe");
    key(chain, "Enter");
    await flush();
    expect(Object.keys(ov().sequences).sort()).toEqual(["seq:stgall:cl!pe", "seq:stgall:pe!vi"]);
    type(chain, "pe!vi!cl");
    key(chain, "Enter");
    await flush();
    expect(Object.keys(ov().sequences).sort()).toEqual(["seq:stgall:cl!pe", "seq:stgall:pe!vi!cl"]);
    expect(card("seq:stgall:pe!vi!cl").getAttribute("aria-selected")).toBe("true");
  });
  it("excluir sequência: toast com Desfazer devolve com os nomes", async () => {
    const s = addSequence(emptyOverlay(), "stgall", "pe!vi", T);
    const { view, ov, toasts } = setup(addName(s.overlay, s.id, "a"));
    view.open({ select: s.id });
    q<HTMLButtonElement>(".neumas-delete").click();
    await flush();
    expect(ov().sequences).toEqual({});
    const t = toasts.at(-1)!;
    expect(t.text).toBe("Sequência excluída.");
    t.opts!.action!.run();
    await flush();
    expect(ov().sequences[s.id].names).toEqual(["a"]);
  });
});

describe("teclas da vista", () => {
  it("I insere a cadeia do item; / foca a busca; Esc (fora de campo) sai; Esc em campo volta à grade", () => {
    const { view, deps } = setup();
    view.open({ select: "stgall:cl" });
    key(card("stgall:cl"), "i");
    expect(deps.insert).toHaveBeenCalledWith("cl");
    key(card("stgall:cl"), "/");
    expect(document.activeElement).toBe(q(".neumas-search"));
    key(q(".neumas-search"), "Escape");
    expect(document.activeElement).toBe(card("stgall:cl"));
    expect(deps.exit).not.toHaveBeenCalled();
    key(card("stgall:cl"), "Escape");
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
  it("teclas com Ctrl/Alt não são da vista (ficam para o registro)", () => {
    const { view, deps } = setup();
    view.open({ select: "stgall:cl" });
    key(card("stgall:cl"), "i", { ctrlKey: true });
    key(card("stgall:cl"), "s", { altKey: true });
    expect(deps.insert).not.toHaveBeenCalled();
    expect(q(".sc-panel__title").textContent).toBe("Glifo");
  });
  it("open com select de outra família troca a família e mostra o item mesmo com busca ativa", () => {
    const { view } = setup();
    view.open({ family: "stgall" });
    view.focusSearch();
    type(q(".neumas-search"), "virga");
    view.open({ select: "laon:un", focus: "name" });
    expect(view.family()).toBe("laon");
    expect(card("laon:un").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(q(".neumas-newname"));
  });
  it("refresh depois de um nome vindo de fora aparece na grade", () => {
    let o = emptyOverlay();
    const { view, deps } = setup();
    view.open({ family: "stgall" });
    o = addName(deps.overlay(), "stgall:cl", "clivis de fora");
    (deps as { overlay: () => Overlay }).overlay = () => o;
    (deps as { entries: NeumasDeps["entries"] }).entries = () => buildEffective(CAT, o);
    view.refresh();
    expect(card("stgall:cl").querySelector(".neumas-card__name")!.textContent).toBe("clivis de fora");
  });
});
