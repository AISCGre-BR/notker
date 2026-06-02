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

## Busca de neumas (F2)

O `neume-db.json` é gerado das fontes do Gregorio:

```bash
pip install 'fonttools==4.59.0'   # uma vez
npm run neume                      # extrai glifos + gera o db (precisa do wasm: npm run grammar)
```

Atalhos: `Ctrl+Space` busca de neumas · `Ctrl+Alt+L` régua de altura na pauta · `Ctrl+Alt+E`/`Ctrl+Alt+I` exportar/importar nomes.

### Créditos adicionais (F2)

- Fontes `gregall`/`grelaon` e a referência NABC (`GregorioNabcRef`, `gregoriotex-nabc.lua`): **The Gregorio Project** — GPLv3 com exceção de fonte.
- Tabela semiológica / letras significativas: **Dom Eugène Cardine**.

## Licença

GPL-3.0-only. Veja [LICENSE](LICENSE).
