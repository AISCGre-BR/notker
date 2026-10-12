# Notker

Editor desktop de canto gregoriano (**GABC/NABC**). Tauri 2 + CodeMirror 6. **GPL-3.0** · `0.0.3-alpha`.

## Aviso (alpha, "como está")

O Notker está em fase **alpha**: em desenvolvimento ativo, sujeito a mudanças, instabilidades e eventual perda de dados. É distribuído **"como está" (*as is*)**, **sem garantia de qualquer tipo**, expressa ou implícita — incluindo, sem limitação, garantias de comercialização ou de adequação a um fim específico —, nos termos da licença **GPL-3.0**. O uso é por sua conta e risco; **mantenha backups do seu trabalho**.

## Desenvolvimento

```bash
npm install
npm run sidecar                                   # gregorio-lsp (requer Rust)
source ~/emsdk/emsdk_env.sh && npm run grammar    # WASM da gramática (requer Emscripten)
npm run tauri dev
```

Testes: `npm run test`.
Projeto de exemplo (`src/assets/example-project.json`, gerado de `samples/`): `npm run example`.

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

Atalhos: F2 ou Ctrl+K: buscar neuma (Ctrl+Enter num resultado: cadastrar nome) · `Ctrl+Shift+N` nomear o neuma sob o cursor · `Ctrl+Alt+L` régua de altura na pauta · `Ctrl+Alt+E`/`Ctrl+Alt+I` exportar/importar nomes.

Tela de nomes (Exibir ▸ Neumas, `Ctrl+3`; `Ctrl+1` ou Esc volta à Edição): setas navegam, N foca "Novo nome…", Enter grava, S cria uma sequência (cadeia nabc livre), / ou `Ctrl+F` busca, I insere no canto. Os nomes valem para todos os projetos e entram na busca, no hover e no completion.

Remover episemas e puncta mora: ao colar ou importar gabc que os contenha, um aviso oferece **Remover…**; também em Editar ▸ Remover episemas e puncta mora… (sem atalho; age na seleção, ou no canto inteiro se não há seleção). O diálogo mostra a contagem de episemas verticais, episemas horizontais (com seus `[oh:…]`/`[uh:…]`) e puncta mora, e você escolhe quais tirar. Só mexe nas notas dentro de `( )`, antes do `|` do nabc; letra, cabeçalho, divisões e demais colchetes ficam intactos. Uma só ação no histórico: `Ctrl+Z` desfaz tudo.

Letras na pauta: Exibir ▸ Letras na pauta (ou o botão na régua de altura, `Ctrl+Alt+L`) mostra, à esquerda de cada pauta da partitura, a letra gabc de cada linha e espaço conforme a clave daquela pauta; o tooltip dá o nome da nota. Desligado por padrão e só na mesa: nunca vai para o PDF nem para a miniatura.

O playback (Tocar, modos e onda de interpretação) está desligado nesta versão; a interpretação salva nos projetos é preservada.

Árvore de cantos: ↑↓ navegar, ←→ recolher/expandir, Enter abrir, F2 renomear, Del excluir, Alt+↑/↓ mover, Ctrl+D duplicar, Shift+F10 menu; arrastar para reordenar ou soltar dentro de um grupo.

`Ctrl+Shift+S` — Salvar como…

Tela inicial: o projeto mais recente em destaque (Continuar), os anteriores em cartões, ou Novo projeto / Abrir… / Projeto de exemplo. `Ctrl+N` — Novo projeto · Arquivo ▸ Abrir recente ▸ (até 10; Limpar recentes) · `Ctrl+W` — Fechar projeto · Ajuda ▸ Abrir projeto de exemplo. Novo projeto é guiado em passos (Esc cancela). Com alterações não salvas, o Notker guarda um retrato a cada 30 s; se o app fechar sem salvar, a tela inicial oferece **Recuperar**.

`Ctrl+P` — Arquivo ▸ Exportar PDF…: canto atual, grupo selecionado na árvore (com subgrupos) ou projeto inteiro, em A4 ou Carta (retrato, margens de 2 cm), neumas St. Gall/Laon em vermelho ou preto, peças uma após a outra ou cada uma em nova página. O PDF é vetorial (texto selecionável) e leva as fontes embutidas; cada peça leva só o título.

### Créditos adicionais (F2)

- Fontes `gregall`/`grelaon` e a referência NABC (`GregorioNabcRef`, `gregoriotex-nabc.lua`): **The Gregorio Project** — GPLv3 com exceção de fonte.
- Tabela semiológica / letras significativas: **Dom Eugène Cardine**.

### Interface

- Ícones: [Lucide](https://lucide.dev), licença ISC — SVGs copiados em `src/ui/pd/icons.ts`.
- Fontes: [Source Sans 3](https://github.com/adobe-fonts/source-sans) e [Source Serif 4](https://github.com/adobe-fonts/source-serif) (Adobe, SIL Open Font License 1.1) via [@fontsource](https://fontsource.org).
- Linguagem visual: [Parchment Design](https://github.com/AISCGre-BR/parchment-design) (AISCGre-BR, MIT).
- Tela inicial e criação guiada de projeto: desenho do [Mocquereau](https://github.com/AISCGre-BR/mocquereau) (AISCGre-BR), adaptado.
- Projeto de exemplo: os `.gabc` de `samples/` (transcrições creditadas no cabeçalho de cada arquivo — Andrew Hinkley, Jakub Jelínek, Marek Klein).
- Exportar PDF: [jsPDF](https://github.com/parallax/jsPDF) e [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT).
- Letra e títulos do PDF: [Source Serif 4](https://github.com/adobe-fonts/source-serif) 4.005 (Adobe, SIL Open Font License 1.1), TTFs com a licença em `src/assets/fonts/source-serif-4/`.

## Instalação (builds não assinadas)

As builds de release ainda não são assinadas/notarizadas (alpha).

- **macOS** — apps baixados são marcados como "danificados" pelo Gatekeeper (especialmente no Apple Silicon). Arraste o Notker para `/Applications` e rode uma vez:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Notker.app
  ```
  Depois é só abrir. O comando remove o atributo de quarentena — é o único passo que funciona de forma confiável em arm64.
- **Windows** — SmartScreen → "Mais informações" → "Executar assim mesmo".

## Licença

GPL-3.0-only. Veja [LICENSE](LICENSE).
