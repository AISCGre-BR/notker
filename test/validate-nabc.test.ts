// test/validate-nabc.test.ts — validação offline com o tree-sitter-gregorio real
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { validateNabc } from "../src/neume/validate-nabc";

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

describe("validateNabc sem parser", () => {
  it("vazio, proibidos e desconhecido", () => {
    expect(validateNabc(null, "   ")).toBe("empty");
    expect(validateNabc(null, "pe|vi")).toBe("invalid");
    expect(validateNabc(null, "vi)")).toBe("invalid");
    expect(validateNabc(null, "pe")).toBe("unknown");
  });
});

describe.skipIf(!wasmPresent)("validateNabc com tree-sitter-gregorio", () => {
  it.each(["vi", "pe", "pe!vi", "cl!po", "peS", "vi/pe", "pe!vi!cl", "vihk", " pe ! vi "])("válido: %s", (s) => {
    expect(validateNabc(parser, s)).toBe("valid");
  });
  it.each(["vi!", "xx", "zz!vi", "toppe", "1pe", "pe(vi", "a%b"])("inválido: %s", (s) => {
    expect(validateNabc(parser, s)).toBe("invalid");
  });
});
