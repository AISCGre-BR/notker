import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { lspDiagnosticsToCM, posToOffset } from "../src/lsp/cm-lsp";

describe("lspDiagnosticsToCM", () => {
  it("converte range LSP (linha/char) em offsets CM e severidade", () => {
    const doc = EditorState.create({ doc: "abc\ndef" }).doc;
    const out = lspDiagnosticsToCM(doc, [{
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
      severity: 1, message: "erro x",
    }]);
    expect(out).toEqual([{ from: 4, to: 7, severity: "error", message: "erro x" }]);
  });
  it("posToOffset clampa character além do fim da linha", () => {
    const doc = EditorState.create({ doc: "ab\ncde" }).doc;
    expect(posToOffset(doc, { line: 0, character: 99 })).toBe(2);
  });
  it("mapeia severidades 2/3/4", () => {
    const doc = EditorState.create({ doc: "x" }).doc;
    const r = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
    const out = lspDiagnosticsToCM(doc, [
      { range: r, severity: 2, message: "w" },
      { range: r, severity: 3, message: "i" },
      { range: r, severity: 4, message: "h" },
    ]);
    expect(out.map((d) => d.severity)).toEqual(["warning", "info", "info"]);
  });
});
