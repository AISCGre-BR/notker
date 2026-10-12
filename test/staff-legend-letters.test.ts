// test/staff-legend-letters.test.ts — Task 4: botão liga/desliga das letras no painel da
// régua e costura do comando `view.staffLetters` no main.ts.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { legendVisible, toggleLegend, setLegendLetters } from "../src/gabc/staff-legend";

describe("painel da régua: botão Letras na pauta", () => {
  let view: EditorView | null = null;
  afterEach(() => { view?.destroy(); view = null; document.body.innerHTML = ""; });

  it("mostra o estado (aria-pressed), alterna pelo hook e acompanha mudanças externas", () => {
    let on = false;
    let calls = 0;
    setLegendLetters({ on: () => on, toggle: () => { calls++; on = !on; } });
    view = new EditorView({ state: EditorState.create({ doc: "(c4) A(g)", extensions: [legendVisible] }), parent: document.body });
    view.dispatch({ effects: toggleLegend.of(true) });
    const btn = document.querySelector<HTMLButtonElement>(".staff-legend button.legend-letters")!;
    expect(btn).not.toBeNull();
    expect(btn.type).toBe("button");
    expect(btn.classList.contains("sc-btn")).toBe(true);
    expect(btn.textContent).toBe("Letras na pauta");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    btn.click();
    expect(calls).toBe(1);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    // o MESMO nó sobrevive às atualizações do painel (não perde o foco a cada tecla)
    view.dispatch({ changes: { from: 0, insert: " " } });
    expect(document.querySelector(".staff-legend button.legend-letters")).toBe(btn);
    on = false; // desligado por fora (menu Exibir) → o painel reflete na próxima atualização
    view.dispatch({});
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("depois do clique, o foco volta ao editor", () => {
    setLegendLetters({ on: () => false, toggle: () => {} });
    view = new EditorView({ state: EditorState.create({ doc: "(c4) A(g)", extensions: [legendVisible] }), parent: document.body });
    view.dispatch({ effects: toggleLegend.of(true) });
    const btn = document.querySelector<HTMLButtonElement>(".staff-legend button.legend-letters")!;
    btn.focus();
    btn.click();
    expect(view.hasFocus).toBe(true);
  });
});

describe("main.ts: comando view.staffLetters", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const code = main.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  it("registrado com rótulo, checked e desligado por padrão", () => {
    expect(code).toMatch(/\{ id: "view\.staffLetters", label: t\("cmd\.view\.staffLetters"\),[^\n]*checked: \(\) => staffLettersOn/);
    expect(code).toMatch(/let staffLettersOn = false;/);
  });
  it("no menu Exibir logo abaixo de Régua da pauta, e preso à mesa (gateCommands)", () => {
    expect(code).toMatch(/menuItem\("view\.legend"\), menuItem\("view\.staffLetters"\)/);
    const gate = /gateCommands\(commands, \[([\s\S]*?)\], \(\) => screen === "project"\)/.exec(code)!;
    expect(gate[1]).toContain('"view.staffLetters"');
  });
  it("redesenha a cada render da partitura da mesa e liga o hook do painel da régua", () => {
    expect(code).toMatch(/panel\.onRender\(/);
    expect(code).toContain("setLegendLetters(");
  });
});

describe("letras na pauta nunca no PDF nem na miniatura", () => {
  it("src/pdf/* e thumbnail.ts não usam o overlay nem o DOM do #preview", () => {
    const files = readdirSync("src/pdf").filter((f) => f.endsWith(".ts")).map((f) => "src/pdf/" + f);
    files.push("src/app/thumbnail.ts");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/staff-letters|drawStaffLetters|#preview|svgEl\(/);
    }
  });
});
