#!/usr/bin/env bash
# Comando único para teste visual: prepara os artefatos que faltam
# (sidecar, gramática WASM, neume-db) e sobe o app Tauri em modo dev.
# Idempotente — pula cada passo cujo artefato já existe.
#   npm run app            (prepara o que falta e sobe)
#   npm run app -- --fresh (regenera tudo do zero)
set -euo pipefail
cd "$(dirname "$0")/.."

FRESH=0
[ "${1:-}" = "--fresh" ] && FRESH=1

step() { printf '\n\033[1;36m→ %s\033[0m\n' "$1"; }

# 1. Sidecar gregorio-lsp (Rust)
if [ "$FRESH" = 1 ] || ! ls src-tauri/binaries/gregorio-lsp-* >/dev/null 2>&1; then
  step "build do sidecar gregorio-lsp (Rust)…"
  npm run sidecar
else
  echo "✓ sidecar presente"
fi

# 2. Gramática tree-sitter → WASM
if [ "$FRESH" = 1 ] || [ ! -f src/assets/tree-sitter-gregorio.wasm ]; then
  step "build da gramática tree-sitter-gregorio (WASM)…"
  npm run grammar
else
  echo "✓ gramática WASM presente"
fi

# 3. neume-db.json (extrai glifos das fontes + decodifica; precisa do WASM acima)
if [ "$FRESH" = 1 ] || [ ! -f src/assets/neume-db.json ]; then
  step "gerando neume-db.json (fonttools + decode + validação NABC)…"
  npm run neume
else
  echo "✓ neume-db.json presente"
fi

step "iniciando o app (tauri dev)…"
exec npm run tauri dev
