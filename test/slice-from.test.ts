import { describe, it, expect } from "vitest";
import { sliceFromSyllable } from "../src/tuotilo/duration";
import type { TimedPlayback } from "../src/tuotilo/duration";

const mk = (syls: number[]): TimedPlayback => ({
  leadInMs: 100,
  notes: syls.map((s, i) => ({
    idx: i, pitch: "f", alt: 0, ms: 200, pauseAfterMs: 0,
    articulation: "full" as const, syllableIndex: s, noteInSyllable: 0,
  })),
});

describe("sliceFromSyllable", () => {
  it("toca da sílaba a até o fim (descarta antes)", () => {
    const pb = mk([0, 1, 2, 3]);
    const out = sliceFromSyllable(pb, 2);
    expect(out.notes.map((n) => n.syllableIndex)).toEqual([2, 3]);
  });
  it("zera o leadIn em recorte parcial; mantém quando começa do 0", () => {
    expect(sliceFromSyllable(mk([0, 1, 2]), 1).leadInMs).toBe(0);
    expect(sliceFromSyllable(mk([0, 1, 2]), 0).leadInMs).toBe(100);
  });
});
