// scripts/build-example.ts — gera src/assets/example-project.json a partir de samples/*.gabc.
// É o MESMO bundle de um .notker (project.json + .gabc puros), em JSON: o webview abre
// com fromBundle, sem ZIP nem caminho. Uso: npm run example
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildExampleBundle } from "../src/project/example-build";

const samples = readdirSync("samples")
  .filter((f) => f.endsWith(".gabc"))
  .sort()
  .map((file) => ({ file, content: readFileSync(`samples/${file}`, "utf8") }));
const out = "src/assets/example-project.json";
writeFileSync(out, JSON.stringify(buildExampleBundle(samples), null, 2) + "\n");
console.log(`${out}: ${samples.length} cantos`);
