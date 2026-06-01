import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { lspDiagnosticsToCM, posToOffset, formatDocument } from "../src/lsp/cm-lsp";
import type { LspClient } from "../src/lsp/client";

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

describe("formatDocument", () => {
  function makeRange(sl: number, sc: number, el: number, ec: number) {
    return { start: { line: sl, character: sc }, end: { line: el, character: ec } };
  }

  it("(a) single full-range edit → retorna o newText completo", async () => {
    const doc = EditorState.create({ doc: "abc\ndef" }).doc;
    const fakeClient = {
      request: async () => [{ range: makeRange(0, 0, 1, 3), newText: "XYZ" }],
    } as unknown as LspClient;
    const result = await formatDocument(fakeClient, "test://x", doc);
    expect(result).toBe("XYZ");
  });

  it("(b) dois edits disjuntos → ambos aplicados corretamente", async () => {
    // doc = "hello world"
    // edit 1: replace chars 0-5 ("hello") with "Hi"
    // edit 2: replace chars 6-11 ("world") with "Earth"
    const doc = EditorState.create({ doc: "hello world" }).doc;
    const fakeClient = {
      request: async () => [
        { range: makeRange(0, 0, 0, 5), newText: "Hi" },
        { range: makeRange(0, 6, 0, 11), newText: "Earth" },
      ],
    } as unknown as LspClient;
    const result = await formatDocument(fakeClient, "test://x", doc);
    expect(result).toBe("Hi Earth");
  });

  it("(c) edits vazios / null → retorna null", async () => {
    const doc = EditorState.create({ doc: "anything" }).doc;

    const emptyClient = {
      request: async () => [],
    } as unknown as LspClient;
    expect(await formatDocument(emptyClient, "test://x", doc)).toBeNull();

    const nullClient = {
      request: async () => null,
    } as unknown as LspClient;
    expect(await formatDocument(nullClient, "test://x", doc)).toBeNull();
  });
});
