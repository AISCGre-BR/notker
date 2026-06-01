/**
 * highlight.test.ts
 *
 * Tests for tree-sitter-gregorio WASM loading and CodeMirror highlight
 * decoration building. Requires that `npm run grammar` has been run first
 * (generates src/assets/tree-sitter-gregorio.wasm and src/assets/tree-sitter.wasm).
 *
 * When the WASM artifacts are absent (e.g. in CI before `npm run grammar`),
 * the suites skip gracefully rather than failing.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { buildDecorationsFromSource } from "../src/editor/highlight-tree-sitter.js";

// Paths to pre-built WASM artifacts (gitignored; produced by `npm run grammar`)
const RUNTIME_WASM = resolve(__dirname, "../src/assets/tree-sitter.wasm");
const GRAMMAR_WASM = resolve(__dirname, "../src/assets/tree-sitter-gregorio.wasm");

// Check at module load time (top-level) so skipIf works correctly.
const wasmPresent = existsSync(RUNTIME_WASM) && existsSync(GRAMMAR_WASM);

/** Canonical sample that exercises header, separator, clef, neumes, NABC, divisio */
const SAMPLE = `name: Teste;\nnabc-lines: 1;\n%%\n(c4) Pó(eh/hi|pe)pu(h)lus(h) (::)\n`;

let parser: Parser;

beforeAll(async () => {
  if (!wasmPresent) return; // nothing to initialise when skipping
  await Parser.init({
    locateFile: () => RUNTIME_WASM,
  });
  const lang = await Language.load(GRAMMAR_WASM);
  parser = new Parser();
  parser.setLanguage(lang);
}, 30_000);

describe.skipIf(!wasmPresent)("tree-sitter-gregorio WASM", () => {
  it("parses the sample and returns a non-null tree", () => {
    const tree = parser.parse(SAMPLE);
    expect(tree).not.toBeNull();
    expect(tree!.rootNode).toBeDefined();
  });

  it("root node type is source_file", () => {
    const tree = parser.parse(SAMPLE);
    expect(tree!.rootNode.type).toBe("source_file");
  });

  it("tree contains a header_section node", () => {
    const tree = parser.parse(SAMPLE);
    const all = tree!.rootNode.toString();
    expect(all).toContain("header_section");
  });

  it("tree contains a header_name node (real named node type)", () => {
    const tree = parser.parse(SAMPLE);
    let found = false;
    function walk(n: { type: string; childCount: number; child(i: number): typeof n | null }) {
      if (n.type === "header_name") found = true;
      for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) walk(c); }
    }
    walk(tree!.rootNode);
    expect(found).toBe(true);
  });

  it("tree contains a section_separator node (%%)", () => {
    const tree = parser.parse(SAMPLE);
    let found = false;
    function walk(n: { type: string; childCount: number; child(i: number): typeof n | null }) {
      if (n.type === "section_separator") found = true;
      for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) walk(c); }
    }
    walk(tree!.rootNode);
    expect(found).toBe(true);
  });

  it("tree contains a gabc_clef / c_clef node", () => {
    const tree = parser.parse(SAMPLE);
    const sexp = tree!.rootNode.toString();
    expect(sexp).toMatch(/c_clef|gabc_clef/);
  });

  it("tree contains gabc_neume / pitch_lowercase nodes", () => {
    const tree = parser.parse(SAMPLE);
    const sexp = tree!.rootNode.toString();
    expect(sexp).toMatch(/gabc_neume|pitch_lowercase/);
  });

  it("tree contains a nabc_snippet node", () => {
    const tree = parser.parse(SAMPLE);
    const sexp = tree!.rootNode.toString();
    expect(sexp).toContain("nabc_snippet");
  });

  it("tree contains a divisio_finalis node (::)", () => {
    const tree = parser.parse(SAMPLE);
    const sexp = tree!.rootNode.toString();
    expect(sexp).toContain("divisio_finalis");
  });

  it("tree contains syllable_text nodes", () => {
    const tree = parser.parse(SAMPLE);
    const sexp = tree!.rootNode.toString();
    expect(sexp).toContain("syllable_text");
  });
});

describe.skipIf(!wasmPresent)("buildDecorationsFromSource", () => {
  it("returns a DecorationSet without throwing", () => {
    // This is the key robustness test: no RangeSetBuilder ordering/overlap error.
    let decos: ReturnType<typeof buildDecorationsFromSource> | null = null;
    expect(() => {
      decos = buildDecorationsFromSource(parser, SAMPLE);
    }).not.toThrow();
    expect(decos).not.toBeNull();
  });

  it("decorates with tok-header-key for 'name' header key", () => {
    const source = `name: Kyrie;\n%%\n(c4) Ky(f)\n`;
    const decos = buildDecorationsFromSource(parser, source);
    // Collect all ranges from the DecorationSet
    const ranges: Array<{ from: number; to: number; class: string }> = [];
    const cursor = decos.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to, class: (cursor.value.spec as { class: string }).class });
      cursor.next();
    }
    const headerKeys = ranges.filter(r => r.class === "tok-header-key");
    expect(headerKeys.length).toBeGreaterThan(0);
  });

  it("decorates with tok-clef for the clef token", () => {
    const source = `%%\n(c4) a(f)\n`;
    const decos = buildDecorationsFromSource(parser, source);
    const ranges: Array<{ from: number; to: number; class: string }> = [];
    const cursor = decos.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to, class: (cursor.value.spec as { class: string }).class });
      cursor.next();
    }
    const clefs = ranges.filter(r => r.class === "tok-clef");
    expect(clefs.length).toBeGreaterThan(0);
  });

  it("decorates with tok-bar for divisio_finalis (::)", () => {
    const source = `%%\n(c4) a(f) (:) b(g) (::)\n`;
    const decos = buildDecorationsFromSource(parser, source);
    const ranges: Array<{ from: number; to: number; class: string }> = [];
    const cursor = decos.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to, class: (cursor.value.spec as { class: string }).class });
      cursor.next();
    }
    const bars = ranges.filter(r => r.class === "tok-bar");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("decorates with tok-nabc for NABC annotations", () => {
    const decos = buildDecorationsFromSource(parser, SAMPLE);
    const ranges: Array<{ from: number; to: number; class: string }> = [];
    const cursor = decos.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to, class: (cursor.value.spec as { class: string }).class });
      cursor.next();
    }
    const nabc = ranges.filter(r => r.class === "tok-nabc");
    expect(nabc.length).toBeGreaterThan(0);
  });

  it("all decoration ranges are non-overlapping and in ascending order", () => {
    const decos = buildDecorationsFromSource(parser, SAMPLE);
    const ranges: Array<{ from: number; to: number }> = [];
    const cursor = decos.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to });
      cursor.next();
    }
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].from).toBeGreaterThanOrEqual(ranges[i - 1].to);
    }
  });
});
