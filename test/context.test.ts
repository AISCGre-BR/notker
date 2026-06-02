// test/context.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { Parser, Language } from "web-tree-sitter";
import { resolve } from "node:path";
import { nabcContextAt, nodeKindAt, activeClefAt, outermostNabcAt, nabcPartsAt } from "../src/editor/context";

const RUNTIME_WASM = resolve(__dirname, "../src/assets/tree-sitter.wasm");
const GRAMMAR_WASM = resolve(__dirname, "../src/assets/tree-sitter-gregorio.wasm");

const wasmPresent = existsSync(RUNTIME_WASM) && existsSync(GRAMMAR_WASM);

let parser: Parser;
beforeAll(async () => {
  await Parser.init({ locateFile: () => RUNTIME_WASM });
  const lang = await Language.load(GRAMMAR_WASM);
  parser = new Parser(); parser.setLanguage(lang);
}, 30_000);

const DOC = `nabc-lines: 1;\nname: T;\n%%\n(c4) Pó(h|vi)pu(h)`;

describe.skipIf(!wasmPresent)("context", () => {
  it("detecta posição dentro do campo NABC (após o |)", () => {
    const tree = parser.parse(DOC);
    const posNabc = DOC.indexOf("vi") + 1; // dentro de "vi"
    const ctx = nabcContextAt(tree!, DOC, posNabc);
    expect(ctx.inNabc).toBe(true);
    expect(DOC.slice(ctx.tokenFrom, ctx.tokenTo)).toContain("vi");
  });
  it("fora de campo NABC retorna inNabc=false", () => {
    const tree = parser.parse(DOC);
    const posLyric = DOC.indexOf("Pó");
    expect(nabcContextAt(tree!, DOC, posLyric).inNabc).toBe(false);
  });
  it("acha a clave ativa à esquerda", () => {
    const tree = parser.parse(DOC);
    expect(activeClefAt(tree!, DOC, DOC.indexOf("vi"))).toBe("c4");
  });
  it("nodeKindAt devolve o tipo do nó", () => {
    const tree = parser.parse(DOC);
    expect(typeof nodeKindAt(tree!, DOC.indexOf("vi"))).toBe("string");
  });
  it("detecta NABC já no PRIMEIRO byte do token (regressão off-by-one)", () => {
    const tree = parser.parse(DOC);
    const firstByte = DOC.indexOf("vi"); // exatamente o startIndex do token nabc
    const ctx = nabcContextAt(tree!, DOC, firstByte);
    expect(ctx.inNabc).toBe(true);
    expect(DOC.slice(ctx.tokenFrom, ctx.tokenTo)).toContain("vi");
  });
  it("outermostNabcAt cobre pelo menos o mesmo range que o innermost", () => {
    const tree = parser.parse(DOC);
    const pos = DOC.indexOf("vi") + 1;
    const inner = nabcContextAt(tree!, DOC, pos);
    const outer = outermostNabcAt(tree!, DOC, pos);
    expect(outer.inNabc).toBe(true);
    expect(outer.tokenFrom).toBeLessThanOrEqual(inner.tokenFrom);
    expect(outer.tokenTo).toBeGreaterThanOrEqual(inner.tokenTo);
    expect(DOC.slice(outer.tokenFrom, outer.tokenTo)).toContain("vi");
  });
  it("outermostNabcAt fora de NABC retorna inNabc=false", () => {
    const tree = parser.parse(DOC);
    expect(outermostNabcAt(tree!, DOC, DOC.indexOf("Pó")).inNabc).toBe(false);
  });
  it("nabcPartsAt devolve ao menos uma parte para um neuma simples", () => {
    const tree = parser.parse(DOC);
    const parts = nabcPartsAt(tree!, DOC, DOC.indexOf("vi") + 1);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    const joined = parts.map((p) => DOC.slice(p.from, p.to)).join("");
    expect(joined).toContain("vi");
  });
  it("nabcPartsAt fora de NABC retorna vazio", () => {
    const tree = parser.parse(DOC);
    expect(nabcPartsAt(tree!, DOC, DOC.indexOf("Pó")).length).toBe(0);
  });
});
