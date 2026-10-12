// Costura do "remover episemas e puncta mora" no main.ts (varredura de texto, como pdf-main.test.ts)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const main = readFileSync("src/main.ts", "utf8");

describe("main.ts: remover episemas e puncta mora", () => {
  it("comando no registro, com rótulo, sem atalho, só na mesa e na mesma vista do editor", () => {
    const line = main.split("\n").find((l) => l.includes('id: "edit.stripMarks"'))!;
    expect(line).toContain('label: t("cmd.edit.stripMarks")');
    expect(line).toContain("enabled: inEdit");
    expect(line).not.toContain("keys:");
    expect(main).toMatch(/gateCommands\(commands, \[[^\]]*"edit\.stripMarks"/);
  });
  it("menu Editar tem o item logo depois de Formatar", () => {
    expect(main).toContain('menuItem("edit.format"), menuItem("edit.stripMarks")');
  });
  it("colar e importar oferecem a remoção com guarda de canto/projeto", () => {
    expect(main).toContain("pasteMarksWatcher(");
    expect(main).toContain('t("strip.offer.pasted")');
    expect(main).toContain('t("strip.offer.imported")');
    expect(main).toMatch(/if \(id === shownId && epoch === projectEpoch\) void runStrip/);
    expect(main).toContain('t("strip.none")');
  });
  it("trecho colado que some durante o diálogo também avisa com o toast", () => {
    const after = main.slice(main.indexOf("await openStripDialog("));
    expect(after).toMatch(/^[\s\S]*?if \(scope === "pasted" && !area\(\)\) \{ toaster\.show\(t\("strip\.gone"\), \{ kind: "warn" \}\); return; \}/);
  });
  it("preserva o comando Letras na pauta", () => {
    expect(main).toContain('id: "view.staffLetters"');
  });
});
