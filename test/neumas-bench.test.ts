// test/neumas-bench.test.ts — cartão Bancada (DOM)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createBench, type BenchCallbacks, type BenchStatus, type BenchItem } from "../src/neumas/bench";
import type { EffectiveEntry } from "../src/neume/types";

const svg = { path: "M0", viewBox: "0 0 1 1", advance: 1 };
const glyph: EffectiveEntry = {
  id: "stgall:pe", family: "stgall", code: "pe", nabc: "pe", nabcValid: true, base: "pe", name: "pes", qualifiers: [], letters: [],
  terms: ["pes"], meaning: "", svg, displayNames: ["podatus", "pes"], hidden: false, userNames: ["podatus", "<i>x</i>"], userNote: "minha nota",
  provenance: [{ source: "Cardine, Semiologia Gregoriana, pp.12–15", via: "v", family: "stgall", row: "pes" }],
};
const seq: EffectiveEntry = {
  id: "seq:stgall:pe!vi", family: "stgall", code: "pe!vi", nabc: "pe!vi", nabcValid: true, base: "pe", name: "pes + virga",
  qualifiers: [], letters: [], terms: [], meaning: "", displayNames: ["pes com virga", "pes + virga"], hidden: false,
  userNames: ["pes com virga"], synthetic: true, userSequence: true,
};
const st = (over: Partial<BenchStatus> = {}): BenchStatus => ({ chain: "pe", validity: "valid", duplicate: null, composing: false, saveState: "", ...over });
const cbs = (): BenchCallbacks => ({
  onChainInput: vi.fn(), onChainCommit: vi.fn(), onAddName: vi.fn(), onRemoveName: vi.fn(), onPromoteName: vi.fn(), onNote: vi.fn(),
  onInsert: vi.fn(), onToggleHidden: vi.fn(), onDelete: vi.fn(), onCreateFrom: vi.fn(), onSaveDraft: vi.fn(), onGoTo: vi.fn(), onToggleCompose: vi.fn(), onFieldEscape: vi.fn(),
});
const drawFn = () => vi.fn(async (_f: string, n: string) => Object.assign(document.createElement("span"), { className: "drawn", textContent: n }));
let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); });
const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
const key = (t: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  t.dispatchEvent(ev);
  return ev;
};

describe("bancada: desenho que falha", () => {
  it("desenho que rejeita (ou lança) não gera rejeição não tratada e a bancada segue", async () => {
    const unhandled: unknown[] = [];
    const on = (e: unknown) => { unhandled.push(e); };
    process.on("unhandledRejection", on);
    try {
      const draw = vi.fn(async () => { throw new Error("desenho grande falhou"); });
      const b = createBench(host, cbs(), draw);
      b.render({ kind: "entry", entry: glyph }, st());
      await new Promise((r) => setTimeout(r, 20));
      expect(draw).toHaveBeenCalled();
      expect(q(".neumas-chain__input")).not.toBeNull();
      expect(unhandled).toEqual([]);
    } finally { process.off("unhandledRejection", on); }
  });
});

