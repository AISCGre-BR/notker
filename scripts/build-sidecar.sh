set -euo pipefail
REF="v0.9.4"
OUT="src-tauri/binaries"
WORK="$(mktemp -d)"
git clone --depth 1 --branch "$REF" https://github.com/aiscgre-br/gregorio-lsp "$WORK/gregorio-lsp"
( cd "$WORK/gregorio-lsp" && cargo build --release --features tree-sitter --bin gregorio-lsp )
TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
# No Windows o binário tem sufixo .exe; o Tauri espera gregorio-lsp-<triple>.exe.
EXT=""
case "$TRIPLE" in *windows*) EXT=".exe" ;; esac
mkdir -p "$OUT"
cp "$WORK/gregorio-lsp/target/release/gregorio-lsp$EXT" "$OUT/gregorio-lsp-$TRIPLE$EXT"
echo "sidecar: $OUT/gregorio-lsp-$TRIPLE$EXT"
