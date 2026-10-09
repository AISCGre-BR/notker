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

function setup(initial: Overlay = emptyOverlay(), cat: NeumeEntry[] = CAT) {
  let overlay = initial;
  const toasts: { text: string; opts?: Parameters<NeumasDeps["toast"]>[1] }[] = [];
  const deps: NeumasDeps = {
    entries: () => buildEffective(cat, overlay),
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

describe("nota: flush da vista", () => {
  it("digitar a nota e chamar view.flush() antes do debounce grava", async () => {
    const { view, ov } = setup();
    view.open({ select: "stgall:pe" });
    const t = q<HTMLTextAreaElement>(".neumas-note__input");
    t.value = "anotei"; t.dispatchEvent(new Event("input"));
    view.flush();
    await flush();
    expect(ov().entries["stgall:pe"].note).toBe("anotei");
  });
});

describe("onda final: rascunho, seleção e foco", () => {
  it("1. rascunho/seleção não vazam: sair e reabrir em outra família zera; mesma família mantém a seleção", () => {
    const { view, deps } = setup();
    view.open({ family: "stgall", newChain: "pe!vi" });
    expect(q(".sc-panel__title").textContent).toBe("Nova sequência");
    key(q(".neumas-chain__input"), "Escape"); // volta à grade
    key(document.activeElement!, "Escape");
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.toast).toHaveBeenCalledWith("Rascunho descartado.", { kind: "warn" });
    view.open({ family: "laon" });
    expect(document.querySelector(".neumas-chain__input")).toBeNull();
    expect(document.querySelector('.neumas-card[aria-selected="true"]')).toBeNull();
    view.open({ family: "stgall", select: "stgall:cl" });
    view.open({ family: "stgall" });
    expect(card("stgall:cl").getAttribute("aria-selected")).toBe("true");
    view.open({ family: "laon" });
    expect(document.querySelector('.neumas-card[aria-selected="true"]')).toBeNull();
  });
  it("1. Desfazer da exclusão zera um rascunho aberto antes de selecionar o item restaurado", async () => {
    const s = addSequence(emptyOverlay(), "stgall", "pe!vi", T);
    const { view, toasts } = setup(s.overlay);
    view.open({ select: s.id });
    q<HTMLButtonElement>(".neumas-delete").click();
    await flush();
    view.open({ newChain: "pe" }); // rascunho aberto
    toasts.at(-1)!.opts!.action!.run();
    await flush();
    expect(q(".sc-panel__title").textContent).toBe("Minha sequência");
    expect(card(s.id).getAttribute("aria-selected")).toBe("true");
  });
  it("2. o foco não cai no body: × numa ficha, Esc ainda sai da vista", async () => {
    const { view, deps } = setup(addName(emptyOverlay(), "stgall:pe", "podatus"));
    view.open({ select: "stgall:pe" });
    const x = q<HTMLButtonElement>(".neumas-name__remove");
    x.focus();
    x.click();
    await flush();
    expect(document.body.contains(x)).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(q("main").contains(document.activeElement)).toBe(true);
    key(document.activeElement!, "Escape");
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
  it("2. Enter na cadeia de uma sequência do usuário (id muda) deixa o foco dentro da vista", async () => {
    const s = addSequence(emptyOverlay(), "stgall", "pe!vi", T);
    const { view } = setup(s.overlay);
    view.open({ select: s.id });
    const chain = q<HTMLInputElement>(".neumas-chain__input");
    chain.focus();
    type(chain, "pe!vi!cl");
    key(chain, "Enter");
    await flush();
    expect(q("main").contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });
  it("2. Desfazer no toast devolve o foco à grade", async () => {
    const s = addSequence(emptyOverlay(), "stgall", "pe!vi", T);
    const { view, toasts } = setup(s.overlay);
    view.open({ select: s.id });
    q<HTMLButtonElement>(".neumas-delete").click();
    await flush();
    (document.activeElement as HTMLElement | null)?.blur?.();
    toasts.at(-1)!.opts!.action!.run();
    await flush();
    expect(q("main").contains(document.activeElement)).toBe(true);
  });
});

describe("onda final: salvar e descartar o rascunho", () => {
  it("6. botão Salvar sequência cria; desabilitado sem cadeia válida/nova; dica visível", async () => {
    const { view, ov } = setup();
    view.open({ family: "stgall", newChain: "" });
    const btn = q<HTMLButtonElement>(".neumas-save-seq");
    expect(btn.textContent).toBe("Salvar sequência");
    expect(btn.disabled).toBe(true);
    expect(q(".neumas-chain__hint").textContent).toBe("Enter salva · dê um nome para salvar junto");
    type(q(".neumas-chain__input"), "zz");
    expect(btn.disabled).toBe(true);
    type(q(".neumas-chain__input"), "pe");
    expect(btn.disabled).toBe(true); // já existe como glifo
    type(q(".neumas-chain__input"), "pe!vi");
    expect(btn.disabled).toBe(false);
    btn.click();
    await flush();
    expect(Object.keys(ov().sequences)).toEqual(["seq:stgall:pe!vi"]);
    expect(document.querySelector(".neumas-save-seq")).toBeNull();
  });
  it("6. abandonar rascunho não vazio avisa; rascunho vazio não avisa", () => {
    const { view, deps } = setup();
    view.open({ family: "stgall", newChain: "" });
    view.open({ select: "stgall:pe" });
    expect(deps.toast).not.toHaveBeenCalled();
    view.open({ newChain: "pe!vi" });
    card("stgall:cl").click(); // compor desligado: seleciona outro cartão
    expect(deps.toast).toHaveBeenCalledWith("Rascunho descartado.", { kind: "warn" });
    expect(q(".sc-panel__title").textContent).toBe("Glifo");
  });
  it("6. trocar de família com rascunho não vazio avisa", () => {
    const { view, deps } = setup();
    view.open({ family: "stgall", newChain: "pe!vi" });
    q<HTMLButtonElement>('[data-family="laon"]').click();
    expect(deps.toast).toHaveBeenCalledWith("Rascunho descartado.", { kind: "warn" });
  });
  it("6/5. Compor ligado mostra a linha de ajuda; desligado não", () => {
    const { view } = setup();
    view.open({ family: "stgall", newChain: "" });
    expect(q(".neumas-compose-help").textContent).toBe("");
    q<HTMLButtonElement>(".neumas-compose").click();
    expect(q(".neumas-compose-help").textContent).toBe("Clique nos cartões do catálogo para acrescentar à cadeia.");
  });
});

describe("onda final: menores da vista", () => {
  it("7. Novo nome do rascunho com cadeia inválida: o texto digitado fica", async () => {
    const { view } = setup();
    view.open({ family: "stgall", newChain: "zz" });
    type(q(".neumas-newname"), "nada");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(q<HTMLInputElement>(".neumas-newname").value).toBe("nada");
  });
  it("9. só o estado de gravação mudando não refaz a grade", async () => {
    const { view } = setup();
    view.open({ select: "stgall:pe", focus: "name" });
    type(q(".neumas-newname"), "podatus");
    key(q(".neumas-newname"), "Enter");
    const c = card("stgall:pe"); // depois do render síncrono do salvar
    await flush();
    expect(q(".neumas-savestate").textContent).toBe("salvo ✓");
    expect(card("stgall:pe")).toBe(c);
  });
  it("10. selecionar rola o cartão para a vista (nearest)", () => {
    const spy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
    try {
      const { view } = setup();
      view.open({ select: "stgall:cl" });
      expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    } finally { delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView; }
  });
  it("12. Esc na cadeia de uma sequência do usuário cancela a edição", async () => {
    const s = addSequence(emptyOverlay(), "stgall", "pe!vi", T);
    const { view, ov, deps } = setup(s.overlay);
    view.open({ select: s.id });
    const chain = q<HTMLInputElement>(".neumas-chain__input");
    chain.focus();
    type(chain, "pe!vi!cl");
    key(chain, "Escape");
    chain.blur();
    await flush();
    expect(Object.keys(ov().sequences)).toEqual([s.id]);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(chain.value).toBe("pe!vi");
  });
  it("14. filtro Sem nome: nomear faz o item sumir e o foco vai ao vizinho, não ao primeiro", async () => {
    const { view } = setup();
    view.open({ family: "stgall", select: "stgall:vi" });
    q<HTMLButtonElement>('[data-filter="sem-nome"]').click();
    expect([...document.querySelectorAll<HTMLElement>(".neumas-card")].map((c) => c.dataset.id)).toEqual(["stgall:pe", "stgall:vi", "stgall:cl"]);
    key(card("stgall:vi"), "n");
    type(q(".neumas-newname"), "virga alta");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(document.querySelector('.neumas-card[data-id="stgall:vi"]')).toBeNull();
    expect(document.activeElement).toBe(card("stgall:cl"));
  });
  it("18. addUserName e excluir gravam a nota pendente antes", async () => {
    const { view, ov } = setup();
    view.open({ select: "stgall:pe" });
    const t = q<HTMLTextAreaElement>(".neumas-note__input");
    t.value = "pendente"; t.dispatchEvent(new Event("input"));
    type(q(".neumas-newname"), "podatus");
    key(q(".neumas-newname"), "Enter");
    await flush();
    expect(ov().entries["stgall:pe"]).toMatchObject({ note: "pendente", names: ["podatus"] });
  });
});

describe("paginação incremental da grade", () => {
  const BIG = [
    ...Array.from({ length: 400 }, (_, i) => { const c = `g${String(i).padStart(3, "0")}`; return ne("stgall", c, c, "glifo " + c); }),
    ne("laon", "un", "un", "uncinus"),
  ];
  const count = () => document.querySelectorAll('.neumas-section[data-section="glifos"] .neumas-card').length;
  const btn = (c: string) => document.querySelector<HTMLButtonElement>(c)!;
  it("150 → 300 → 400 e voltar a 150 ao trocar filtro, busca ou família", () => {
    const { view } = setup(emptyOverlay(), BIG);
    view.open({ family: "stgall" });
    expect(count()).toBe(150);
    expect(btn(".neumas-more-btn").textContent).toBe("Mostrar mais (250 restantes)");
    btn(".neumas-more-btn").click();
    expect(count()).toBe(300);
    expect(btn(".neumas-more-btn").textContent).toBe("Mostrar mais (100 restantes)");
    btn(".neumas-all-btn").click();
    expect(count()).toBe(400);
    expect(document.querySelector(".neumas-more-btn")).toBeNull();
    btn('[data-filter="sem-nome"]').click();
    expect(count()).toBe(150);
    btn(".neumas-all-btn").click();
    expect(count()).toBe(400);
    type(q<HTMLInputElement>(".neumas-search"), "glifo");
    expect(count()).toBe(150);
    btn(".neumas-all-btn").click();
    btn('[data-family="laon"]').click();
    btn('[data-family="stgall"]').click();
    expect(count()).toBe(150);
  });
  it("os cartões novos entram na navegação por setas", () => {
    const { view } = setup(emptyOverlay(), BIG);
    view.open({ family: "stgall" });
    btn(".neumas-all-btn").click();
    const last = document.querySelectorAll<HTMLElement>(".neumas-card");
    const end = last[last.length - 1];
    end.focus();
    key(end, "Home");
    expect(document.activeElement).toBe(last[0]);
    key(last[0], "End");
    expect((document.activeElement as HTMLElement).dataset.id).toBe(end.dataset.id);
  });
});
