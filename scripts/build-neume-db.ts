// scripts/build-neume-db.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createHash as hash } from "node:crypto";
import { resolve } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { decodeGlyph } from "../src/neume/decode";
import type { Family, NeumeDb, NeumeEntry, BaseAnnotations } from "../src/neume/types";

const ROOT = resolve(import.meta.dirname, "..");

const GLYPHS = resolve(ROOT, "scripts/.cache/glyph-paths.json");
const WASM = resolve(ROOT, "src/assets/tree-sitter-gregorio.wasm");
const RUNTIME = resolve(ROOT, "src/assets/tree-sitter.wasm");
const OUT = resolve(ROOT, "src/assets/neume-db.json");

function sha256(path: string): string {
  return hash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

async function main() {
  const glyphs = JSON.parse(readFileSync(GLYPHS, "utf8")) as
    Record<Family, Record<string, { path: string; viewBox: string; advance: number }>>;
  const annot = JSON.parse(
    readFileSync(resolve(ROOT, "src/neume/base-annotations.json"), "utf8"),
  ) as BaseAnnotations;

  // Mirror test/highlight.test.ts exactly — locateFile is required so Emscripten
  // finds the runtime wasm when running under Node with tsx.
  await Parser.init({
    locateFile: () => RUNTIME,
  });
  const lang = await Language.load(WASM);
  const parser = new Parser();
  parser.setLanguage(lang);

  const probe = (nabc: string): boolean => {
    // Embed the nabc as a single neume under a minimal valid GABC score.
    // The clef (h) is a placeholder pitch; the | separates gabc from nabc.
    const doc = `nabc-lines: 1;\nname: probe;\n%%\n(h|${nabc})`;
    const tree = parser.parse(doc);
    return tree != null && !tree.rootNode.hasError;
  };

  const entries: NeumeEntry[] = [];
  let invalid = 0;
  for (const family of ["stgall", "laon"] as Family[]) {
    for (const [code, svg] of Object.entries(glyphs[family])) {
      const e = decodeGlyph(family, code, svg, annot);
      e.nabcValid = probe(e.nabc);
      if (!e.nabcValid) invalid++;
      entries.push(e);
    }
  }

  const db: NeumeDb = {
    schema: 1,
    generatedFrom: {
      gregall: sha256(resolve(ROOT, "src/assets/fonts/gregall.ttf")),
      grelaon: sha256(resolve(ROOT, "src/assets/fonts/grelaon.ttf")),
      tables: "nabc-v6.2.0",
    },
    entries,
  };
  writeFileSync(OUT, JSON.stringify(db));
  const pct = ((invalid / entries.length) * 100).toFixed(1);
  console.log(
    `neume-db: ${entries.length} entradas (${invalid} com nabc não-validado pelo parser — ${pct}%)`,
  );
}

main();
