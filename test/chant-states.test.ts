// test/chant-states.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";
import { Compartment, EditorSelection, EditorState, StateEffect } from "@codemirror/state";
import { undo } from "@codemirror/commands";
import { createEditorState } from "../src/editor/editor";
import { createChantStates } from "../src/editor/chant-states";

// O CodeMirror agenda medições por requestAnimationFrame; destruir a view as cancela
// (o jsdom não tem Range.getClientRects → erro "unhandled" sem isto).
let current: EditorView | null = null;
afterEach(() => { current?.destroy(); current = null; });

function setup() {
  document.body.innerHTML = "";
  const states = createChantStates((doc) => createEditorState(doc, []));
  const view = new EditorView({ parent: document.body, state: states.get("a", "AAA") });
  current = view;
  const type = (text: string) =>
    view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: "input.type" });
  /** Simula a troca de canto do main.ts: guarda o que sai, mostra o que entra. */
  const show = (from: string, to: string, content: string) => {
    states.remember(from, view.state);
    view.setState(states.get(to, content));
  };
  return { states, view, type, show };
}

describe("estado de editor por canto", () => {
  it("Ctrl+Z logo depois de trocar de canto não traz texto do outro canto", () => {
    const { view, type, show } = setup();
    type("1");
    show("a", "b", "BBB");
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("BBB");
  });
  it("cada canto guarda o seu histórico", () => {
    const { view, type, show } = setup();
    type("1");                     // AAA1
    show("a", "b", "BBB");
    type("2");                     // BBB2
    show("b", "a", "AAA1");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("AAA");
    show("a", "b", "BBB2");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("BBB");
  });
  it("a seleção de cada canto é preservada", () => {
    const { view, show } = setup();
    view.dispatch({ selection: EditorSelection.cursor(1) });
    show("a", "b", "BBB");
    show("b", "a", "AAA");
    expect(view.state.selection.main.head).toBe(1);
  });
  it("texto do projeto diferente do guardado → estado novo, sem histórico velho", () => {
    const { states, view, type, show } = setup();
    type("1");
    show("a", "b", "BBB");
    const s = states.get("a", "outro texto");
    expect(s.doc.toString()).toBe("outro texto");
    view.setState(s);
    expect(undo(view)).toBe(false);
  });
  it("a rolagem guardada acompanha o estado; clear esquece tudo", () => {
    const { states, view } = setup();
    const fx = StateEffect.define<number>();
    const snap = fx.of(42);
    states.remember("a", view.state, snap);
    expect(states.scrollOf("a")).toBe(snap);
    states.clear();
    expect(states.size()).toBe(0);
    expect(states.scrollOf("a")).toBeUndefined();
  });
  it("mapAll reconfigura um Compartment real e preserva texto, seleção e histórico", () => {
    document.body.innerHTML = "";
    const comp = new Compartment();
    const states = createChantStates((doc) => createEditorState(doc, [comp.of([])]));
    const view = new EditorView({ parent: document.body, state: states.get("a", "AAA") });
    current = view;
    view.dispatch({ changes: { from: 3, insert: "1" }, userEvent: "input.type", selection: EditorSelection.cursor(2) });
    states.remember("a", view.state);
    view.setState(states.get("b", "BBB"));          // "a" guardado; "b" em exibição
    states.mapAll((s) => s.update({ effects: comp.reconfigure(EditorState.tabSize.of(7)) }).state);
    view.setState(states.get("a", "AAA1"));
    expect(view.state.tabSize).toBe(7);
    expect(view.state.doc.toString()).toBe("AAA1");
    expect(view.state.selection.main.head).toBe(2);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("AAA");
  });
});
