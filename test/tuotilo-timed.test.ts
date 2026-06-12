// test/tuotilo-timed.test.ts — TDD de computeTimedNotes (spec §4 + modos §1).
// Substitui tuotilo-duration.test.ts (API v1), que será removido na Task 7.
import { describe, it, expect } from "vitest";
import { computeTimedNotes, type PlaybackMode } from "../src/tuotilo/duration";
import { buildTimeline } from "../src/tuotilo/timeline";
import { DEFAULT_PROFILE } from "../src/tuotilo/profile";
import type { SyllableRhythm, RhythmSign } from "../src/tuotilo/signs";

function syl(
  pitches: string[],
  perPitchSigns?: RhythmSign[][],
  divisio: SyllableRhythm["divisio"] = null,
  wordFinal = false,
  accented = false,
): SyllableRhythm {
  const pps = perPitchSigns ?? pitches.map(() => []);
  const signs = Array.from(new Set(pps.flat()));
  return { pitches, signs, perPitchSigns: pps, aligned: true, accented, divisio, wordFinal };
}
const P = DEFAULT_PROFILE;
function timed(syls: SyllableRhythm[], mode: PlaybackMode = "interpretado", seed = 42) {
  return computeTimedNotes(buildTimeline(syls), P, seed, mode);
}

describe("computeTimedNotes — interpretado (fidelidade por nota)", () => {
  it("D1. FIDELIDADE: episema na 2ª nota do melisma alarga SÓ a 2ª", () => {
    const { notes } = timed([syl(["f", "g", "h"], [[], ["episema"], []])]);
    expect(notes[1].ms).toBeGreaterThan(notes[0].ms * 1.1);
    // 1ª e 3ª lisas: diferem só pelo jitter (2 amostras independentes de ±2σ
    // podem distar até ~(1.08/0.92 - 1) ≈ 0.17 relativo → teto folgado 0.2)
    expect(Math.abs(notes[0].ms - notes[2].ms) / notes[0].ms).toBeLessThan(0.2);
  });
  it("D2. articulation: full no início/pós-divisio e récita; pulse na repercussão intra-sílaba; legato no resto", () => {
    const { notes } = timed([
      syl(["f", "g"]),                 // 0:full 1:legato
      syl(["g"]),                      // 2:repercussão ENTRE sílabas → full
      syl([], undefined, "minima"),
      syl(["h", "h", "i"]),            // 3:full(pós-divisio) 4:pulse(intra-sílaba) 5:legato
    ]);
    expect(notes.map((n) => n.articulation)).toEqual([
      "full", "legato", "full", "full", "pulse", "legato",
    ]);
  });
  it("D3. pauseAfterMs na última nota pré-divisio = pauseBeats × baseMs", () => {
    const { notes } = timed([syl(["f", "g"]), syl([], undefined, "maior"), syl(["h"])]);
    expect(notes[1].pauseAfterMs).toBeCloseTo(P.pauseBeats.maior * P.baseMs, 5);
    expect(notes[0].pauseAfterMs).toBe(0);
    expect(notes[2].pauseAfterMs).toBe(0);
  });
  it("D3b. divisio inicial vira leadInMs", () => {
    const r = timed([syl([], undefined, "minima"), syl(["f"])]);
    expect(r.leadInMs).toBeCloseTo(P.pauseBeats.minima * P.baseMs, 5);
  });
  it("D4. determinismo: mesma seed → mesmos ms; seeds diferentes divergem", () => {
    const syls = [syl(["f", "g", "h", "i"]), syl(["g"], [["episema"]])];
    const a = timed(syls, "interpretado", 7).notes.map((n) => n.ms);
    const b = timed(syls, "interpretado", 7).notes.map((n) => n.ms);
    const c = timed(syls, "interpretado", 9999).notes.map((n) => n.ms);
    expect(a).toEqual(b);
    expect(a.some((v, i) => v !== c[i])).toBe(true);
  });
  it("D5. saturação: pilha pesada + finalis + wordFinal ≤ caps.phrase × base × 1.09", () => {
    const { notes } = timed([syl(["g"], [["episema", "liqAug"]], "finalis", true)]);
    expect(notes[0].ms).toBeLessThanOrEqual(P.baseMs * P.caps.phrase * 1.09);
  });
  it("D6. wordFinal e divisio alargam as notas da própria sílaba", () => {
    const plain = timed([syl(["g"])]).notes[0].ms;
    const wf    = timed([syl(["g"], undefined, null, true)]).notes[0].ms;
    expect(wf).toBeGreaterThan(plain);
  });
  it("D7. syllableIndex preservado nas notas", () => {
    const { notes } = timed([syl(["f", "g"]), syl(["h"])]);
    expect(notes.map((n) => n.syllableIndex)).toEqual([0, 0, 1]);
  });
  it("D9. recitação encurta: run de 4 unísonos silábicos < nota silábica isolada", () => {
    const run = timed([syl(["h"]), syl(["h"]), syl(["h"]), syl(["h"])]).notes;
    const solo = timed([syl(["h"])]).notes[0];
    // todas as notas do run mais curtas que a isolada (mesma seed → jitter difere,
    // mas o fator 0.83 domina folgadamente o jitter de ±8%)
    for (const n of run) expect(n.ms).toBeLessThan(solo.ms);
    // e continuam rearticuladas (regra sagrada)
    expect(run.map((n) => n.articulation)).toEqual(["full", "full", "full", "full"]);
  });
  it("D10. récita: tônica pesa mais que átonas do MESMO run (a-do-rá-te)", () => {
    const { notes } = timed([
      syl(["h"]), syl(["h"]), syl(["h"], undefined, null, false, true), // rá: accented
      syl(["h"], undefined, null, true),
    ]);
    const [a, b, tonic, c] = notes.map((n) => n.ms);
    expect(tonic).toBeGreaterThan(a);
    expect(tonic).toBeGreaterThan(b);
    expect(tonic).toBeGreaterThan(c);
    // tônica continua ≤ valor silábico pleno alargado (não vira episema)
    expect(tonic).toBeLessThan(P.baseMs * 1.15);
  });
  it("D10b. tônica FORA de récita não ganha nada: recitationTonic não vaza", () => {
    const tonicSolo = timed([syl(["h"], undefined, null, false, true), syl(["g"], undefined, null, true)]).notes[0];
    const plainSolo = timed([syl(["h"]), syl(["g"], undefined, null, true)]).notes[0];
    // mesma seed, mesma posição → mesmo jitter → ms idênticos
    expect(tonicSolo.ms).toBe(plainSolo.ms);
  });
  it("D8. ANTI-MENSURALISTA (D-23): razão dos 2 clusters fora de [1.9, 2.1]", () => {
    const signsPool: RhythmSign[][] = [
      [], ["episema"], ["currentes"], ["quilisma"], ["preQuilisma"],
      ["initioDebilis"], ["oriscus"], ["liqAug"], ["liqDim"], ["strophae"],
      ["episema", "liqAug"], ["episema", "currentes"],
    ];
    const divisios: SyllableRhythm["divisio"][] = [null, null, null, "minima", "minor", "maior", null];
    const wfs = [false, true, false, false, true, false, false];
    const syls = Array.from({ length: 40 }, (_, i) =>
      syl(["g"], [signsPool[i % signsPool.length]], divisios[i % divisios.length], wfs[i % wfs.length]));
    const allMs = timed(syls, "interpretado", 12345).notes.map((n) => n.ms);
    const ratio = twoMeansRatio(allMs);
    expect(ratio >= 1.9 && ratio <= 2.1).toBe(false);
  });
});

