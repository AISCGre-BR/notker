import { describe, it, expect } from "vitest";
import { syllableAtOffset, sourceOfSyllable } from "../src/preview/source-map";
import type { SyllableSource } from "../src/preview/engine";

const map: SyllableSource[] = [
  { syllableIndex: 1, from: 1, to: 3 },
  { syllableIndex: 2, from: 5, to: 7 },
  { syllableIndex: 3, from: 9, to: 12 },
];

describe("source-map", () => {
  it("syllableAtOffset acha a sílaba cujo intervalo contém o offset", () => {
    expect(syllableAtOffset(map, 2)?.syllableIndex).toBe(1);
    expect(syllableAtOffset(map, 6)?.syllableIndex).toBe(2);
    expect(syllableAtOffset(map, 4)).toBeNull();
  });
  it("sourceOfSyllable devolve o intervalo do fonte por índice", () => {
    expect(sourceOfSyllable(map, 3)).toEqual({ from: 9, to: 12 });
    expect(sourceOfSyllable(map, 99)).toBeNull();
  });
});
