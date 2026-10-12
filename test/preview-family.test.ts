// test/preview-family.test.ts — a partitura da mesa desenha o nabc na família do canto
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const seen: { nabcMode?: string; lineWidthPx?: number }[] = [];
vi.mock("@testneumz/nabc-lib", () => {
  class ChantContext { nabcMode = "gall"; lineWidthPx = 800; constructor() { seen.push(this); } }
  class GregorioScore { constructor(_c: unknown) {} interprete() { return { lexErrors: [], parseErrors: [] }; } determineElements() {} }
  class GregorianChantSVGRenderer {
    constructor(private host: HTMLElement) {}
    renderSvg() { this.host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'; }
  }
  return { ChantContext, GregorioScore, GregorianChantSVGRenderer };
});
vi.mock("../src/preview/nabc-fonts", () => ({ ensureChantFonts: async () => {} }));
vi.mock("../src/preview/note-anchors", () => ({ extractNoteAnchors: () => [], rootOffset: () => ({ x: 0, y: 0 }) }));

import { NabcLibEngine } from "../src/preview/nabc-lib";
import { createPreviewPanel } from "../src/preview/panel";
import { FakeEngine, type RenderOptions } from "../src/preview/engine";
import type { Family } from "../src/neume/types";

describe("família na partitura", () => {
  it("NabcLibEngine: laon → nabcMode laon; stgall → gall; sem família, o padrão da lib", async () => {
    seen.length = 0;
    const eng = new NabcLibEngine();
    await eng.render("(c4) a(f|un)", { family: "laon" });
    await eng.render("(c4) a(f|vi)", { family: "stgall" });
    await eng.render("(c4) a(f|vi)");
    expect(seen.map((c) => c.nabcMode)).toEqual(["laon", "gall", "gall"]);
  });
  it("painel lê a família NA HORA do render (troca de família re-renderiza com a nova)", async () => {
    vi.useFakeTimers();
    const eng = new FakeEngine();
    const calls: (RenderOptions | undefined)[] = [];
    const orig = eng.render.bind(eng);
    eng.render = async (doc: string, o?: RenderOptions) => { calls.push(o); return orig(doc); };
    let fam: Family = "stgall";
    const panel = createPreviewPanel(document.createElement("div"), eng, { debounceMs: 10, family: () => fam });
    panel.update("(c4) a(f)");
    await vi.advanceTimersByTimeAsync(10);
    fam = "laon";
    panel.update("(c4) a(f)");
    await vi.advanceTimersByTimeAsync(10);
    expect(calls.map((o) => o?.family)).toEqual(["stgall", "laon"]);
    vi.useRealTimers();
  });
  it("main.ts: o painel lê a família do canto ativo e é redesenhado ao trocá-la", () => {
    const code = readFileSync("src/main.ts", "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).toContain("createPreviewPanel(previewHost, engine, { debounceMs: 150, family: currentFamily })");
    // Ctrl+Shift+G (toggleFamily) e o menu de contexto da árvore (onSetFamily do ativo),
    // + Letras na pauta (o gutter muda a largura útil do #preview → re-render)
    expect(code.match(/panel\?\.update\(view\.state\.doc\.toString\(\)\)/g)).toHaveLength(3);
  });
});
