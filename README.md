# Notker

Editor desktop de canto gregoriano em **GABC/NABC**: notação quadrada e neumas adiastemáticos de St. Gall e Laon. Tauri 2 + CodeMirror 6. **GPL-3.0** · `0.1.0-beta`.

O nome homenageia **Notker Balbulus** (c. 840–912), monge de St. Gall a quem a tradição atribui a carta sobre as letras significativas.

## O que faz

- Editor GABC/NABC com realce e diagnósticos do [gregorio-lsp](https://github.com/aiscgre-br/gregorio-lsp), e partitura redesenhada enquanto se digita.
- Projetos (`.notker`) com grupos definidos pelo usuário; cada canto é um `.gabc` comum dentro do projeto.
- Catálogo de 1.189 glifos (604 St. Gall, 585 Laon): busca por nome ou código, nomes da tabela sinóptica de Cardine com a fonte, e nomes próprios para glifos e sequências de neumas.
- Exportação para PDF vetorial (A4 ou Carta, várias peças por página, neumas em vermelho ou preto).
- Remoção de episemas e puncta mora ao colar/importar gabc; letras gabc de cada linha e espaço ao lado da pauta.
- Interface em português, inglês e italiano.

## Downloads

Instaladores em [Releases](https://github.com/AISCGre-BR/notker/releases): Linux `.deb`/`.rpm`, Windows `.exe`, macOS `.dmg` (Apple Silicon e Intel).

## Aviso (beta, "como está")

O Notker está em fase **beta**: as funções principais estão prontas, mas o programa ainda pode mudar e ter falhas, inclusive com perda de dados. É distribuído **"como está" (*as is*)**, **sem garantia de qualquer tipo**, expressa ou implícita — incluindo, sem limitação, garantias de comercialização ou de adequação a um fim específico —, nos termos da licença **GPL-3.0** (seções 15 e 16). O uso é por sua conta e risco; **mantenha backups do seu trabalho**.

## Instalação (builds não assinadas)

As builds de release ainda não são assinadas/notarizadas.

- **Linux** — `.rpm` (Fedora/openSUSE) e `.deb` (Debian/Ubuntu) usam o WebKitGTK do sistema.
- **macOS** — apps baixados são marcados como "danificados" pelo Gatekeeper (especialmente no Apple Silicon). Arraste o Notker para `/Applications` e rode uma vez:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Notker.app
  ```
  Depois é só abrir. O comando remove o atributo de quarentena — é o único passo que funciona de forma confiável em arm64.
- **Windows** — SmartScreen → "Mais informações" → "Executar assim mesmo".

## Uso

Tela inicial: o projeto mais recente em destaque (Continuar), os anteriores em cartões, ou Novo projeto / Abrir… / Projeto de exemplo. `Ctrl+N` — Novo projeto · Arquivo ▸ Abrir recente ▸ (até 10; Limpar recentes) · `Ctrl+W` — Fechar projeto · `Ctrl+Shift+S` — Salvar como… · Ajuda ▸ Abrir projeto de exemplo. Novo projeto é guiado em passos (Esc cancela). Com alterações não salvas, o Notker guarda um retrato a cada 30 s; se o app fechar sem salvar, a tela inicial oferece **Recuperar**.

Árvore de cantos: ↑↓ navegar, ←→ recolher/expandir, Enter abrir, F2 renomear, Del excluir, Alt+↑/↓ mover, Ctrl+D duplicar, Shift+F10 menu; arrastar para reordenar ou soltar dentro de um grupo.

Busca de neumas: F2 ou Ctrl+K (Ctrl+Enter num resultado: cadastrar nome) · `Ctrl+Shift+N` nomear o neuma sob o cursor · `Ctrl+Alt+L` régua de altura na pauta · `Ctrl+Alt+E`/`Ctrl+Alt+I` exportar/importar nomes.

Tela de nomes (Exibir ▸ Neumas, `Ctrl+3`; `Ctrl+1` ou Esc volta à Edição): setas navegam, N foca "Novo nome…", Enter grava, S cria uma sequência (cadeia nabc livre), / ou `Ctrl+F` busca, I insere no canto. Os nomes valem para todos os projetos e entram na busca, no hover e no completion.

Remover episemas e puncta mora: ao colar ou importar gabc que os contenha, um aviso oferece **Remover…**; também em Editar ▸ Remover episemas e puncta mora… (sem atalho; age na seleção, ou no canto inteiro se não há seleção). O diálogo mostra a contagem de episemas verticais, episemas horizontais (com seus `[oh:…]`/`[uh:…]`) e puncta mora, e você escolhe quais tirar. Só mexe nas notas dentro de `( )`, antes do `|` do nabc; letra, cabeçalho, divisões e demais colchetes ficam intactos. Uma só ação no histórico: `Ctrl+Z` desfaz tudo.

Letras na pauta: Exibir ▸ Letras na pauta (ou o botão na régua de altura, `Ctrl+Alt+L`) mostra, à esquerda de cada pauta da partitura, a letra gabc de cada linha e espaço. A letra é a posição na pauta (`d` na linha 1, de baixo, até `j` na linha 4) e é a mesma em qualquer clave; o nome da nota na clave daquela pauta aparece no tooltip. Desligado por padrão e só na mesa: nunca vai para o PDF nem para a miniatura.

`Ctrl+P` — Arquivo ▸ Exportar PDF…: canto atual, grupo selecionado na árvore (com subgrupos) ou projeto inteiro, em A4 ou Carta (retrato, margens de 2 cm), neumas St. Gall/Laon em vermelho ou preto, peças uma após a outra ou cada uma em nova página. O PDF é vetorial (texto selecionável) e leva as fontes embutidas; cada peça leva só o título.

Idioma: a interface vem no idioma do sistema (português, inglês ou italiano; outros → inglês). Exibir ▸ Idioma escolhe e lembra; trocar pergunta "Salvar alterações?" como ao fechar, recarrega a janela e reabre o projeto. Nomes latinos dos neumas, códigos gabc/nabc e o texto da partitura não mudam.

O playback (Tocar, modos e onda de interpretação) está desligado nesta versão; a interpretação salva nos projetos é preservada.

## Desenvolvimento

```bash
npm install
npm run sidecar                                   # gregorio-lsp (requer Rust)
source ~/emsdk/emsdk_env.sh && npm run grammar    # WASM da gramática (requer Emscripten)
npm run tauri dev
```

Testes: `npm run test`.
Projeto de exemplo (`src/assets/example-project.json`, gerado de `samples/`): `npm run example`.

O `neume-db.json` é gerado das fontes do Gregorio:

```bash
pip install 'fonttools==4.59.0'   # uma vez
npm run neume                      # extrai glifos + gera o db (precisa do wasm: npm run grammar)
```

Licenças de terceiros (`THIRD-PARTY-LICENSES.md`, empacotado com o app): `node scripts/third-party-licenses.mjs <Cargo.toml do gregorio-lsp>` depois de mudar dependências.

## Créditos

Projeto da **AISCGre Brasil** (Associação Internacional de Estudos de Canto Gregoriano — Seção Brasileira).

- **Desenvolvimento:** Gabriel Honorato Teixeira Bernardo — AISCGre Brasil
- **Projetos utilizados:** Laércio Benedito Savali de Sousa — AISCGre Brasil; Giovanni Del Chiaro — AISCGre Brasil
- **Ideias e contribuições:** Danillo Del Chiaro — AISCGre Brasil

### Agradecimentos

Notker se apoia em projetos da comunidade, a quem agradecemos:

- [gregorio-lsp](https://github.com/aiscgre-br/gregorio-lsp) e [tree-sitter-gregorio](https://github.com/aiscgre-br/tree-sitter-gregorio) (AISCGre-BR, MIT) — análise, diagnósticos e realce.
- [Augustinus](https://github.com/aiscgre-br/Augustinus) e `nabc-lib` (MIT · ISC) — renderização da partitura.
- **The Gregorio Project** — fontes `gregall`/`grelaon` (GPLv3 com exceção de fonte, que permite embuti-las nos PDFs exportados), a referência *nabc language for gregorio* (`GregorioNabcRef`, `gregoriotex-nabc.lua`) e o exemplo *Factus est*.
- **Dom Eugène Cardine** — tabela neumática sinóptica (*Semiologia Gregoriana*), fonte dos nomes dos neumas.
- [Parchment Design](https://github.com/AISCGre-BR/parchment-design) (AISCGre-BR, MIT) — linguagem visual; tela inicial e criação guiada de projeto adaptadas do [Mocquereau](https://github.com/AISCGre-BR/mocquereau) (AISCGre-BR).
- [Tauri](https://tauri.app), [CodeMirror](https://codemirror.net), [tree-sitter](https://tree-sitter.github.io), [jsPDF](https://github.com/parallax/jsPDF) e [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT/Apache-2.0); ícones [Lucide](https://lucide.dev) (ISC); fontes [Source Sans 3](https://github.com/adobe-fonts/source-sans) e [Source Serif 4](https://github.com/adobe-fonts/source-serif) (Adobe, SIL OFL 1.1) via [@fontsource](https://fontsource.org).
- Projeto de exemplo: os `.gabc` de `samples/`, com as transcrições creditadas no cabeçalho de cada arquivo (Andrew Hinkley, Jakub Jelínek, Marek Klein).

Atribuições completas em [NOTICE.md](NOTICE.md); textos das licenças de todas as dependências empacotadas em [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

## Licença

GPL-3.0-only. Veja [LICENSE](LICENSE). Todas as dependências têm licenças compatíveis com a GPL-3.0 (MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0, Unicode-3.0, OFL-1.1 para fontes; fontes do Gregorio sob GPLv3 com exceção de fonte).
