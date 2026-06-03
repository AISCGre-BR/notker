// scripts/build-neume-db.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createHash as hash } from "node:crypto";
import { resolve } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { decodeGlyph } from "../src/neume/decode";
import { nameNeume } from "../src/neume/naming";
import synopsis from "../src/neume/synopsis-neumes.json";
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
      // F4: enriquece com nome(s) canônico(s) da sinopse + termos sistemáticos.
      const naming = nameNeume(e.nabc, family);
      e.terms = Array.from(new Set([...e.terms, ...naming.terms]));
      if (naming.canonical.length) {
        e.name = naming.displayNames[0];
        e.provenance = naming.provenance;
      }
      entries.push(e);
    }
  }

  // F4: entradas-sequência sintéticas (cl!po, etc.) — chanceladas pela sinopse,
  // buscáveis e inseríveis como texto. Miniatura = glifo da primeira base (placeholder).
  const seen = new Set(entries.map((e) => e.id));
  const rows = (synopsis as { rows: { family: Family; name: string; examples: string[] }[] }).rows;
  let synthetic = 0;
  for (const row of rows) {
    for (const code of row.examples) {
      if (!code.includes("!")) continue;
      const id = `${row.family}:${code}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const firstBase = code.split("!")[0].replace(/^[/`]+/, "").slice(0, 2);
      const svg = glyphs[row.family]?.[firstBase] ?? { path: "M0 0", viewBox: "0 0 10 10", advance: 10 };
      const naming = nameNeume(code, row.family);
      const valid = probe(code);
      if (!valid) invalid++;
      entries.push({
        id, family: row.family, code, nabc: code, nabcValid: valid,
        base: firstBase, name: naming.displayNames[0] ?? code,
        qualifiers: [], letters: [],
        terms: Array.from(new Set([...naming.terms, code.toLowerCase()])),
        meaning: "", svg, synthetic: true, provenance: naming.provenance,
      });
      synthetic++;
    }
  }
  console.log(`neume-db: +${synthetic} entradas-sequência sintéticas`);

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
