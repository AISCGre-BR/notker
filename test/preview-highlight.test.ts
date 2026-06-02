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
});
