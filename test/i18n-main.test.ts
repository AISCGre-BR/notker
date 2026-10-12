// Costura do idioma no main.ts e no index.html (varredura de texto, como pdf-main.test.ts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const main = readFileSync("src/main.ts", "utf8");
const code = main.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const html = readFileSync("index.html", "utf8");

describe("main.ts: idioma", () => {
  it("initLocale() é a 1ª coisa do boot (antes do toaster e de qualquer texto)", () => {
    const boot = code.slice(code.indexOf("async function boot()"));
    expect(boot.indexOf("initLocale()")).toBeGreaterThan(-1);
    expect(boot.indexOf("initLocale()")).toBeLessThan(boot.indexOf("createToaster("));
  });
  it("landmarks: index.html sem rótulos fixos; o boot os põe por t()", () => {
    expect(html).not.toMatch(/aria-label="(Cantos|Neumas|Início|Novo projeto)"/);
    for (const k of ["landmark.chants", "landmark.neumes", "landmark.home", "landmark.newProject"]) expect(code).toContain(`"${k}"`);
  });
  it("comandos e menus pelo dicionário", () => {
    expect(code).toContain('{ id: "file.save", label: t("cmd.file.save")');
    expect(code).toContain('label: t("menu.file")');
    expect(code).toContain('label: t("menu.openRecent")');
    expect(code).not.toMatch(/label: "[A-ZÀ-Ý][a-zà-ÿ]/); // nenhum rótulo literal em pt
  });
});
