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
  it("nenhum title/body/toast literal em pt (inclui frases que começam com 'O ', 'A ', 'É ')", () => {
    expect(code).not.toMatch(/\b(?:title|body|label): "[A-ZÀ-Ý][a-zà-ÿ]*[ …]/);
    expect(code).not.toMatch(/\b(?:title|body): "[A-ZÀ-Ý]/);
    expect(code).not.toMatch(/toaster\.show\("[A-ZÀ-Ý]/);
    expect(code).not.toMatch(/toaster\.show\(`[A-ZÀ-Ý]/);
  });
  it("t() do i18n não é sombreado por parâmetro", () => {
    expect(code).not.toMatch(/\(t: \{/);
  });
  it("Exibir ▸ Idioma: submenu com os três idiomas, troca pela guarda do fechar e reabre depois da recarga", () => {
    const exibir = code.slice(code.indexOf('label: t("menu.view")'), code.indexOf('label: t("menu.help")'));
    expect(exibir).toContain('label: t("menu.language"), submenu: languageMenu');
    expect(code).toMatch(/LOCALES\.map\(\(l\)[^\n]*LOCALE_NAMES\[l\][^\n]*lang: l[^\n]*checked: getLocale\(\) === l/);
    expect(code).toContain("switchLocale(");
    expect(code).toContain("runCloseSequence(closeDeps())");
    expect(code).toContain("location.reload()");
    expect(code).toMatch(/const re = takeReopen\(\)/);
    expect(code).toContain("unlistenClose = u");
    expect(code).toContain("unlistenClose?.()");
  });
});
