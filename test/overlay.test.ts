// test/overlay.test.ts
import { describe, it, expect } from "vitest";
import { mergeEntry, mergeOverlays, parseOverlay, serializeOverlay } from "../src/neume/overlay";
import type { NeumeEntry, Overlay } from "../src/neume/types";

const base: NeumeEntry = {
  id: "stgall:cl", family: "stgall", code: "cl", nabc: "cl", nabcValid: true,
  base: "cl", name: "clivis", qualifiers: [], letters: [], terms: ["clivis", "cl"],
  meaning: "", svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 },
};

describe("overlay", () => {
  it("merge aplica nomes (primeiro), nota e hidden", () => {
    const eff = mergeEntry(base, { names: ["clive longo"], note: "uso X", hidden: true });
    expect(eff.displayNames).toEqual(["clive longo", "clivis"]);
    expect(eff.terms).toContain("clive longo");
    expect(eff.meaning).toContain("uso X");
    expect(eff.hidden).toBe(true);
  });
  it("merge sem overlay devolve defaults", () => {
    const eff = mergeEntry(base, undefined);
    expect(eff.displayNames).toEqual(["clivis"]);
    expect(eff.hidden).toBe(false);
  });
  it("mergeOverlays é não-destrutivo (une nomes de ambos)", () => {
    const a: Overlay = { schema: 2, kind: "notker-neume-overlay", entries: { "stgall:cl": { names: ["a"] } }, sequences: {} };
    const b: Overlay = { schema: 2, kind: "notker-neume-overlay", entries: { "stgall:cl": { names: ["b"] } }, sequences: {} };
    const m = mergeOverlays(a, b);
    expect(m.entries["stgall:cl"].names).toEqual(["a", "b"]);
  });
  it("round-trip serialize/parse", () => {
    const o: Overlay = { schema: 2, kind: "notker-neume-overlay", entries: { "stgall:cl": { names: ["x"] } }, sequences: {} };
    expect(parseOverlay(serializeOverlay(o))).toEqual(o);
  });
  it("parse rejeita kind errado", () => {
    expect(() => parseOverlay('{"schema":1,"kind":"outro","entries":{}}')).toThrow();
  });
});

import { addNameToEntries, emptyOverlay } from "../src/neume/overlay";
describe("addNameToEntries", () => {
  const empty = emptyOverlay();
  const es = [{ id: "a", displayNames: ["pes"] }, { id: "b", displayNames: ["clivis"] }];
  it("vazio/espaços não muda", () => {
    expect(addNameToEntries(empty, es, "   ").changed).toBe(false);
    expect(addNameToEntries(empty, es, "").changed).toBe(false);
  });
  it("duplicata (caixa/trim) de nome do catálogo ou do usuário não muda", () => {
    expect(addNameToEntries(empty, [es[0]], " PES ").changed).toBe(false);
    const r = addNameToEntries(empty, [es[0]], "podatus");
    const r2 = addNameToEntries(r.overlay, [{ id: "a", displayNames: ["podatus", "pes"] }], "Podatus");
    expect(r2.changed).toBe(false);
    expect(addNameToEntries(empty, [es[0]], "Pés").changed).toBe(true); // acento preservado
  });
  it("nome novo entra em todos os ids sem duplicata", () => {
    const r = addNameToEntries(empty, es, " novo ");
    expect(r.changed).toBe(true);
    expect(r.overlay.entries.a.names).toEqual(["novo"]);
    expect(r.overlay.entries.b.names).toEqual(["novo"]);
  });
});
