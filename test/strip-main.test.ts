// Costura do "remover episemas e puncta mora" no main.ts (varredura de texto, como pdf-main.test.ts)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const main = readFileSync("src/main.ts", "utf8");

describe("main.ts: remover episemas e puncta mora", () => {
  it("comando no registro, com rótulo, sem atalho, só na mesa e na mesma vista do editor", () => {
    const line = main.split("\n").find((l) => l.includes('id: "edit.stripMarks"'))!;
    expect(line).toContain('label: "Remover episemas e puncta mora…"');
    expect(line).toContain("enabled: inEdit");
    expect(line).not.toContain("keys:");
    expect(main).toMatch(/gateCommands\(commands, \[[^\]]*"edit\.stripMarks"/);
  });
  it("menu Editar tem o item logo depois de Formatar", () => {
    expect(main).toContain('menuItem("edit.format"), menuItem("edit.stripMarks")');
  });
  it("colar e importar oferecem a remoção com guarda de canto/projeto", () => {
    expect(main).toContain("pasteMarksWatcher(");
    expect(main).toContain("O gabc colado tem episemas ou puncta mora.");
    expect(main).toContain("O gabc importado tem episemas ou puncta mora.");
    expect(main).toMatch(/if \(id === shownId && epoch === projectEpoch\) void runStrip/);
    expect(main).toContain("Não há episemas nem puncta mora aqui.");
  });
  it("preserva o comando Letras na pauta", () => {
    expect(main).toContain('id: "view.staffLetters"');
  });
});
