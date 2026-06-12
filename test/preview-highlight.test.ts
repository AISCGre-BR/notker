import { describe, it, expect } from "vitest";
import { highlightSyllable, clearHighlight } from "../src/preview/highlight";

function svgEl(): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<g class="syllable syllable-1"></g><g class="syllable syllable-2"></g></svg>';
  return host.querySelector("svg")!;
}

describe("realce de sílaba no preview", () => {
  it("aplica a classe de realce na sílaba apontada e em nenhuma outra", () => {
    const svg = svgEl();
    highlightSyllable(svg, 2);
    expect(svg.querySelector(".syllable-2")!.classList.contains("hl-strong")).toBe(true);
    expect(svg.querySelector(".syllable-1")!.classList.contains("hl-strong")).toBe(false);
  });
  it("clear remove o realce; índice inexistente não quebra", () => {
    const svg = svgEl();
    highlightSyllable(svg, 1);
    highlightSyllable(svg, 99);
    expect(svg.querySelector(".hl-strong")).toBeNull();
    clearHighlight(svg);
    expect(svg.querySelector(".hl-strong")).toBeNull();
  });
  it("realça TODOS os fragmentos quando a sílaba foi dividida pela quebra de linha", () => {
    document.body.innerHTML =
      `<svg>` +
      `<g class="syllable syllable-1"></g>` +
      `<g class="syllable syllable-2"></g>` +
      `<g class="syllable syllable-2"></g>` + // fragmento da MESMA sílaba (split de linha)
      `<g class="syllable syllable-3"></g>` +
      `</svg>`;
    const svg = document.querySelector("svg")!;
    highlightSyllable(svg, 2);
    expect(svg.querySelectorAll(".hl-strong")).toHaveLength(2);
    // e não realça vizinhos
    highlightSyllable(svg, 3);
    expect(svg.querySelectorAll(".hl-strong")).toHaveLength(1);
  });
  it("não confunde syllable-1 com syllable-10 (match exato do índice)", () => {
    document.body.innerHTML =
      `<svg><g class="syllable syllable-1"></g><g class="syllable syllable-10"></g></svg>`;
    const svg = document.querySelector("svg")!;
    highlightSyllable(svg, 1);
    expect(svg.querySelectorAll(".hl-strong")).toHaveLength(1);
    expect(svg.querySelector(".hl-strong")!.getAttribute("class")).toContain("syllable-1");
    expect(svg.querySelector(".hl-strong")!.getAttribute("class")).not.toContain("syllable-10");
  });
});
