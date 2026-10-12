// test/name-target.test.ts — "Nomear neuma…": seleção/cursor → cadeia → item
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { chainAtSelection, resolveNameTarget } from "../src/neumas/name-target";
import { buildEffective } from "../src/neume/effective";
import { addSequence, emptyOverlay } from "../src/neume/overlay";
import type { NeumeEntry, Family } from "../src/neume/types";

const RUNTIME_WASM = resolve(__dirname, "../src/assets/tree-sitter.wasm");
const GRAMMAR_WASM = resolve(__dirname, "../src/assets/tree-sitter-gregorio.wasm");
const wasmPresent = existsSync(RUNTIME_WASM) && existsSync(GRAMMAR_WASM);
let parser: Parser;
beforeAll(async () => {
  if (!wasmPresent) return;
  await Parser.init({ locateFile: () => RUNTIME_WASM });
  const lang = await Language.load(GRAMMAR_WASM);
  parser = new Parser(); parser.setLanguage(lang);
}, 30_000);

const DOC = "nabc-lines: 1;\nname: T;\n%%\n(c4) Pó(h|pe!vi)pu(hg|cl) lus(f)";
const at = (s: string, k = 0) => DOC.indexOf(s) + k;

describe("chainAtSelection (sem árvore)", () => {
  it("seleção dentro de um campo devolve o trecho selecionado", () => {
    expect(chainAtSelection(DOC, at("pe!vi"), at("pe!vi") + 2, null)).toBe("pe");
    expect(chainAtSelection(DOC, at("pe!vi") + 5, at("pe!vi"), null)).toBe("pe!vi"); // âncora depois da cabeça
  });
  it("seleção de sílaba inteira (clique na partitura) devolve o 1º campo nabc dentro dela", () => {
    expect(chainAtSelection(DOC, at("Pó"), at("pu("), null)).toBe("pe!vi");
    expect(chainAtSelection(DOC, at("pu"), at(" lus"), null)).toBe("cl");
  });
  it("seleção sem campo nabc → null", () => {
    expect(chainAtSelection(DOC, at("lus"), at("lus") + 3, null)).toBeNull();
  });
  it("cursor no campo sem árvore → o campo inteiro; fora → null", () => {
    expect(chainAtSelection(DOC, at("vi"), at("vi"), null)).toBe("pe!vi");
    expect(chainAtSelection(DOC, at("Pó"), at("Pó"), null)).toBeNull();
    expect(chainAtSelection(DOC, at("(h|") + 1, at("(h|") + 1, null)).toBeNull(); // no gabc da nota
  });
});

describe.skipIf(!wasmPresent)("chainAtSelection (com tree-sitter)", () => {
  it("cursor num neuma devolve o neuma mais externo", () => {
    const tree = parser.parse(DOC)!;
    expect(chainAtSelection(DOC, at("vi", 1), at("vi", 1), tree)).toBe("pe!vi");
    expect(chainAtSelection(DOC, at("|cl") + 2, at("|cl") + 2, tree)).toBe("cl");
  });
});

describe("resolveNameTarget", () => {
  const ne = (family: Family, code: string, nabc: string, extra: Partial<NeumeEntry> = {}): NeumeEntry => ({
    id: `${family}:${code}`, family, code, nabc, nabcValid: true, base: nabc.slice(0, 2), name: code,
    qualifiers: [], letters: [], terms: [code], meaning: "", svg: { path: "M0", viewBox: "0 0 1 1", advance: 1 }, ...extra,
  });
  const cat = [ne("stgall", "pe", "pe"), ne("stgall", "clEpo", "cl!po"), ne("laon", "pe", "pe")];
  const o = addSequence(emptyOverlay(), "stgall", "pe!vi", "2026-10-09T00:00:00.000Z").overlay;
  const all = buildEffective(cat, o);
  it("glifo do catálogo, sequência do usuário, nova (família do canto)", () => {
    expect(resolveNameTarget(all, "stgall", "pe")).toEqual({ kind: "existing", id: "stgall:pe" });
    expect(resolveNameTarget(all, "laon", "pe")).toEqual({ kind: "existing", id: "laon:pe" });
    expect(resolveNameTarget(all, "stgall", "pe!vi")).toEqual({ kind: "existing", id: "seq:stgall:pe!vi" });
    expect(resolveNameTarget(all, "laon", "pe!vi")).toEqual({ kind: "new", nabc: "pe!vi" });
    expect(resolveNameTarget(all, "stgall", " vi ! pe ")).toEqual({ kind: "new", nabc: "vi!pe" });
  });
});