describe("computeTimedNotes — solfejo", () => {
  it("S1. toda nota = baseMs exato (sem jitter, sem fatores), mesmo com sinais", () => {
    const { notes } = timed(
      [syl(["f", "g"], [["episema"], ["liqAug"]], null, true), syl(["h"])],
      "solfejo",
    );
    for (const n of notes) expect(n.ms).toBe(P.baseMs);
  });
  it("S2. solfejo: articulation full em TODAS as notas (re-ataque por nota)", () => {
    const { notes } = timed([syl(["f", "g", "g", "h"])], "solfejo");
    expect(notes.every((n) => n.articulation === "full")).toBe(true);
  });
  it("S4. recitação NÃO aplica no solfejo (isócrono)", () => {
    const { notes } = timed([syl(["h"]), syl(["h"]), syl(["h"])], "solfejo");
    for (const n of notes) expect(n.ms).toBe(P.baseMs);
  });
  it("S3. pausas de divisio mantidas", () => {
    const { notes } = timed([syl(["f"]), syl([], undefined, "minor"), syl(["g"])], "solfejo");
    expect(notes[0].pauseAfterMs).toBeCloseTo(P.pauseBeats.minor * P.baseMs, 5);
  });
});

// k-means 1D com 2 clusters (copiado de tuotilo-duration.test.ts v1)
function twoMeansRatio(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  let c0 = sorted[0];
  let c1 = sorted[sorted.length - 1];
  for (let iter = 0; iter < 100; iter++) {
    const g0: number[] = [];
    const g1: number[] = [];
    for (const v of sorted) (Math.abs(v - c0) <= Math.abs(v - c1) ? g0 : g1).push(v);
    const n0 = g0.length ? g0.reduce((a, b) => a + b, 0) / g0.length : c0;
    const n1 = g1.length ? g1.reduce((a, b) => a + b, 0) / g1.length : c1;
    if (Math.abs(n0 - c0) < 1e-9 && Math.abs(n1 - c1) < 1e-9) break;
    c0 = n0; c1 = n1;
  }
  return c0 > 0 ? c1 / c0 : Infinity;
}