describe("bancada: glifo do catálogo", () => {
  it("cadeia só leitura, criar a partir deste, fichas com ★/× (texto puro), referência com proveniência, nota", async () => {
    const cb = cbs();
    const draw = drawFn();
    const b = createBench(host, cb, draw);
    b.render({ kind: "entry", entry: glyph }, st());
    expect(q<HTMLInputElement>(".neumas-chain__input").readOnly).toBe(true);
    expect(q(".neumas-create-from")).not.toBeNull();
    expect(host.querySelector(".neumas-delete")).toBeNull();
    const chips = [...host.querySelectorAll(".neumas-name")];
    expect(chips.map((c) => c.querySelector(".neumas-name__text")!.textContent)).toEqual(["podatus", "<i>x</i>"]);
    expect(host.querySelector(".neumas-name i")).toBeNull();
    expect(chips[0].classList.contains("sc-chip--active")).toBe(true);
    expect(chips[0].querySelector(".neumas-name__star")).toBeNull();
    chips[1].querySelector<HTMLButtonElement>(".neumas-name__star")!.click();
    chips[0].querySelector<HTMLButtonElement>(".neumas-name__remove")!.click();
    expect(cb.onPromoteName).toHaveBeenCalledWith("<i>x</i>");
    expect(cb.onRemoveName).toHaveBeenCalledWith("podatus");
    expect(host.textContent).toContain("Cardine, Semiologia Gregoriana");
    expect(q<HTMLTextAreaElement>(".neumas-note__input").value).toBe("minha nota");
    await Promise.resolve(); await Promise.resolve();
    expect(draw).toHaveBeenCalledWith("stgall", "pe");
    expect(q(".neumas-figure .drawn").textContent).toBe("pe");
  });
  it("Novo nome: Enter grava (sem IME), limpa; vazio não grava; Esc volta à grade sem vazar", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    expect(b.focusName()).toBe(true);
    const n = q<HTMLInputElement>(".neumas-newname");
    expect(document.activeElement).toBe(n);
    n.value = "  ";
    key(n, "Enter");
    expect(cb.onAddName).not.toHaveBeenCalled();
    n.value = "pes alto";
    key(n, "Enter", { isComposing: true });
    expect(cb.onAddName).not.toHaveBeenCalled();
    const ev = key(n, "Enter");
    expect(cb.onAddName).toHaveBeenCalledWith("pes alto", "enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(n.value).toBe("");
    const outer = vi.fn();
    host.addEventListener("keydown", outer);
    key(n, "Escape");
    expect(cb.onFieldEscape).toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });
  it("render do mesmo item não refaz o DOM (foco e texto do Novo nome sobrevivem); oculto troca o rótulo", () => {
    const b = createBench(host, cbs(), drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    b.focusName();
    const n = q<HTMLInputElement>(".neumas-newname");
    n.value = "meio digitado";
    b.render({ kind: "entry", entry: { ...glyph, hidden: true } }, st({ saveState: "salvo ✓" }));
    expect(q(".neumas-newname")).toBe(n);
    expect(document.activeElement).toBe(n);
    expect(n.value).toBe("meio digitado");
    expect(q(".neumas-hide").textContent).toBe("Mostrar na busca");
    expect(q(".neumas-savestate").textContent).toBe("salvo ✓");
  });
});

describe("bancada: sequência editável e rascunho", () => {
  it("sequência do usuário: cadeia editável (input/Enter/blur), compor, excluir", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: seq }, st({ chain: "pe!vi" }));
    const c = q<HTMLInputElement>(".neumas-chain__input");
    expect(c.readOnly).toBe(false);
    c.value = "pe!vi!cl";
    c.dispatchEvent(new Event("input"));
    expect(cb.onChainInput).toHaveBeenCalledWith("pe!vi!cl");
    key(c, "Enter");
    expect(cb.onChainCommit).toHaveBeenCalledWith("pe!vi!cl", "enter");
    c.dispatchEvent(new FocusEvent("blur"));
    expect(cb.onChainCommit).toHaveBeenLastCalledWith("pe!vi!cl", "blur");
    q<HTMLButtonElement>(".neumas-compose").click();
    q<HTMLButtonElement>(".neumas-delete").click();
    expect(cb.onToggleCompose).toHaveBeenCalled();
    expect(cb.onDelete).toHaveBeenCalled();
  });
  it("rascunho: título Nova sequência, validade, Já existe com Ir para ele, compor pressionado", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    const item: BenchItem = { kind: "draft", family: "stgall" };
    b.render(item, st({ chain: "", validity: "empty", composing: true }));
    expect(q(".sc-panel__title").textContent).toBe("Nova sequência");
    expect(q(".neumas-compose").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".neumas-note__input")).toBeNull();
    b.render(item, st({ chain: "xx", validity: "invalid" }));
    expect(q(".neumas-validity").textContent).toBe("inválido");
    expect(q(".neumas-chain__input").getAttribute("aria-invalid")).toBe("true");
    b.render(item, st({ chain: "pe", validity: "valid", duplicate: { id: "stgall:pe", label: "podatus" } }));
    expect(q(".neumas-dup").textContent).toContain("Já existe: podatus");
    q<HTMLButtonElement>(".neumas-goto").click();
    expect(cb.onGoTo).toHaveBeenCalledWith("stgall:pe");
  });
  it("sem item: mensagem de vazio; focusName devolve false", () => {
    const b = createBench(host, cbs(), drawFn());
    b.render(null, st());
    expect(host.textContent).toContain("tecle S");
    expect(b.focusName()).toBe(false);
  });
});

