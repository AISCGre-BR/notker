# Notker — NOTICE

Copyright © 2026 AISCGre Brasil
(Associação Internacional de Estudos de Canto Gregoriano — Seção Brasileira)

Desenvolvimento: Gabriel Honorato Teixeira Bernardo — AISCGre Brasil

Notker é software livre sob a **GNU General Public License v3.0 only** (ver [LICENSE](LICENSE)).
Todos os componentes de terceiros abaixo mantêm as suas licenças, compatíveis com a GPL-3.0.
O texto de cada licença das dependências empacotadas está em [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)
(gerado por `node scripts/third-party-licenses.mjs`), que também acompanha os instaladores.

## Componentes da AISCGre Brasil

| Componente | Uso no Notker | Licença |
|---|---|---|
| [gregorio-lsp](https://github.com/aiscgre-br/gregorio-lsp) v0.9.4 | servidor de linguagem (sidecar): diagnósticos, hover, completion | MIT |
| [tree-sitter-gregorio](https://github.com/aiscgre-br/tree-sitter-gregorio) | gramática GABC/NABC (WASM em `src/assets/`) para realce | MIT |
| [Augustinus](https://github.com/aiscgre-br/Augustinus) e `@testneumz/nabc-lib` 2.2.22 | renderização da partitura (preview, miniaturas e PDF) | MIT · ISC |
| [Parchment Design](https://github.com/AISCGre-BR/parchment-design) v1.0.2 | linguagem visual e componentes da interface | MIT |
| [Mocquereau](https://github.com/AISCGre-BR/mocquereau) | desenho da tela inicial e da criação guiada de projeto (adaptado) | GPL-3.0 |

## Fontes e material do Projeto Gregorio

- **Fontes `gregall` e `grelaon`** (neumas de St. Gall e Laon), distribuídas com `nabc-lib` e embutidas nos PDFs exportados — **The Gregorio Project**, GPLv3 com exceção de fonte. A exceção permite que documentos (como os PDFs exportados) incorporem a fonte sem ficarem, por isso, sujeitos à GPL.
- **Catálogo de neumas** (`src/assets/neume-db.json`): os contornos dos 1.189 glifos foram extraídos dessas fontes (`scripts/extract-glyph-paths.py`); os códigos seguem a referência *nabc language for gregorio* (`GregorioNabcRef`, `gregoriotex-nabc.lua`) — The Gregorio Project, GPL-3.0.
- **Exemplos**: *Factus est* vem de `examples/` do Projeto Gregorio (GPL-3.0); as transcrições estão creditadas no cabeçalho de cada arquivo em `samples/` (Andrew Hinkley, Jakub Jelínek, Marek Klein).

## Referências musicológicas

- Nomes dos neumas: tabela neumática sinóptica de **Dom Eugène Cardine**, *Semiologia Gregoriana*; cada nome mostra a fonte.
- Letras significativas: tradição atribuída a **Notker Balbulus** (c. 840–912), de quem o programa leva o nome.

## Bibliotecas de terceiros

| Componente | Licença |
|---|---|
| [Tauri 2](https://tauri.app) e plugins (dialog, fs, shell) | MIT / Apache-2.0 |
| [CodeMirror 6](https://codemirror.net) | MIT |
| [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) | MIT |
| [vscode-languageserver-protocol](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 e [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) 2.7.0 | MIT |
| Ícones [Lucide](https://lucide.dev) (SVGs copiados em `src/ui/pd/icons.ts`) | ISC |
| [Source Sans 3](https://github.com/adobe-fonts/source-sans) e [Source Serif 4](https://github.com/adobe-fonts/source-serif) (Adobe), via [@fontsource](https://fontsource.org); TTFs do PDF com a licença em `src/assets/fonts/source-serif-4/` | SIL OFL 1.1 |
| Demais dependências npm e crates Rust (≈ 630 pacotes) | MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0, Unicode-3.0, 0BSD, Unlicense — ver THIRD-PARTY-LICENSES.md |
