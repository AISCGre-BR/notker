# Notker F2 — Busca de neumas + hover/completion (assistências) — Design

- **Data:** 2026-06-01
- **Status:** aprovado para planejamento (brainstorming concluído)
- **Milestone:** `0.0.2-alpha`, fase **F2**
- **Licença:** GPL-3.0
- **Pré-requisito:** F1 (casca do editor) completa e pushada.
- **Spec-pai:** `specs/2026-06-01-notker-editor-design.md` (§4 paleta de busca, §4.1 hover/completion no frontend).

> Esta fase entrega as **assistências inteligentes** do editor: busca de neumas com
> miniatura, inserção no cursor, hover semiológico e completion — tudo no frontend
> sobre um `neume-db` gerado das fontes do Gregorio. Inclui ainda auxílios para
> **usuários iniciantes em GABC** (hover de elementos gabc + régua de altura na pauta).

## 1. Objetivo e não-objetivos

**Objetivo.** Tornar a escrita de GABC+NABC acessível e rápida: encontrar e inserir
neumas por nome (sem decorar a sintaxe NABC), entender o que está sob o cursor (hover),
receber sugestões em contexto (completion) e — para iniciantes — visualizar qual letra
GABC corresponde a qual altura na pauta.

**Não-objetivos (nesta fase).**

- Preview ao vivo da partitura — é a **F3** (`PreviewEngine::NabcLib`).
- UI rica de gestão/curadoria de nomes (painel dedicado, resolução visual de conflitos,
  promoção-a-padrão pela interface) — fica para fase futura. F2 entrega **modelo + import/export**.
- Mexer no `gregorio-lsp` (hover/completion do servidor continuam stub/placeholder; nós
  implementamos no frontend, conforme §4.1 do spec-pai).
- Playback semiológico — milestone futuro.

## 2. Decisões fechadas (brainstorming 2026-06-01)

| # | Eixo | Decisão |
|---|------|---------|
| D1 | Cobertura do catálogo | **Total**: todos os ~604 glifos `gregall` (St. Gall) + ~573 `grelaon` (Laon). Busca pode legitimamente devolver as N variantes de um mesmo neuma; usar nomenclatura específica quando existir. |
| D2 | Geração das miniaturas | **Extrair contornos da fonte no build** (gregall.ttf/grelaon.ttf → SVG path por glifo). Canônico, isolado, sem runtime TeX. (Rejeitados: nabc-lib — renderiza partituras, não enumera glifos isolados, nem está instalado; Gregorio+LuaTeX — pesado demais p/ 1170 glifos.) |
| D3 | Formato do db | **JSON único auto-contido** com SVG path **inline** + metadados. (Rejeitados: índice + N arquivos SVG; SQLite — over-engineering.) |
| D4 | Decodificação | **No build ("assada" no JSON)**: o gerador grava `name`/`nabc`/`terms`/`meaning`. Runtime só carrega e busca. |
| D5 | Origem dos nomes | **Referência oficial**, não inventados: `GregorioNabcRef` (código→nome) + `gregoriotex-nabc.lua` (gramática) + letras significativas de Cardine. Tabelas já portadas no `notker-LEGACY`. |
| D6 | Nomes do usuário | **Overlay editável + import/export compartilhável.** F2 entrega modelo + merge + comandos de import/export + adicionar nome simples. Promoção-a-padrão = processo manual no repo. |
| D7 | Adendos p/ iniciantes | **Hover também em GABC** (tipo/posição/solfejo dada a clave) + **régua de altura na pauta** (toggle, ciente da clave). |

## 3. Fundamentos técnicos (verificados em disco, 2026-06-01)

- **As fontes existem e são endereçáveis por nome.** `gregall.ttf` expõe **604 glifos
  nomeados** no `post` table (`cl`, `clB`, `pf`, `poT`, `clEpilsc1lst3`…). Lê-se o contorno
  por nome com `fonttools` (confirmado) ou um lib Node equivalente — **sem precisar do `.sfd`**.
- **A "string NABC" é uma transformação mecânica documentada.** `gregoriotex-nabc.lua:89`:
  ```lua
  local name = key:gsub("B", ">"):gsub("N", "-"):gsub("E", "!"):gsub("T", "~")
  ```
  Logo `nabc = gsub(nome_do_glifo, B→> N→- E→! T→~)`. Nada é digitado à mão.
