import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("src/ui/notker.css", "utf8");
const main = readFileSync("src/main.ts", "utf8");

describe("fundação Parchment", () => {
  it("index.html não depende de fontes remotas", () => {
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
  it("hosts pré-existentes da janela estão no index.html", () => {
    for (const id of ["menubar", "toolbar", "workspace", "doc-list", "app", "preview", "overlay-host", "dialog-host", "toast-host", "tooltip-host"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).not.toContain('id="footer-bar"');
    expect(html).toMatch(/id="workspace"[^>]*class="[^"]*sc-workspace/);
  });
  it("main.ts importa parchment, componentes, fontes e notker.css (nesta ordem)", () => {
    const order = [
      'import "parchment-design/parchment.css"',
      'import "parchment-design/components.css"',
      'import "@fontsource-variable/source-sans-3"',
      'import "@fontsource-variable/source-serif-4"',
      'import "./ui/notker.css"',
    ].map((s) => main.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(existsSync("src/ui/tokens.css")).toBe(false);
  });
  it("partitura é folha branca nos dois temas e notker.css não redefine tokens do Parchment", () => {
    expect(css).toMatch(/#preview svg\s*{[^}]*background:\s*#ffffff/);
    for (const t of ["--ink:", "--rubric:", "--parchment:", "--surface:"]) expect(css).not.toContain(t);
  });
});

describe("achados da revisão final (beta 1a)", () => {
  const theme = readFileSync("src/editor/theme.ts", "utf8");
  const gabcIndex = readFileSync("src/gabc/index.ts", "utf8");
  const menubarSrc = readFileSync("src/ui/menubar.ts", "utf8");
  const readme = readFileSync("README.md", "utf8");
  const probe = readFileSync("debug/ui-probe.html", "utf8");
  it("seleção do editor usa --notker-selection (forte), com valor claro e escuro", () => {
    expect(theme).toMatch(/cm-selectionBackground[^}]*--notker-selection/s);
    expect(theme).not.toMatch(/cm-selectionBackground[^}]*--rubric-wash/s);
    expect(css).toMatch(/--notker-selection:\s*color-mix\(in srgb, var\(--rubric\) 18%/);
    expect(css).toMatch(/\[data-theme="dark"\][^}]*--notker-selection:/);
  });
  it("Ctrl+Alt+L não é consumido pelo CodeMirror (só o registro de atalhos)", () => {
    expect(gabcIndex).not.toContain("legendKeymap");
  });
  it("toggleFamily re-renderiza a lista de cantos", () => {
    expect(main).toMatch(/function toggleFamily\(\): void \{[^}]*applyTree\(/);
  });
  it("Excluir canto oferece Desfazer; clicar no canto ativo é no-op", () => {
    expect(main).toMatch(/onRemove:[\s\S]*?"Desfazer"/);
    expect(main).toMatch(/function switchToChant\(id: string\): void \{\s*if \(id === project\.activeId\) return;/);
  });
  it("nome duplicado avisa em vez de sucesso", () => {
    expect(main).toContain("Esse nome já existe.");
  });
  it("menubar: comando com catch", () => {
    expect(menubarSrc).toMatch(/commands\.run\(item\.cmd\)\.catch/);
  });
  it("README cita F2/Ctrl+K, não Ctrl+Space", () => {
    expect(readme).not.toContain("`Ctrl+Space` busca");
    expect(readme).toContain("F2 ou Ctrl+K");
  });
  it("css sem .gabc-tooltip duplicado nem comentário obsoleto; probe usa --parchment", () => {
    expect((css.match(/^\.gabc-tooltip \{/gm) ?? []).length).toBe(1);
    expect(css).not.toContain("preview é cream-deep");
    expect(probe).not.toContain("--cream");
  });
});

