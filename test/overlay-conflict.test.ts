import { describe, it, expect } from "vitest";
import { hasConflict, promoteToDefault } from "../src/overlay-ui/conflict";
import type { NeumeEntry, Overlay } from "../src/neume/types";

const base: NeumeEntry = {
  id: "stgall:cl", family: "stgall", code: "cl", nabc: "cl", nabcValid: true,
  base: "cl", name: "clivis", qualifiers: [], letters: [], terms: ["clivis", "cl"],
  meaning: "", svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 },
};

describe("overlay conflito + promoção", () => {
  it("hasConflict quando overlay tem nome diferente do nome-base", () => {
    expect(hasConflict(base, { names: ["clive longo"] })).toBe(true);
    expect(hasConflict(base, { names: ["clivis"] })).toBe(false);
    expect(hasConflict(base, undefined)).toBe(false);
  });
  it("promoteToDefault põe o nome escolhido como primeiro da lista do overlay", () => {
    const ov: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: { "stgall:cl": { names: ["a", "b"] } } };
    const out = promoteToDefault(ov, "stgall:cl", "b");
    expect(out.entries["stgall:cl"].names).toEqual(["b", "a"]);
  });
});
