import { describe, it, expect } from "vitest";
import { resolveEditorToSyllable } from "../src/preview/sync";
import type { SyllableSource } from "../src/preview/engine";

const map: SyllableSource[] = [
  { syllableIndex: 1, from: 1, to: 3 },
  { syllableIndex: 2, from: 5, to: 7 },
];

describe("sync editor→preview", () => {
  it("resolve offset do editor p/ índice de sílaba", () => {
    expect(resolveEditorToSyllable(map, 6)).toBe(2);
    expect(resolveEditorToSyllable(map, 2)).toBe(1);
  });
  it("offset fora de qualquer sílaba → null", () => {
    expect(resolveEditorToSyllable(map, 4)).toBeNull();
  });
});
