# Notker

Editor desktop de canto gregoriano (**GABC/NABC**). Tauri 2 + CodeMirror 6. **GPL-3.0** · `0.0.2-alpha`.

## Desenvolvimento

```bash
npm install
npm run sidecar                                   # gregorio-lsp (requer Rust)
source ~/emsdk/emsdk_env.sh && npm run grammar    # WASM da gramática (requer Emscripten)
npm run tauri dev
```

Testes: `npm run test`.

## Agradecimentos

Notker se apoia em projetos da comunidade, a quem agradecemos:
[gregorio-lsp](https://github.com/aiscgre-br/gregorio-lsp) e [tree-sitter-gregorio](https://github.com/aiscgre-br/tree-sitter-gregorio) (análise e realce), [Augustinus](https://github.com/aiscgre-br/Augustinus) e `nabc-lib` (geração/renderização), o **Projeto Gregorio** (referência *nabc language for gregorio*) e a tabela semiológica de **Dom Eugène Cardine**.

## Créditos

- **Desenvolvimento:** Gabriel Honorato Teixeira Bernardo — AISCGre Brasil
- **Projetos utilizados:** Laércio Benedito Savali de Sousa — AISCGre Brasil; Giovanni Del Chiaro — AISCGre Brasil
- **Ideias e contribuições:** Danillo Del Chiaro — AISCGre Brasil

## Licença

GPL-3.0-only. Veja [LICENSE](LICENSE).
