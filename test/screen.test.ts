// test/screen.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { setScreen, getScreen } from "../src/app/screen";

describe("telas da janela", () => {
  it("setScreen/getScreen pelo data-screen do body; padrão = boas-vindas", () => {
    delete document.body.dataset.screen;
    expect(getScreen()).toBe("welcome");
    setScreen("guide");
    expect(document.body.dataset.screen).toBe("guide");
    expect(getScreen()).toBe("guide");
    setScreen("project");
    expect(getScreen()).toBe("project");
  });
  it("index.html: hosts pré-existentes das telas e o app nasce na tela inicial (vista Edição)", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toMatch(/<body data-view="edicao" data-screen="welcome">/);
    expect(html).toContain('id="welcome-host"');
    expect(html).toContain('id="guide-host"');
    // a vista Neumas fica DENTRO do #body-row: some junto com a mesa fora da tela "project"
    const row = html.indexOf('id="body-row"');
    expect(row).toBeGreaterThan(-1);
    expect(html.indexOf('id="neumas-view"')).toBeGreaterThan(row);
    expect(html.indexOf('id="neumas-view"')).toBeLessThan(html.indexOf('id="welcome-host"'));
  });
  it("notker.css: fora da mesa somem toolbar, onda, barra lateral, mesa, vista Neumas e painel de nomes", () => {
    const css = readFileSync("src/ui/notker.css", "utf8");
    for (const s of ["welcome", "guide"]) {
      for (const id of ["#toolbar", "#wave-bar-host", "#body-row", "#overlay-host"]) {
        expect(css).toContain(`body[data-screen="${s}"] ${id}`);
      }
      expect(css).toContain(`body[data-screen="${s}"] #${s}-host`);
    }
  });
});

describe("atalhos fora da mesa (main.ts)", () => {
  it("todo comando com atalho está preso à mesa, salvo Novo projeto, Abrir e Nomes (importar/exportar)", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const gate = main.slice(main.indexOf("gateCommands(commands, ["), main.indexOf('], () => screen === "project")'));
    expect(gate.length).toBeGreaterThan(0);
    // só linhas de código (as comentadas PLAYBACK-OFF não registram nada)
    const code = main.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const withKeys = [...code.matchAll(/\{ id: "([\w.]+)"[^\n]*\bkeys: \[/g)].map((m) => m[1]);
    expect(withKeys.length).toBeGreaterThan(15);
    expect(withKeys).toEqual(expect.arrayContaining(["view.edicao", "view.neumas", "neume.name", "neumas.search", "file.close"]));
    const free = new Set(["file.newProject", "file.open", "names.export", "names.import"]);
    const loose = withKeys.filter((id) => !free.has(id) && !gate.includes(`"${id}"`));
    expect(loose).toEqual([]);
  });
  it("playback continua desligado: o gate não cita comandos de áudio/onda", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const gate = main.slice(main.indexOf("gateCommands(commands, ["), main.indexOf('], () => screen === "project")'));
    for (const id of ["play.toggle", "play.mode", "wave.toggle", "wave.reset", "names.panel"]) expect(gate).not.toContain(`"${id}"`);
  });
});

describe("guia: Enter repetido não cria duas vezes", () => {
  it("onCreate que destrói o guia (como enterProject) é chamado uma vez só", async () => {
    const { mountNewProjectGuide } = await import("../src/app/new-project-guide");
    const host = document.createElement("section");
    document.body.appendChild(host);
    let calls = 0;
    const g = mountNewProjectGuide(host, {
      onCreate: () => { calls++; g.destroy(); },
      onCancel: () => {}, confirmDiscard: async () => true, pickGabc: async () => null,
    });
    const click = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    click("Continuar"); click("Continuar");
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Nome do canto"]')!;
    const enter = () => name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    enter(); enter();
    expect(calls).toBe(1);
    host.remove();
  });
  it("guide-host nasce com a classe notker-guide (o CSS do guia depende dela)", () => {
    expect(readFileSync("index.html", "utf8")).toMatch(/id="guide-host" class="notker-guide /);
  });
});
