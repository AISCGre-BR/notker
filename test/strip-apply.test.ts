import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { pasteMarksWatcher, pastedRange, applyStrip, marksIn } from "../src/gabc/strip-apply";

const ALL = { vertical: true, horizontal: true, mora: true };
function mk(doc: string, cb = vi.fn()) {
  const view = new EditorView({ state: EditorState.create({ doc, extensions: [pasteMarksWatcher(cb)] }), parent: document.body });
  return { view, cb };
}

describe("colagem com sinais", () => {
  it("chama o callback com o intervalo colado e as contagens", () => {
    const { view, cb } = mk("(c4) A(f)");
    view.dispatch({ changes: { from: 9, insert: " B(g.)(h')" }, userEvent: "input.paste" });
    expect(cb).toHaveBeenCalledTimes(1);
    const [r, c] = cb.mock.calls[0];
    expect(view.state.sliceDoc(r.from, r.to)).toBe(" B(g.)(h')");
    expect(c).toEqual({ vertical: 1, horizontal: 0, mora: 1 });
  });
  it("colar sem sinais ou digitar não chama", () => {
    const { view, cb } = mk("(c4)");
    view.dispatch({ changes: { from: 4, insert: " A(f)" }, userEvent: "input.paste" });
    view.dispatch({ changes: { from: 0, insert: "B(g.)" }, userEvent: "input.type" });
    expect(cb).not.toHaveBeenCalled();
  });
  it("o intervalo acompanha edições posteriores e a remoção age só no trecho", () => {
    const { view } = mk("A(f.) ");
    view.dispatch({ changes: { from: 6, insert: "B(g.)(h')" }, userEvent: "input.paste" });
    view.dispatch({ changes: { from: 0, insert: "XX" }, userEvent: "input.type" });
    const r = view.state.field(pastedRange)!;
    expect(view.state.sliceDoc(r.from, r.to)).toBe("B(g.)(h')");
    expect(applyStrip(view, ALL, r)).toBe(2);
    expect(view.state.doc.toString()).toBe("XXA(f.) B(g)(h)");
  });
});

describe("aplicação", () => {
  it("uma transação (um undo), seleção ou canto, respeita o cabeçalho", () => {
    const doc = "name: a.b;\n%%\n(c4) A(f.)(g')";
    const { view } = mk(doc);
    expect(marksIn(view.state)).toEqual({ vertical: 1, horizontal: 0, mora: 1 });
    const spy = vi.spyOn(view, "dispatch");
    expect(applyStrip(view, { vertical: false, horizontal: false, mora: true })).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("name: a.b;\n%%\n(c4) A(f)(g')");
    expect(applyStrip(view, ALL, { from: 0, to: view.state.doc.length })).toBe(1);
    expect(view.state.doc.toString()).toBe("name: a.b;\n%%\n(c4) A(f)(g)");
    expect(applyStrip(view, ALL)).toBe(0);
  });
});

describe("janela no documento inteiro (contexto preservado)", () => {
  const strip = (doc: string, win: { from: number; to: number }) => {
    const { view } = mk(doc);
    const n = applyStrip(view, ALL, win);
    return { n, doc: view.state.doc.toString() };
  };
  it("seleção depois de $ não mexe na letra", () => {
    const d = "A$(a.) b(f.)";
    expect(strip(d, { from: 2, to: d.length })).toEqual({ n: 1, doc: "A$(a.) b(f)" });
  });
  it("seleção no meio de comentário % não altera o comentário", () => {
    const d = "% nota (f.)\n(g.)";
    expect(strip(d, { from: 4, to: d.length })).toEqual({ n: 1, doc: "% nota (f.)\n(g)" });
  });
  it("trecho dentro de colchete [alt:…] não é alterado", () => {
    const d = "A(f[alt:x(y.)]g.)";
    const s = d.indexOf("x(");
    expect(strip(d, { from: s, to: s + 5 })).toEqual({ n: 0, doc: d });
  });
  it("colar g.h' dentro de (f|) detecta pelo contexto (nabc intacto => 0)", () => {
    const { view, cb } = mk("A(f|)");
    view.dispatch({ changes: { from: 4, insert: "g.h'" }, userEvent: "input.paste" });
    expect(cb).not.toHaveBeenCalled(); // depois do | é nabc
  });
  it("colar g.h' dentro de (f) detecta", () => {
    const { view, cb } = mk("A(f)");
    view.dispatch({ changes: { from: 3, insert: "g.h'" }, userEvent: "input.paste" });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][1]).toEqual({ vertical: 1, horizontal: 0, mora: 1 });
  });
  it("trecho 'g.) B(h')' conta o g. porque o contexto abre o grupo antes", () => {
    const d = "A(f g.) B(h')";
    const s = d.indexOf("g.");
    expect(strip(d, { from: s, to: d.length - 1 })).toEqual({ n: 2, doc: "A(f g) B(h)" });
  });
  it("janela cobrindo só uma parte (Dominus dixit)", () => {
    const d = "Do(f.)mi(g')nus(h.)";
    expect(strip(d, { from: 0, to: 6 })).toEqual({ n: 1, doc: "Do(f)mi(g')nus(h.)" });
  });
  it("mudanças mínimas: o cursor fora do trecho não se move de forma indevida", () => {
    const { view } = mk("A(f.)B(g.)");
    view.dispatch({ selection: { anchor: 10 } });
    applyStrip(view, ALL, { from: 0, to: 5 });
    expect(view.state.selection.main.head).toBe(9);
  });
});

describe("colagem: casos limite", () => {
  it("soltar (drop) também oferece", () => {
    const { view, cb } = mk("A(f)");
    view.dispatch({ changes: { from: 4, insert: "(g.)" }, userEvent: "input.drop" });
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("várias mudanças numa colagem: não oferece", () => {
    const { view, cb } = mk("A(f)B(g)");
    view.dispatch({ changes: [{ from: 3, insert: "." }, { from: 8, insert: "." }], userEvent: "input.paste" });
    expect(cb).not.toHaveBeenCalled();
  });
});
