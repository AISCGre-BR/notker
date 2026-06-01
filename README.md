# Notker

Editor desktop de canto gregoriano (**GABC/NABC**). Tauri 2 + CodeMirror 6. Licença **GPL-3.0**. Versão `0.0.2-alpha`.

> Recomeço de 2026-06-01. O Notker anterior foi arquivado como `notker-LEGACY`.

## O que a F1 entrega
Casca do editor: abrir/editar/salvar `.gabc`, realce de sintaxe via tree-sitter, diagnósticos ao vivo, formatação (grefmt) e comandos `gregorio/*` — tudo movido pelo `gregorio-lsp` rodando como sidecar. Busca de neumas e hover semiológico vêm na F2.

## Desenvolvimento
Requisitos: Node 22+, Rust (cargo), e — só para gerar o WASM da gramática — Emscripten (emsdk).

```bash
npm install
npm run sidecar     # builda o gregorio-lsp v0.9.4 (requer Rust)
# gerar o WASM da gramática (requer emcc no PATH):
source ~/emsdk/emsdk_env.sh
npm run grammar
npm run tauri dev   # roda o app
```

Testes: `npm run test`. Build do frontend: `npm run build`. Type-check dos testes: `npm run typecheck:test`.

## Stack
- **Casca:** Tauri 2 (Rust) + CodeMirror 6 (TypeScript/Vite).
- **Inteligência da linguagem:** [`gregorio-lsp`](https://github.com/aiscgre-br/gregorio-lsp) (Rust) como sidecar — diagnósticos, formatação (grefmt), code actions, comandos.
- **Realce:** [`tree-sitter-gregorio`](https://github.com/aiscgre-br/tree-sitter-gregorio) compilado para WASM.

## Créditos e fontes
- **Laércio** (AISCGre-BR) — `gregorio-lsp`, `tree-sitter-gregorio`, extensões VS Code/Zed.
- **gigio** (AISCGre-BR) — `Augustinus`, `nabc-lib`.
- **Dom Eugène Cardine** — tabela semiológica de neumas (base do mapeamento NABC).
- **Projeto Gregorio** — a referência oficial *nabc language for gregorio* e o ecossistema GABC/NABC.

## Licença
GPL-3.0-only. Veja [LICENSE](LICENSE).
