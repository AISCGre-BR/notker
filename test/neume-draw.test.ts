// test/neume-draw.test.ts — desenho grande (bancada): ordem de fallback e cache
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createNeumeDrawer } from "../src/neume/draw";
import { looksLikePlaceholder, finishNabcOnlySvg } from "../src/preview/nabc-only";
import type { GlyphSvg, Family } from "../src/neume/types";

const NS = "http://www.w3.org/2000/svg";
const g = (d: string): GlyphSvg => ({ path: d, viewBox: "0 0 10 10", advance: 10 });
const glyphs: Record<string, GlyphSvg> = { "stgall:pe": g("Mpe"), "stgall:vi": g("Mvi"), "stgall:cl!po": g("Mclpo") };
const glyphOf = (f: Family, n: string) => glyphs[`${f}:${n}`];
const engineSvg = () => {
  const s = document.createElementNS(NS, "svg") as SVGSVGElement;
  s.setAttribute("viewBox", "0 0 20 10");
  s.appendChild(document.createElementNS(NS, "text"));
  return s;
};

describe("createNeumeDrawer", () => {
  it("1) glifo exato do catálogo, sem chamar o motor", async () => {
    const engine = { render: vi.fn(async () => engineSvg()) };
    const el = await createNeumeDrawer(glyphOf, engine).draw("stgall", " cl!po ", 96);
    expect(el.querySelector("path")!.getAttribute("d")).toBe("Mclpo");
    expect(engine.render).not.toHaveBeenCalled();
  });
  it("2) motor quando não há glifo exato; cache por família+nabc; cópia nova a cada vez; altura pedida", async () => {
    const engine = { render: vi.fn(async () => engineSvg()) };
    const d = createNeumeDrawer(glyphOf, engine);
    const a = await d.draw("stgall", "pe!vi", 48);
    const b = await d.draw("stgall", "pe!vi", 48);
    expect(engine.render).toHaveBeenCalledTimes(1);
    expect(engine.render).toHaveBeenCalledWith("stgall", "pe!vi");
    expect(a.querySelector("svg")).not.toBe(b.querySelector("svg"));
    expect(a.querySelector("svg")!.getAttribute("height")).toBe("48");
    expect(a.querySelector("svg")!.getAttribute("width")).toBe("96");
    await d.draw("laon", "pe!vi");
    expect(engine.render).toHaveBeenCalledTimes(2);
  });
  it("3) motor devolve null ou falha → partes lado a lado; 4) nada → código em texto", async () => {
    const d = createNeumeDrawer(glyphOf, { render: vi.fn(async () => { throw new Error("x"); }) });
    const parts = await d.draw("stgall", "pe!vi");
    expect([...parts.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(["Mpe", "Mvi"]);
    const code = await createNeumeDrawer(glyphOf, null).draw("stgall", "pe!<b>x</b>");
    expect(code.classList.contains("neume-drawing-wrap--code")).toBe(true);
    expect(code.textContent).toBe("pe!<b>x</b>");
    expect(code.querySelector("b")).toBeNull();
    expect((await createNeumeDrawer(glyphOf, null).draw("stgall", "  ")).textContent).toBe("—");
  });
});

describe("nabc-only: utilitários de DOM", () => {
  it("looksLikePlaceholder: retângulo com contorno ou nenhum texto de glifo", () => {
    const mk = (inner: string) => {
      const host = document.createElement("div");
      host.innerHTML = `<svg xmlns="${NS}"><g class="nabc-nueme">${inner}</g></svg>`;
      return host.querySelector("svg") as SVGSVGElement;
    };
    expect(looksLikePlaceholder(mk('<rect width="4" height="10" stroke="red"></rect>'))).toBe(true);
    expect(looksLikePlaceholder(mk(""))).toBe(true);
    expect(looksLikePlaceholder(mk("<text>x</text>"))).toBe(false);
  });
  it("finishNabcOnlySvg recorta, tira fundo/camada interativa/comentário e fixa altura", () => {
    const host = document.createElement("div");
    host.innerHTML = `<svg xmlns="${NS}" width="100%"><rect fill="#ffffff"></rect><g class="ChantLine"><text>x</text></g><g class="chantLineInteractive"></g><text class="commentary"></text></svg>`;
    const svg = finishNabcOnlySvg(host.querySelector("svg") as SVGSVGElement, { x: 10, y: 20, width: 16, height: 6 }, 50);
    expect(svg.getAttribute("viewBox")).toBe("8 18 20 10");
    expect(svg.getAttribute("height")).toBe("50");
    expect(svg.getAttribute("width")).toBe("100");
    expect(Array.from(svg.children).some((c) => c.tagName.toLowerCase() === "rect")).toBe(false);
    expect(svg.querySelector(".chantLineInteractive, .commentary")).toBeNull();
    expect(svg.querySelector(".ChantLine text")).not.toBeNull();
  });
});

describe("host de medição", () => {
  it("#measure-host pré-existe no index.html e fica fora da tela, invisível (não display:none: precisa de layout)", () => {
    expect(readFileSync("index.html", "utf8")).toContain('id="measure-host"');
    const css = readFileSync("src/ui/notker.css", "utf8");
    expect(css).toMatch(/#measure-host\s*{[^}]*left:\s*-10000px[^}]*visibility:\s*hidden/);
    expect(css).not.toMatch(/#measure-host\s*{[^}]*display:\s*none/);
  });
});
