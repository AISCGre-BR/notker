// test/tuotilo-wave.test.ts — TDD do overlay da onda (spec §7/D4).
import { describe, it, expect } from "vitest";
import {
  emptyWave, waveKey, setWaveFactor, applyWave, gabcBodyHash,
  WAVE_MIN, WAVE_MAX, type WaveOverlay,
} from "../src/tuotilo/wave";
import type { TimedNote, TimedPlayback } from "../src/tuotilo/duration";

function tn(p: Partial<TimedNote> & { pitch: string; ms: number }): TimedNote {
  return { idx: 0, pauseAfterMs: 0, articulation: "full", syllableIndex: 0,
           noteInSyllable: 0, ...p } as TimedNote;
}

describe("wave — overlay de fatores", () => {
  it("V1. emptyWave guarda o hash e nenhum fator", () => {
    const w = emptyWave("abc");
    expect(w.gabcBodyHash).toBe("abc");
    expect(Object.keys(w.factors)).toHaveLength(0);
  });
  it("V2. setWaveFactor com clamp [0.5, 2.5] e remoção do neutro", () => {
    let w = emptyWave("h");
    w = setWaveFactor(w, 2, 1, 3.7);
    expect(w.factors[waveKey(2, 1)]).toBe(WAVE_MAX);
    w = setWaveFactor(w, 2, 1, 0.1);
    expect(w.factors[waveKey(2, 1)]).toBe(WAVE_MIN);
    w = setWaveFactor(w, 2, 1, 1);     // fator neutro → remove a chave
    expect(w.factors[waveKey(2, 1)]).toBeUndefined();
  });
  it("V3. applyWave multiplica ms da nota certa e só dela; pausas intactas", () => {
    const pb: TimedPlayback = {
      leadInMs: 10,
      notes: [
        tn({ pitch: "f", ms: 200, syllableIndex: 0, noteInSyllable: 0 }),
        tn({ pitch: "g", ms: 200, syllableIndex: 0, noteInSyllable: 1, pauseAfterMs: 90 }),
        tn({ pitch: "h", ms: 200, syllableIndex: 1, noteInSyllable: 0 }),
      ],
    };
    let w = emptyWave("x");
    w = setWaveFactor(w, 0, 1, 1.6);
    const out = applyWave(pb, w);
    expect(out.notes[0].ms).toBe(200);
    expect(out.notes[1].ms).toBeCloseTo(320, 6);
    expect(out.notes[1].pauseAfterMs).toBe(90);
    expect(out.notes[2].ms).toBe(200);
    expect(out.leadInMs).toBe(10);
    // imutável: o original não muda
    expect(pb.notes[1].ms).toBe(200);
  });
  it("V4. gabcBodyHash: determinístico, sensível a mudanças, ignora cabeçalhos", () => {
    const a = gabcBodyHash("name: X;\n%%\n(c4) Ve(f)");
    const b = gabcBodyHash("name: OUTRO;\n%%\n(c4) Ve(f)");
    const c = gabcBodyHash("name: X;\n%%\n(c4) Ve(g)");
    expect(a).toBe(b);          // cabeçalho não importa
    expect(a).not.toBe(c);      // corpo importa
    expect(a).toBe(gabcBodyHash("name: X;\n%%\n(c4) Ve(f)")); // determinístico
  });
});