- **Os nomes vêm da referência.** `GregorioNabcRef.tex` traz a tabela código→nome literal
  (`vi`=virga, `pu`=punctum, `cl`=clivis, `pe`=pes, `po`=porrectus, `to`=torculus,
  `sc`=scandicus, `pf`=porrectus flexus…) e documenta modificadores (`cl>`=ancus, subpuncta,
  letras significativas).
- **O `notker-LEGACY` já portou as tabelas** (`render/native/nabc/tables.rs`):
  `GREGALL_NEUME_KINDS` (32 códigos-base), `GREGALL_ALIASES` (44 aliases), conjuntos de
  letras significativas — fonte de verdade reaproveitável para o port em TS.
- **Licença das fontes:** `gregall`/`grelaon` são **GPLv3 com exceção de fonte** — compatível
  com o produto GPL-3. Vendorizar é permitido; creditar no README.
- **Rede de segurança:** o app já embute o parser (tree-sitter-gregorio WASM da F1).
  O gerador carrega esse WASM no Node e **valida cada `nabc` por parse** — só entram no JSON
  snippets que o parser aceita. `web-tree-sitter` roda em Node.

## 4. Arquitetura

```
BUILD (scripts/build-neume-db.mjs)
  src/assets/fonts/gregall.ttf  ─┐
  src/assets/fonts/grelaon.ttf  ─┤
  src/neume/tables.ts (port)    ─┼─► gerador ──► src/assets/neume-db.json
  src/neume/decode.ts           ─┤        │        (~1170 entradas; gitignored + buildado,
  src/neume/base-annotations.json┘        │         como o .wasm da F1)
                                          └─ valida cada nabc com tree-sitter WASM

RUNTIME
  neume-db.json ──► db.ts ─┐
  overlay (app-data)──► overlay.ts ─┴─► db efetivo ─► search.ts ─► { palette, completion }
                                              └────────────────► hover-nabc.ts
  src/editor/context.ts  (parse tree-sitter da F1)  ── usado por palette/hover/completion
  src/gabc/{gabc-pitch, hover-gabc, staff-legend}.ts ── auxílios GABC p/ iniciantes
```

Toda a inteligência continua **no frontend**; o `gregorio-lsp` não é tocado. As extensões
são montadas por `src/neume/index.ts` (e `src/gabc/index.ts`) e injetadas no `main.ts`.

**Fronteiras:** `neume/` e `gabc/` conhecem CM6 e o parse tree-sitter; falam Tauri `fs`/`dialog`
apenas para import/export do overlay; **não** conhecem o LSP nem `src-tauri`.

## 5. Componentes

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `scripts/build-neume-db.mjs` | Lê as 2 fontes, extrai contorno→SVG path+viewBox por glifo, decodifica, valida `nabc` por parse, emite `neume-db.json` | font-parser pinado, `tables`, `decode`, `base-annotations`, tree-sitter WASM |
| `src/neume/tables.ts` | Tabelas NABC portadas do `gregoriotex-nabc.lua` (32 kinds, 44 aliases, modificadores, letras significativas) | — (dados puros) |
| `src/neume/decode.ts` | `code → {base,name,qualifiers,letters,nabc,terms,meaning}` (pura) | `tables.ts` |
| `src/neume/base-annotations.json` | Nomes/sentido canônicos curados (semente; alvo da "promoção-a-padrão") | — |
| `src/assets/neume-db.json` | Asset gerado (base assada). Gitignored + buildado | (gerado) |
| `src/neume/db.ts` | Carrega/tipa o JSON; expõe db-base | `neume-db.json` |
| `src/neume/overlay.ts` | Overlay do usuário: load/save (app-data), `merge(base,overlay)`, import/export portátil | `plugin-fs`, `plugin-dialog` |
| `src/neume/search.ts` | Índice em memória + busca fuzzy (nome exato > prefixo > fuzzy; overlay primeiro) | `db`, `overlay` |
| `src/editor/context.ts` | Dado estado+posição, usa o parse tree-sitter p/ saber: em campo NABC? range do token? nota/clave/divisio? clave ativa? | parse da F1 |
| `src/neume/palette.ts` | Overlay command-palette (Ctrl+Space, reconfigurável): busca, lista c/ miniatura+nome+family+qualifiers, inserção sensível ao contexto, "adicionar nome" | `search`, `context`, CM6 |
| `src/neume/hover-nabc.ts` | `hoverTooltip` sobre token NABC: miniatura+nome(s)+family+qualifiers+sentido | `context`, `db`, `overlay` |
| `src/neume/completion.ts` | Autocomplete CM6 ativo só em contexto NABC; aplica a string NABC | `search`, `context` |
| `src/gabc/gabc-pitch.ts` | Letra→posição na pauta + solfejo/nome dada a clave (c1–c4, f1–f4); determinístico | — |
| `src/gabc/hover-gabc.ts` | `hoverTooltip` sobre nota/clave/divisio gabc: tipo, posição, solfejo, sinais rítmicos | `context`, `gabc-pitch` |
| `src/gabc/staff-legend.ts` | Régua da pauta (toggle): 4 linhas + letras na altura, ciente da clave ativa no cursor | `gabc-pitch`, `context` |
| `src/neume/index.ts`, `src/gabc/index.ts` | Montam as extensões e expõem `neumeExtensions()` / `gabcAssistExtensions()` p/ o `main.ts` | acima |

