// test/selection-range.test.ts — seleção do editor → intervalo de sílabas → recorte.
import { describe, it, expect } from "vitest";
import { syllableRangeOfSelection } from "../src/preview/source-map";
import { sliceBySyllables, type TimedPlayback, type TimedNote } from "../src/tuotilo/duration";
import { syllableSpans } from "../src/preview/nabc-lib";

const DOC = "%%\n(c4) Ve(f)ni(g) Cre(h)a(i)tor(j)";
// sílabas reais 1..5; ordinais 0..4 entre as reais

describe("syllableRangeOfSelection", () => {
  const map = syllableSpans(DOC);
  it("R1. seleção cobrindo ni..Cre → ordinais [1, 2]", () => {
    const ni = DOC.indexOf("ni(");
    const creEnd = DOC.indexOf("a(i)");
    expect(syllableRangeOfSelection(map, ni, creEnd)).toEqual([1, 2]);
  });
  it("R2. seleção vazia (cursor) → null (toca tudo)", () => {
    expect(syllableRangeOfSelection(map, 5, 5)).toBeNull();
  });
  it("R3. seleção fora de qualquer sílaba real → null", () => {
    expect(syllableRangeOfSelection(map, 0, 2)).toBeNull(); // dentro de "%%\n"
  });
  it("R4. seleção parcial dentro de UMA sílaba → essa sílaba", () => {
    const v = DOC.indexOf("e(f"); // dentro de Ve
    expect(syllableRangeOfSelection(map, v, v + 1)).toEqual([0, 0]);
  });
});

describe("sliceBySyllables", () => {
  function tn(p: Partial<TimedNote> & { pitch: string; ms: number; syllableIndex: number }): TimedNote {
    return { idx: 0, pauseAfterMs: 0, articulation: "full", noteInSyllable: 0, ...p } as TimedNote;
  }
  const pb: TimedPlayback = {
    leadInMs: 30,
    notes: [
      tn({ pitch: "f", ms: 100, syllableIndex: 0 }),
      tn({ pitch: "g", ms: 100, syllableIndex: 1, pauseAfterMs: 50 }),
      tn({ pitch: "h", ms: 100, syllableIndex: 2 }),
      tn({ pitch: "i", ms: 100, syllableIndex: 3 }),
    ],
  };
  it("S1. recorte [1,2] mantém só as sílabas 1-2, zera leadIn, preserva pausa interna", () => {
    const out = sliceBySyllables(pb, [1, 2]);
    expect(out.notes.map((n) => n.syllableIndex)).toEqual([1, 2]);
    expect(out.leadInMs).toBe(0);
    expect(out.notes[0].pauseAfterMs).toBe(50);
  });
  it("S2. recorte completo = original (com leadIn)", () => {
    const out = sliceBySyllables(pb, [0, 3]);
    expect(out.notes).toHaveLength(4);
    expect(out.leadInMs).toBe(30);
  });
});
