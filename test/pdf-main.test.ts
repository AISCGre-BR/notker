// test/pdf-main.test.ts — costura do Exportar PDF no main.ts (varredura de texto, como screen.test.ts)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");
const code = main.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("Exportar PDF no app", () => {
  it("comando file.exportPdf com Ctrl+P, único dono do atalho, com enabled", () => {
    expect(code).toMatch(/\{ id: "file\.exportPdf", label: "Exportar PDF…", run: h\.exportPdf, keys: \["Ctrl\+P"\], enabled: canExportPdf \}/);
    expect(code.match(/"Ctrl\+P"/g)).toHaveLength(1);
  });
  it("preso à mesa (gateCommands) e no menu Arquivo depois dos .gabc", () => {
    const gate = main.slice(main.indexOf("gateCommands(commands, ["), main.indexOf('], () => screen === "project")'));
    expect(gate).toContain('"file.exportPdf"');
    const arquivo = main.slice(main.indexOf('label: "Arquivo"'), main.indexOf('label: "Editar"'));
    expect(arquivo).toContain('menuItem("file.exportAllGabc"), menuItem("file.exportPdf")');
  });
  it("jsPDF/svg2pdf só por import dinâmico (fora do pacote inicial)", () => {
    expect(code).not.toMatch(/^import .*(jspdf|svg2pdf|\.\/pdf\/(browser|export-pdf|jspdf-sink|render))/m);
    expect(code).toContain('import("./pdf/export-pdf")');
    expect(code).toContain('import("./pdf/browser")');
  });
  it("a miniatura da tela inicial usa a família do 1º canto", () => {
    expect(code).toMatch(/scoreThumbnail\(content, \{ family \}\)/);
    expect(code).toMatch(/thumbs\.changed\(path, content, family\)/);
    expect(code).toMatch(/thumbs\.remember\(path, content, family\)/);
  });
});

describe("Exportar PDF: robustez do comando", () => {
  it("2º Ctrl+P durante a geração avisa; captura e diálogo ficam dentro do try", () => {
    const body = code.slice(code.indexOf("exportPdf: async () => {"), code.indexOf("format: async () => {"));
    expect(body).toContain('if (exportingPdf) { toaster.show("Já há um PDF sendo gerado."');
    expect(body.indexOf("try {")).toBeLessThan(body.indexOf("captureEditorIntoProject()"));
    expect(body.indexOf("try {")).toBeLessThan(body.indexOf("await exportPdfDialog"));
  });
  it("progresso por peça no toast", () => {
    expect(code).toMatch(/onProgress: \(i, n\) => toaster\.show\(/);
  });
});
