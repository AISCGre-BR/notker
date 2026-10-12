// Varredura: nenhuma string de interface em pt-BR fixa em src/ (tudo passa por t()/tn()),
// e nenhum t()/tn() no nível de módulo (o texto congelaria no idioma do import).
// Heurística sobre o AST do TypeScript; exceções SÓ pela lista abaixo, cada uma justificada.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/** Arquivos fora da varredura (caminho relativo à raiz). */
const EXEMPT_FILES: Record<string, string> = {
  "src/i18n/pt-BR.ts": "dicionário-fonte",
  "src/i18n/en.ts": "dicionário",
  "src/i18n/it.ts": "dicionário",
  "src/neume/tables.ts": "nomes latinos de Cardine (não se traduzem)",
  "src/neume/decode.ts": "termos de BUSCA em pt (deslocado a direita…), nunca exibidos",
  "src/project/example-build.ts": "roda no build (npm run example); o projeto de exemplo é um documento",
  "src/overlay-ui/panel.ts": "código morto: painel substituído pela vista Neumas (não é montado)",
  "src/ui/wave-bar.ts": "código morto: PLAYBACK-OFF (barra da onda não é montada)",
  "src/preview/wave-lanes.ts": "PLAYBACK-OFF; só texto de console de depuração",
};

/** Literais permitidos (arquivo → textos exatos), com o motivo. */
const ALLOWED: Record<string, Record<string, string>> = {
  "src/app/close-sequence.ts": {
    "gravação em andamento": "nome de passo, só vai ao console",
    "alterações": "nome de passo, só vai ao console",
    "vista Neumas": "nome de passo, só vai ao console",
    "recuperação (parar)": "nome de passo, só vai ao console",
    "recuperação (apagar)": "nome de passo, só vai ao console",
  },
  "src/app/new-project-guide.ts": { "name: Puer natus est;\n%%\n(c4) Pu(g)er(h) ...": "placeholder de exemplo de código gabc (latim), não se traduz" },
  "src/app/commands.ts": { "comando desconhecido: ": "erro de programação (id inexistente), nunca exibido" },
  "src/app/recent.ts": { "recent.json não pôde ser lido; não será sobrescrito": "rejeição interna, só vai ao console" },
  "src/ui/toolbar.ts": { "Parar": "comparação do botão primário do playback (PLAYBACK-OFF), não é texto exibido" },
  "src/preview/nabc-lib.ts": { "[f3] desalinhamento sílaba↔span: índices distintos=${…} numeradas=${…}": "console de depuração" },
};

/** Texto com cara de interface (frase, rótulo capitalizado, rótulo com ":" ou "…"). A
 *  varredura é deliberadamente LARGA: tudo o que parece texto humano precisa vir de t()
 *  ou estar em KEEP (nomes próprios, latim, nomes de tecla). */
