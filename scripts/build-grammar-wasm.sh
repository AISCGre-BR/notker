#!/usr/bin/env bash
set -euo pipefail
# Requer emcc no PATH. Em dev local: source ~/emsdk/emsdk_env.sh antes.
REF="v0.5.2"
# Use a tmpdir on the same filesystem as the project to avoid cross-device rename errors.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WORK="$(mktemp -d "$PROJECT_DIR/.tmp-grammar-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
git clone --depth 1 --branch "$REF" https://github.com/aiscgre-br/tree-sitter-gregorio "$WORK/g"
mkdir -p "$PROJECT_DIR/src/assets"
tree-sitter build --wasm "$WORK/g" -o "$PROJECT_DIR/src/assets/tree-sitter-gregorio.wasm"
WASM_RUNTIME="$(find "$PROJECT_DIR/node_modules/web-tree-sitter" -name '*.wasm' ! -path '*/debug/*' | head -1)"
cp "$WASM_RUNTIME" "$PROJECT_DIR/src/assets/tree-sitter.wasm"
echo "wasm: src/assets/tree-sitter-gregorio.wasm"
