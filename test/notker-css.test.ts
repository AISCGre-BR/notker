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