const PT_ACCENT = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/;
/** Identificador/valor interno (minúsculas, sem espaço, sem ":"): "todos", "sem-nome", "edicao". */
const INTERNAL_ID = /^[a-z][a-z0-9_.-]*$/;
/** Nomes de tecla e combinações (KeyboardEvent.key/code, atalhos do registro). */
const KEY_NAME = /^((Ctrl|Alt|Shift|Meta|Cmd|MacCtrl|Mod)[+-])*(Escape|Enter|Tab|Home|End|Delete|Del|Backspace|Space|ContextMenu|Arrow|Arrow(Up|Down|Left|Right)|F\d{1,2}|Key[A-Z]|Digit\d|[A-Z0-9])$|^(Ctrl|Alt|Shift|Meta|Cmd|MacCtrl)$/;
/** Textos que ficam iguais em qualquer idioma. */
const KEEP = new Set([
  "Notker", "Gregorio", "PDF", "A4", "St. Gall", "Laon", "Puer natus est", "Kyrie",
  "SourceSerif4", "Content-Length: ${…}\r\n\r\n${…}",
  "Português", "English", "Italiano", // nomes dos idiomas, sempre no próprio idioma (src/i18n/index.ts)
]);
/** Lista de classes CSS ("sc-btn sc-btn--filled") e seletores/valores CSS. */
const CSS_LIKE = /^[a-z][\w-]*( +[a-z][\w-]*)*$/;
const SELECTOR_LIKE = /^[.#&:\[]|[\[\]>]|:not\(|var\(|\dpx\b/;

function looksLikeUiText(text: string): boolean {
  const s = text.trim();
  if (!s || KEEP.has(s)) return false;
  if (PT_ACCENT.test(s)) return true;
  if (INTERNAL_ID.test(s) || KEY_NAME.test(s) || SELECTOR_LIKE.test(s)) return false;
  if (/^[A-Z][a-zà-ÿ]+[.!?]?$/.test(s)) return true;               // "Salvar", "Nota", "Glifo", "Exportado."
  const plain = s.replace(/\$\{…\}/g, "x0");
  if (CSS_LIKE.test(plain) && /-/.test(plain)) return false;
  if (/\s/.test(plain) && /[A-Za-z]{3,}/.test(plain) && !/[{};<>=]/.test(plain)) return true; // frase: "erro ao salvar", "salvo ✓"
  if (/[A-Za-z]{4,}\s*[:…]$/.test(s)) return true;                 // "partes:", "Abrir…" (não "seq:")
  return false;
}

/** Posições onde QUALQUER literal com letras é texto de interface (mesmo uma palavra minúscula
 *  sem acento): `title:`, `label:`, `body:`, `placeholder`, `aria-label`, `data-tip`, `textContent =`,
 *  `toaster.show(`, `setAttribute("title"|"aria-label"|"placeholder", …)`. */
const UI_PROPS = /^(title|label|body|placeholder|ariaLabel|aria-label|tip|textContent|innerText|confirm|cancel|heading|message)$/;
function inUiPosition(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if ((ts.isPropertyAssignment(p) && p.initializer === n) || (ts.isBinaryExpression(p) && p.right === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken)) {
    const name = ts.isPropertyAssignment(p) ? p.name.getText().replace(/^["']|["']$/g, "")
      : ts.isPropertyAccessExpression(p.left) ? p.left.name.text
      : ts.isElementAccessExpression(p.left) ? p.left.argumentExpression.getText().replace(/^["']|["']$/g, "") : "";
    return UI_PROPS.test(name) || name === "tip" /* dataset.tip */;
  }
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText();
    if (/(^|\.)toaster\.show$|(^|\.)toast$/.test(callee) && p.arguments[0] === n) return true;
    if (/\.setAttribute$/.test(callee) && p.arguments[1] === n && /^["'](title|aria-label|placeholder|data-tip)["']$/.test(p.arguments[0].getText())) return true;
  }
  return false;
}

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function isConsoleArg(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^console\.\w+$/.test(p.expression.getText())) return true;
    if (ts.isFunctionLike(p) || ts.isBlock(p)) return false;
  }
  return false;
}

function literalText(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => "${…}" + s.literal.text).join("");
  return null;
}

interface Hit { file: string; line: number; text: string }

function scan(): { strings: Hit[]; topLevelT: Hit[] } {
  const strings: Hit[] = [];
  const topLevelT: Hit[] = [];
  for (const abs of srcFiles(SRC)) {
    const file = relative(ROOT, abs).split("\\").join("/");
    if (EXEMPT_FILES[file] && !file.startsWith("src/i18n/")) continue;
    const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const visit = (n: ts.Node, inFn: boolean): void => {
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isLiteralTypeNode(n)) return;
      if (!inFn && !file.startsWith("src/i18n/") && ts.isCallExpression(n) && ts.isIdentifier(n.expression)
        && (n.expression.text === "t" || n.expression.text === "tn")) {
        topLevelT.push({ file, line: lineOf(n), text: n.getText(sf).slice(0, 60) });
      }
      const text = EXEMPT_FILES[file] ? null : literalText(n);
      const forced = text !== null && /[A-Za-zÀ-ÿ]{2,}/.test(text) && !KEEP.has(text.trim()) && inUiPosition(n);
      if (text !== null && !isConsoleArg(n) && (looksLikeUiText(text) || forced) && !ALLOWED[file]?.[text]) {
        strings.push({ file, line: lineOf(n), text });
      }
      if (ts.isTemplateExpression(n)) { n.templateSpans.forEach((s) => visit(s.expression, inFn)); return; }
      ts.forEachChild(n, (c) => visit(c, inFn || ts.isFunctionLike(n)));
    };
    visit(sf, false);
  }
  return { strings, topLevelT };
}

describe("varredura de i18n", () => {
  const { strings, topLevelT } = scan();
  const fmt = (h: Hit[]) => h.map((x) => `${x.file}:${x.line}  ${JSON.stringify(x.text)}`).join("\n");

  it("nenhuma string de interface em pt-BR fixa em src/ (use t()/tn() de src/i18n)", () => {
    expect(strings, "\n" + fmt(strings)).toEqual([]);
  });

  it("nenhum t()/tn() no nível de módulo", () => {
    expect(topLevelT, "\n" + fmt(topLevelT)).toEqual([]);
  });

  it("comentários não citam t(\"chave\") (um sed trocou o texto do comentário por chave)", () => {
    const bad: string[] = [];
    for (const abs of srcFiles(SRC)) {
      const file = relative(ROOT, abs).split("\\").join("/");
      if (file.startsWith("src/i18n/")) continue;
      readFileSync(abs, "utf8").split("\n").forEach((l, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(l) && /\bt[n]?\(["`]/.test(l)) bad.push(`${file}:${i + 1}  ${l.trim()}`);
      });
    }
    expect(bad, "\n" + bad.join("\n")).toEqual([]);
  });

  it("index.html não fixa rótulos em português (os landmarks recebem t() no boot)", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).filter(looksLikeUiText);
    expect(labels).toEqual([]);
  });

  it("a heurística pega os casos típicos e deixa passar ids internos", () => {
    for (const s of ["Salvar", "Novo canto…", "partes:", "composto:", "mostrando ${…} de ${…}", "erro ao salvar", "Família", "Glifo", "Duplicar", "salvo ✓"]) expect(looksLikeUiText(s), s).toBe(true);
    for (const s of ["todos", "sem-nome", "edicao", "St. Gall", "Laon", "Puer natus est", "Ctrl+Shift+S", "Alt-ArrowUp", "ArrowDown", "Escape", "sc-btn", "seq:", "g.ChantLine"]) expect(looksLikeUiText(s), s).toBe(false);
  });
});
