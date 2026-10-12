import { describe, it, expect } from "vitest";
import { icon, ICONS } from "../src/ui/pd/icons";

describe("ícones", () => {
  it("gera <svg> decorativo com o traço do Parchment", () => {
    const s = icon("search");
    expect(s.tagName.toLowerCase()).toBe("svg");
    expect(s.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(s.getAttribute("stroke-width")).toBe("1.75");
    expect(s.getAttribute("aria-hidden")).toBe("true");
    expect(s.querySelector("circle")).not.toBeNull();
  });
  it("todos os ícones declarados têm conteúdo", () => {
    for (const k of Object.keys(ICONS)) expect(ICONS[k as keyof typeof ICONS].length).toBeGreaterThan(10);
  });
});