Vendor: `gregall.ttf` + `grelaon.ttf` em `src/assets/fonts/` (GPLv3 c/ exceção de fonte; crédito no README).

## 6. Formato de dados

### 6.1 `neume-db.json` (gerado)

```jsonc
{
  "schema": 1,
  "generatedFrom": { "gregall": "<sha256 ttf>", "grelaon": "<sha256 ttf>", "tables": "nabc-v6.2.0" },
  "entries": [
    {
      "id": "stgall:clEpilsc1lst3",   // family:code — chave única e estável
      "family": "stgall",             // "stgall" (gregall) | "laon" (grelaon)
      "code": "clEpilsc1lst3",        // nome cru do glifo na fonte (forma codificada)
      "nabc": "cl!pilsc1lst3",        // = gsub(code, B→> N→- E→! T→~); VALIDADO pelo parser no build
      "base": "cl",                   // código-base de 2 letras (∈ GREGALL_NEUME_KINDS)
      "name": "clivis",               // nome canônico latino (GregorioNabcRef)
      "qualifiers": ["episema"],      // modificadores decodificados (best-effort; desconhecido → código cru)
      "letters": ["c", "t"],          // letras significativas presentes (Cardine)
      "terms": ["clivis","flexa","clé","cl","clEpilsc1lst3"], // busca: latim+PT+código+aliases
      "meaning": "Clivis: duas notas, a 2ª mais grave…",      // nota semiológica (base + letras)
      "svg": { "path": "M…Z", "viewBox": "0 0 240 380", "advance": 260 }
    }
    // … ~1170 entradas
  ]
}
```

Regras de geração:
- `terms` **sempre** inclui o código cru e o nome-base → nada fica "não-encontrável".
- Modificador desconhecido → entra em `qualifiers`/`terms` como **código bruto** (nunca escondido).
- `nabc`: se o glifo é alvo de alias, expor também a **chave de alias** (forma que o usuário digita) em `terms`.
- Toda entrada tem `nabc` que **passa pelo parser** no build, senão a build falha (ou marca a entrada e loga — decidir no plano).

### 6.2 Overlay do usuário (editável; mesmo schema do arquivo de export/share)

```jsonc
{
  "schema": 1,
  "kind": "notker-neume-overlay",
  "entries": {
    "stgall:clEpilsc1lst3": {
      "names": ["clívis com episema longo"],  // nomes/apelidos (entram na busca; 1º no hover)
      "note": "uso típico em…",                 // nota pessoal opcional
      "hidden": false                            // ocultar da paleta (opcional)
    }
  }
}
```

- **Merge:** `efetivo = base` + por id: `names` (prepend aos `terms`, exibidos 1º), `note`
  (anexa ao `meaning`), `hidden`.
- **Import/export:** export grava `*.notker-neumes.json` via `plugin-dialog`+`plugin-fs`;
  import mescla com estratégia de conflito **não-destrutiva** (mantém ambos os nomes).
- **Promoção-a-padrão:** copiar entradas curadas do overlay para `base-annotations.json`
  (PR manual); o gerador reincorpora na próxima build.

## 7. Comportamentos de UX

- **Paleta** (Ctrl+Space, reconfigurável): input fuzzy → lista com miniatura SVG + nome
  canônico + badge de family + qualifiers; setas navegam, Enter insere. **Inserção sensível
  ao contexto:** dentro de campo NABC insere o token; em nota sem NABC insere `|<token>`;
  fora de nota insere `(|<token>)`. Tecla dedicada na entrada selecionada → "adicionar nome"
  (grava no overlay e atualiza a busca na hora).
