#!/usr/bin/env node
// Gera THIRD-PARTY-LICENSES.md: licenças das dependências que vão no app
// (npm de produção + crates do src-tauri + crates do sidecar gregorio-lsp).
// Uso: node scripts/third-party-licenses.mjs [Cargo.toml extra ...]
// Textos idênticos são agrupados para o arquivo não repetir a mesma licença.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const LICENSE_RE = /^(licen[cs]e|copying|notice|copyright|unlicense|feel-free)/i;

function licenseTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => LICENSE_RE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
    .filter(Boolean);
}

const pkgs = new Map(); // "nome versão" → { name, version, license, repo, texts }

// npm: só o que não é dev no lockfile (é o que o vite pode empacotar).
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.devOptional) continue;
  const dir = join(ROOT, path);
  let pj = {};
  try { pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { continue; }
  const name = pj.name ?? path.replace(/.*node_modules\//, "");
  const repo = typeof pj.repository === "string" ? pj.repository : pj.repository?.url;
  pkgs.set(`npm:${name}@${pj.version}`, {
    name, version: pj.version, eco: "npm", license: info.license ?? pj.license ?? "?",
    repo: repo ?? pj.homepage ?? "", texts: licenseTexts(dir),
  });
}

// cargo: todos os pacotes resolvidos (inclui os de outras plataformas — sobra, não falta).
const manifests = [join(ROOT, "src-tauri", "Cargo.toml"), ...process.argv.slice(2)];
for (const manifest of manifests) {
  const meta = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--manifest-path", manifest], { maxBuffer: 1 << 28 }).toString());
  const local = new Set(meta.workspace_members);
  for (const p of meta.packages) {
    if (local.has(p.id)) continue;
    pkgs.set(`crate:${p.name}@${p.version}`, {
      name: p.name, version: p.version, eco: "crate", license: p.license ?? (p.license_file ? `ver ${p.license_file}` : "?"),
      repo: p.repository ?? "", texts: licenseTexts(dirname(p.manifest_path)),
    });
  }
}

const sorted = [...pkgs.values()].sort((a, b) => (a.eco + a.name).localeCompare(b.eco + b.name));
const groups = new Map(); // texto → [pacotes]
const semTexto = [];
for (const p of sorted) {
  if (!p.texts.length) { semTexto.push(p); continue; }
  const key = p.texts.join("\n\n---\n\n");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

const line = (p) => `- ${p.eco === "npm" ? "npm" : "crate"} \`${p.name}\` ${p.version} — ${p.license}${p.repo ? ` — ${p.repo.replace(/^git\+/, "")}` : ""}`;
let out = `# Licenças de terceiros / Third-party licenses

Notker é distribuído sob a GPL-3.0-only (ver LICENSE). Ele inclui os componentes abaixo,
cada um sob a própria licença, todas compatíveis com a GPL-3.0.
_Notker is distributed under GPL-3.0-only (see LICENSE). It includes the components below,
each under its own license, all compatible with GPL-3.0._

Gerado por \`node scripts/third-party-licenses.mjs\` — ${sorted.length} pacotes.

`;
for (const [text, ps] of groups) {
  out += `## ${ps.length === 1 ? ps[0].name : `${ps[0].name} e mais ${ps.length - 1}`}\n\n${ps.map(line).join("\n")}\n\n\`\`\`text\n${text.replace(/```/g, "'''")}\n\`\`\`\n\n`;
}
if (semTexto.length) {
  out += `## Pacotes sem arquivo de licença no pacote publicado\n\nA licença declarada no manifesto vale; o texto-padrão (MIT, Apache-2.0, ISC…) está em https://spdx.org/licenses/.\n\n${semTexto.map(line).join("\n")}\n`;
}
writeFileSync(join(ROOT, "THIRD-PARTY-LICENSES.md"), out);
console.log(`THIRD-PARTY-LICENSES.md: ${sorted.length} pacotes, ${groups.size} textos, ${semTexto.length} sem texto`);
