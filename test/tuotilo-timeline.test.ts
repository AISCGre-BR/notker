// test/tuotilo-timeline.test.ts — TDD da IR NoteTimeline (spec §2).
import { describe, it, expect } from "vitest";
import { buildTimeline } from "../src/tuotilo/timeline";
import type { SyllableRhythm } from "../src/tuotilo/signs";

function syl(
  pitches: string[],
  opts: Partial<Pick<SyllableRhythm, "divisio" | "wordFinal" | "aligned" | "perPitchSigns">> = {},
): SyllableRhythm {
  return {
    pitches,
    signs: [],
    perPitchSigns: opts.perPitchSigns ?? pitches.map(() => []),
    aligned: opts.aligned ?? true,
    divisio: opts.divisio ?? null,
    wordFinal: opts.wordFinal ?? false,
  };
}

describe("buildTimeline", () => {
  it("T1. notas planas com idx sequencial e syllableIndex/noteInSyllable", () => {
    const tl = buildTimeline([syl(["f", "g"]), syl(["h"])]);
    expect(tl.notes.map((n) => n.idx)).toEqual([0, 1, 2]);
    expect(tl.notes.map((n) => n.syllableIndex)).toEqual([0, 0, 1]);
    expect(tl.notes.map((n) => n.noteInSyllable)).toEqual([0, 1, 0]);
  });
  it("T2. wordIndex incrementa após sílaba wordFinal", () => {
    const tl = buildTimeline([syl(["f"]), syl(["g"], { wordFinal: true }), syl(["h"])]);
    expect(tl.notes.map((n) => n.wordIndex)).toEqual([0, 0, 1]);
  });
  it("T3. incisumIndex quebra em QUALQUER divisio (D2), inclusive minima", () => {
    const tl = buildTimeline([
      syl(["f"]),
      syl([], { divisio: "minima" }),
      syl(["g"]),
      syl([], { divisio: "maior" }),
      syl(["h"]),
    ]);
    expect(tl.notes.map((n) => n.incisumIndex)).toEqual([0, 1, 2]);
  });
  it("T4. divisiones registradas com afterNoteIdx e kind", () => {
    const tl = buildTimeline([syl(["f", "g"]), syl([], { divisio: "minor" }), syl(["h"])]);
    expect(tl.divisiones).toEqual([{ afterNoteIdx: 1, kind: "minor" }]);
  });
  it("T4b. divisio ANTES de qualquer nota → afterNoteIdx = -1", () => {
    const tl = buildTimeline([syl([], { divisio: "minima" }), syl(["f"])]);
    expect(tl.divisiones).toEqual([{ afterNoteIdx: -1, kind: "minima" }]);
  });
  it("T5. repercussão: mesma altura consecutiva no MESMO incisum (regra sagrada)", () => {
    const tl = buildTimeline([syl(["f", "f", "g", "f"])]);
    expect(tl.notes.map((n) => n.repercussion)).toEqual([false, true, false, false]);
  });
  it("T5b. repercussão atravessa sílabas dentro do incisum (legato cruza palavras)", () => {
    const tl = buildTimeline([syl(["f"], { wordFinal: true }), syl(["f"])]);
    expect(tl.notes[1].repercussion).toBe(true);
  });
  it("T5c. repercussão NÃO atravessa divisio (incisos diferentes)", () => {
    const tl = buildTimeline([syl(["f"]), syl([], { divisio: "minima" }), syl(["f"])]);
    expect(tl.notes[1].repercussion).toBe(false);
  });
  it("T6. nota carrega signs/aligned/wordFinal/divisio da sua sílaba", () => {
    const tl = buildTimeline([
      syl(["f", "g"], { perPitchSigns: [["episema"], []], aligned: false,
                        divisio: "minor", wordFinal: true }),
    ]);
    expect(tl.notes[0].signs).toEqual(["episema"]);
    expect(tl.notes[1].signs).toEqual([]);
    expect(tl.notes[0].aligned).toBe(false);
    expect(tl.notes[0].wordFinal).toBe(true);
    expect(tl.notes[0].divisio).toBe("minor");
  });
});
