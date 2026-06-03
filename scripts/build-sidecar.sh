set -euo pipefail
REF="v0.9.4"
OUT="src-tauri/binaries"
WORK="$(mktemp -d)"
git clone --depth 1 --branch "$REF" https://github.com/aiscgre-br/gregorio-lsp "$WORK/gregorio-lsp"

# Alvo: 1º argumento = triple para cross-build (ex.: x86_64-apple-darwin).
# Sem argumento, compila para o host (comportamento padrão de Linux/Windows/arm).
HOST_TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
TARGET="${1:-}"
TRIPLE="${TARGET:-$HOST_TRIPLE}"

if [ -n "$TARGET" ] && [ "$TARGET" != "$HOST_TRIPLE" ]; then
  # Cross-build (ex.: x86_64 no runner arm64). O Tauri procura o externalBin
  # nomeado com o triple do --target, então compilamos para esse alvo.
  rustup target add "$TARGET"
  ( cd "$WORK/gregorio-lsp" && cargo build --release --features tree-sitter --bin gregorio-lsp --target "$TARGET" )
  BIN_DIR="$TARGET/release"
else
  ( cd "$WORK/gregorio-lsp" && cargo build --release --features tree-sitter --bin gregorio-lsp )
  BIN_DIR="release"
fi

# No Windows o binário tem sufixo .exe; o Tauri espera gregorio-lsp-<triple>.exe.
EXT=""
case "$TRIPLE" in *windows*) EXT=".exe" ;; esac
mkdir -p "$OUT"
cp "$WORK/gregorio-lsp/target/$BIN_DIR/gregorio-lsp$EXT" "$OUT/gregorio-lsp-$TRIPLE$EXT"
echo "sidecar: $OUT/gregorio-lsp-$TRIPLE$EXT"
