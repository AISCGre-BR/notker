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