- **Hover NABC:** token NABC → miniatura + nome(s) (overlay 1º) + family + qualifiers +
  sentido. Token desconhecido → tooltip discreto com o código cru.
- **Completion NABC:** ativo só em contexto NABC; sugere por prefixo/fuzzy (código+nome),
  cada item com miniatura; aceitar aplica a string NABC.
- **Hover GABC:** nota/clave/divisio → tipo do elemento, posição na pauta, **solfejo/nome
  dada a clave ativa**, e sinais rítmicos.
- **Régua da pauta (toggle):** faixa dispensável com pauta de 4 linhas e as letras (`a`–`m`…)
  na sua altura, **ciente da clave** ativa no cursor (clave mais próxima à esquerda; sem
  clave → `c4`). Atualiza ao mover o cursor entre claves diferentes.

## 8. Testes (TDD)

- `decode.ts`: código→{nome,nabc,qualifiers} contra exemplos da `GregorioNabcRef`.
- Gerador (smoke, espelha o legacy): ≥1170 entradas; kinds-base presentes; todo `svg.path`
  não-vazio; **todo `nabc` faz parse sem erro** (tree-sitter WASM no Node).
- `overlay.ts`: merge base⋈overlay; round-trip import/export; conflito não-destrutivo.
- `search.ts`: ranking (exato > prefixo > fuzzy; overlay 1º).
- `context.ts`: fixtures gabc/nabc (reusa corpus 250+29 do tree-sitter-gregorio/gregorio-lsp)
  — detecta campo NABC, range do token, nota/clave/divisio, clave ativa.
- `gabc-pitch.ts`: letra→solfejo correto por clave (c1–c4, f1–f4).
- UI (palette/hover/legend): inserção sensível ao contexto; toggle da régua; hover render.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Cauda longa de modificadores mal decodificada | Fallback: termo/qualifier com código cru; nada some. Nome-base sempre resolve via 32-kinds + aliases. |
| `nabc` inserido inválido | Validação por **parse no build** (rede de segurança forte). |
| Rastreio de clave p/ pitch gabc | Clave mais próxima à esquerda; trata troca de clave; default `c4`. |
| Toolchain de parse de fonte no build | `fonttools` confirmado (604 glifos). Recomendado: lib Node pinado p/ unidade de linguagem; `fonttools` como fallback provado. Decidir no plano. |
| Peso do `neume-db.json` (~1–3MB) | Aceitável; lazy-load no 1º uso de paleta/hover. |
| Licença das fontes | GPLv3 c/ exceção — compatível; creditar. |

## 10. Pinagem de dependências (política §7.1 do spec-pai)

- Lib de parse de fonte (se Node): pinar versão estável **≥1 mês** (≤2026-05-01); avisar se só houver recente.
- `fonttools` (se usado no build): pinar versão; documentar no script/README.
- Tabelas NABC: derivadas do `gregoriotex-nabc.lua` **v6.2.0** (alinhado ao pin do tree-sitter/LSP da F1).
- Fontes vendorizadas: registrar versão/sha256 no commit de adoção.

## 11. Ordem de implementação (tasks TDD)

0. Vendor fontes + `tables.ts` (port) + `decode.ts` + `build-neume-db.mjs` → `neume-db.json` (smoke).
1. `db.ts` (loader + tipos).
2. `overlay.ts` (load/save/merge/import/export).
3. `search.ts` (índice + fuzzy + ranking).
4. `editor/context.ts` (detecção via tree-sitter).
5. `palette.ts` (UI + inserção sensível ao contexto + adicionar nome).
6. `hover-nabc.ts`.
7. `completion.ts`.
8. `gabc/gabc-pitch.ts` + `gabc/hover-gabc.ts`.
9. `gabc/staff-legend.ts` (toggle).
10. Wire no `main.ts` + E2E manual + README/créditos (fontes) + push (ambos os repos).

## 12. Créditos a registrar (README)

- `gregall`/`grelaon` (fontes) e `GregorioNabcRef`/`gregoriotex-nabc.lua` — **The Gregorio
  Project** (GPLv3 c/ exceção de fonte).
- Tabela semiológica / letras significativas — **Dom Eugène Cardine**.
- Tabelas NABC portadas — base do `notker-LEGACY` (derivado do Gregorio v6.2.0).
- Bibliotecas-base do ecossistema — Laércio e gigio (AISCGre-BR).