describe("bancada: nota grava ao digitar (debounce 400 ms)", () => {
  const typeNote = (v: string) => { const t = q<HTMLTextAreaElement>(".neumas-note__input"); t.value = v; t.dispatchEvent(new Event("input")); return t; };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("digitar e esperar 400 ms grava; antes disso não", () => {
    const cb = cbs(); const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    typeNote("nova nota");
    vi.advanceTimersByTime(399); expect(cb.onNote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(cb.onNote).toHaveBeenCalledWith("nova nota");
    expect(cb.onNote).toHaveBeenCalledTimes(1);
  });
  it("flushNote grava na hora e o debounce não grava de novo", () => {
    const cb = cbs(); const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    typeNote("urgente");
    b.flushNote();
    expect(cb.onNote).toHaveBeenCalledWith("urgente");
    vi.advanceTimersByTime(1000);
    expect(cb.onNote).toHaveBeenCalledTimes(1);
  });
  it("re-render com a nota em foco ou pendente não apaga o texto digitado", () => {
    const cb = cbs(); const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const t = typeNote("digitando");
    b.render({ kind: "entry", entry: glyph }, st()); // fora de foco, mas pendente
    expect(t.value).toBe("digitando");
    t.focus();
    vi.advanceTimersByTime(400);
    b.render({ kind: "entry", entry: glyph }, st()); // em foco
    expect(t.value).toBe("digitando");
  });
  it("blur sem mudança não grava", () => {
    const cb = cbs(); const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const t = q<HTMLTextAreaElement>(".neumas-note__input");
    t.focus(); t.blur();
    vi.advanceTimersByTime(1000);
    expect(cb.onNote).not.toHaveBeenCalled();
  });
});

describe("onda final: bancada", () => {
  it("3. a Referência do rascunho mostra o nome sistemático da cadeia válida e volta à frase se inválida", async () => {
    const { nameNeume } = await import("../src/neume/naming");
    const b = createBench(host, cbs(), drawFn());
    const item: BenchItem = { kind: "draft", family: "stgall" };
    b.render(item, st({ chain: "", validity: "empty" }));
    expect(q(".neumas-ref").textContent).toContain("aparece quando a cadeia for válida");
    b.render(item, st({ chain: "pe!vi", validity: "valid" }));
    const expected = nameNeume("pe!vi", "stgall").displayNames[0];
    expect(expected).toBeTruthy();
    expect(q(".neumas-ref").textContent).toContain(expected);
    expect(q(".neumas-ref").textContent).not.toContain("aparece quando");
    b.render(item, st({ chain: "pe!vi", validity: "unknown" }));
    expect(q(".neumas-ref").textContent).toContain(expected);
    b.render(item, st({ chain: "zz", validity: "invalid" }));
    expect(q(".neumas-ref").textContent).toContain("aparece quando a cadeia for válida");
  });
  it("7. Novo nome: onAddName devolvendo false mantém o texto; promessa resolvida em false também", async () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const n = q<HTMLInputElement>(".neumas-newname");
    n.value = "abc";
    (cb.onAddName as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    key(n, "Enter");
    expect(n.value).toBe("abc");
    (cb.onAddName as ReturnType<typeof vi.fn>).mockReturnValueOnce(Promise.resolve(false));
    key(n, "Enter");
    await Promise.resolve(); await Promise.resolve();
    expect(n.value).toBe("abc");
    (cb.onAddName as ReturnType<typeof vi.fn>).mockReturnValueOnce(Promise.resolve(true));
    key(n, "Enter");
    await Promise.resolve(); await Promise.resolve();
    expect(n.value).toBe("");
  });
  it("5. botões de ação têm variante visível do Parchment", () => {
    const b = createBench(host, cbs(), drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    for (const s of [".neumas-create-from", ".neumas-hide"]) expect(q(s).className).toMatch(/sc-btn--(elevated|tonal)/);
    b.render({ kind: "entry", entry: seq }, st({ chain: "pe!vi" }));
    for (const s of [".neumas-compose", ".neumas-hide"]) expect(q(s).className).toMatch(/sc-btn--(elevated|tonal)/);
    expect(q(".neumas-delete").className).toMatch(/sc-btn--(elevated|tonal)/);
  });
});

describe("bancada: Novo nome grava ao sair do campo", () => {
  const blur = (t: HTMLElement) => t.dispatchEvent(new FocusEvent("blur"));
  it("digitar e sair (blur) chama onAddName uma vez; vazio não chama", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const n = q<HTMLInputElement>(".neumas-newname");
    blur(n);
    expect(cb.onAddName).not.toHaveBeenCalled();
    n.value = "  ";
    blur(n);
    expect(cb.onAddName).not.toHaveBeenCalled();
    n.value = " pes alto ";
    blur(n);
    expect(cb.onAddName).toHaveBeenCalledTimes(1);
    expect(cb.onAddName).toHaveBeenCalledWith("pes alto", "blur");
    expect(n.value).toBe("");
  });
  it("Enter e depois blur: uma só gravação", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const n = q<HTMLInputElement>(".neumas-newname");
    n.value = "pes alto";
    key(n, "Enter");
    blur(n);
    expect(cb.onAddName).toHaveBeenCalledTimes(1);
  });
  it("Enter com gravação ainda pendente (promessa) e blur: não duplica; falha mantém o texto", async () => {
    let done!: (v: boolean) => void;
    const cb = cbs();
    cb.onAddName = vi.fn(() => new Promise<boolean>((r) => { done = r; }));
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const n = q<HTMLInputElement>(".neumas-newname");
    n.value = "pes alto";
    key(n, "Enter");
    blur(n);
    expect(cb.onAddName).toHaveBeenCalledTimes(1);
    done(false);
    await Promise.resolve(); await Promise.resolve();
    expect(n.value).toBe("pes alto");
  });
  it("Esc no campo cancela o texto (não grava ao devolver o foco)", () => {
    const cb = cbs();
    cb.onFieldEscape = vi.fn(() => blur(q(".neumas-newname")));
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    const n = q<HTMLInputElement>(".neumas-newname");
    n.value = "desisti";
    key(n, "Escape");
    expect(cb.onAddName).not.toHaveBeenCalled();
    expect(n.value).toBe("");
  });
  it("flushName grava o nome pendente já", () => {
    const cb = cbs();
    const b = createBench(host, cb, drawFn());
    b.render({ kind: "entry", entry: glyph }, st());
    q<HTMLInputElement>(".neumas-newname").value = "pendente";
    b.flushName();
    expect(cb.onAddName).toHaveBeenCalledWith("pendente", "flush");
    b.flushName();
    expect(cb.onAddName).toHaveBeenCalledTimes(1);
  });
  it("o indicador de gravação fica junto de 'Seus nomes' e mostra o estado", () => {
    const b = createBench(host, cbs(), drawFn());
    b.render({ kind: "entry", entry: glyph }, st({ saveState: "salvo ✓" }));
    const names = q(".neumas-names");
    expect(names.querySelector(".neumas-savestate")!.textContent).toBe("salvo ✓");
    b.render({ kind: "entry", entry: glyph }, st({ saveState: "erro ao salvar" }));
    expect(names.querySelector(".neumas-savestate")!.getAttribute("data-state")).toBe("erro ao salvar");
  });
});
