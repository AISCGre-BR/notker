/**
 * tuotilo-duration.test.ts
 *
 * TDD estrito: testes escritos ANTES da implementação.
 * Cobre o modelo de duração log-aditivo saturado (decisão D-23).
 */

import { describe, it, expect } from "vitest";
import { computeDurations, type NoteEvent, type SyllableEvents } from "../src/tuotilo/duration";
import { DEFAULT_PROFILE, type RhythmProfile } from "../src/tuotilo/profile";
import type { SyllableRhythm } from "../src/tuotilo/signs";

// ── helpers de fábrica ───────────────────────────────────────────────────────

function syl(
  pitches: string[],
  signs: SyllableRhythm["signs"],
  divisio: SyllableRhythm["divisio"] = null,
  wordFinal = false,
): SyllableRhythm {
  // perPitchSigns simplificado: primeiro pitch recebe signs; restantes recebem []
  const perPitchSigns = pitches.map((_, i) => (i === 0 ? [...signs] : []));
  return { pitches, signs, perPitchSigns, divisio, wordFinal };
}

// ── Teste 1: episema alarga ─────────────────────────────────────────────────

describe("tuotilo duration — computeDurations", () => {

  it("1. episema alarga: nota com episema > nota lisa ×1.1 e < ×1.6", () => {
    const plain   = syl(["g"], []);
    const withEp  = syl(["g"], ["episema"]);

    const [evPlain]  = computeDurations([plain],   DEFAULT_PROFILE, 42);
    const [evWithEp] = computeDurations([withEp],  DEFAULT_PROFILE, 42);

    const msPlain = evPlain.notes[0].ms;
    const msEp    = evWithEp.notes[0].ms;

    expect(msEp).toBeGreaterThan(msPlain * 1.1);
    expect(msEp).toBeLessThan(msPlain * 1.6);
  });

  // ── Teste 2: empilhamento satura ────────────────────────────────────────────

  it("2. empilhamento [episema+mora] + wordFinal + divisio finalis satura em caps.phrase ×1.05", () => {
    const heavy = syl(["g"], ["episema", "mora"], "finalis", true);
    const [ev]  = computeDurations([heavy], DEFAULT_PROFILE, 42);

    const cap = DEFAULT_PROFILE.caps.phrase;
    const base = DEFAULT_PROFILE.baseMs;
    // tolerance: +9% cobre jitter gaussiano até +2σ (clamp máximo do gaussSample)
    expect(ev.notes[0].ms).toBeLessThanOrEqual(base * cap * 1.09);
  });

  // ── Teste 3: determinismo de seed ──────────────────────────────────────────

  it("3a. mesma seed => mesmos ms", () => {
    const syls = [
      syl(["g", "h"], ["episema"]),
      syl(["f"], [], "minor"),
      syl(["e", "f", "g"], ["mora"], null, true),
    ];
    const a = computeDurations(syls, DEFAULT_PROFILE, 7);
    const b = computeDurations(syls, DEFAULT_PROFILE, 7);
    expect(a.map((e) => e.notes.map((n) => n.ms))).toEqual(b.map((e) => e.notes.map((n) => n.ms)));
  });

  it("3b. seed diferente => ms diferente (probabilisticamente — ao menos 1 nota deve divergir)", () => {
    const syls = [
      syl(["g", "h", "i", "j"], []),
      syl(["f", "g"], ["episema"]),
    ];
    const a = computeDurations(syls, DEFAULT_PROFILE, 1);
    const b = computeDurations(syls, DEFAULT_PROFILE, 9999);
    const allMsA = a.flatMap((e) => e.notes.map((n) => n.ms));
    const allMsB = b.flatMap((e) => e.notes.map((n) => n.ms));
    const anyDiff = allMsA.some((v, i) => v !== allMsB[i]);
    expect(anyDiff).toBe(true);
  });

  // ── Teste 4: redutores (currentes) ─────────────────────────────────────────

  it("4. currentes encurta: ms < baseMs", () => {
    const s = syl(["G"], ["currentes"]); // inclinatum → currentes
    // re-mapear: 'G' maiúsculo viria do parser, mas passamos diretamente
    const plain  = syl(["g"], []);
    const curr   = syl(["g"], ["currentes"]);

    const [evPlain] = computeDurations([plain], DEFAULT_PROFILE, 42);
    const [evCurr]  = computeDurations([curr],  DEFAULT_PROFILE, 42);

    expect(evCurr.notes[0].ms).toBeLessThan(evPlain.notes[0].ms);
    expect(evCurr.notes[0].ms).toBeLessThan(DEFAULT_PROFILE.baseMs);
  });

  // ── Teste 5: pauseMs ───────────────────────────────────────────────────────

  it("5a. divisio maior => pauseMs = pauseBeats.maior × baseMs", () => {
    const s = syl(["g"], [], "maior", false);
    const [ev] = computeDurations([s], DEFAULT_PROFILE, 42);
    const expected = DEFAULT_PROFILE.pauseBeats.maior * DEFAULT_PROFILE.baseMs;
    expect(ev.pauseMs).toBeCloseTo(expected, 5);
  });

  it("5b. sem divisio => pauseMs = 0", () => {
    const s = syl(["g"], []);
    const [ev] = computeDurations([s], DEFAULT_PROFILE, 42);
    expect(ev.pauseMs).toBe(0);
  });

  // ── Teste 6: reattack sempre true ──────────────────────────────────────────

  it("6. reattack=true em todas as notas, inclusive pitches repetidos [f,f,f]", () => {
    const s = syl(["f", "f", "f"], []);
    const [ev] = computeDurations([s], DEFAULT_PROFILE, 42);
    expect(ev.notes).toHaveLength(3);
    for (const n of ev.notes) {
      expect(n.reattack).toBe(true);
    }
  });

  // ── Teste 7: anti-mensuralista (D-23) ──────────────────────────────────────

  it("7. ANTI-MENSURALISTA: razão entre médias dos 2 clusters fora de [1.9, 2.1]", () => {
    // 40 sílabas com combinações variadas de signs/wordFinal/divisio
    const signs: SyllableRhythm["signs"][] = [
      [],
      ["episema"],
      ["mora"],
      ["episema", "mora"],
      ["currentes"],
      ["quilisma"],
      ["preQuilisma"],
      ["initioDebilis"],
      ["oriscus"],
      ["liqAug"],
      ["liqDim"],
      ["strophae"],
      ["episema", "currentes"],
      ["mora", "initioDebilis"],
    ];
    const divisios: SyllableRhythm["divisio"][] = [null, null, null, "minima", "minor", "maior", null];
    const wordFinals = [false, true, false, false, true, false, false];

    const syls: SyllableRhythm[] = Array.from({ length: 40 }, (_, i) => {
      const s = signs[i % signs.length];
      const d = divisios[i % divisios.length];
      const wf = wordFinals[i % wordFinals.length];
      return syl(["g"], s, d, wf);
    });

    const results = computeDurations(syls, DEFAULT_PROFILE, 12345);
    // Coleta apenas notas reais (sílabas com pitches)
    const allMs = results.flatMap((e) => e.notes.map((n) => n.ms)).filter((v) => v > 0);
    expect(allMs.length).toBeGreaterThan(0);

    const ratio = twoMeansRatio(allMs);
    // A razão NÃO deve ser ≈2.0 (proibição D-23 de proporção 1:2)
    const isMenusral = ratio >= 1.9 && ratio <= 2.1;
    expect(isMenusral).toBe(false);
  });

  // ── Teste 8: sílaba só divisio (sem pitches) ───────────────────────────────

  it("8. sílaba só divisio => notes=[], pauseMs do nível", () => {
    const s: SyllableRhythm = { pitches: [], signs: [], perPitchSigns: [], divisio: "finalis", wordFinal: false };
    const [ev] = computeDurations([s], DEFAULT_PROFILE, 42);
    expect(ev.notes).toHaveLength(0);
    expect(ev.pauseMs).toBeCloseTo(DEFAULT_PROFILE.pauseBeats.finalis * DEFAULT_PROFILE.baseMs, 5);
  });

  // ── Teste 9: syllableIndex preservado ──────────────────────────────────────

  it("9. syllableIndex corresponde ao índice de entrada", () => {
    const syls = [syl(["g"], []), syl(["h"], ["episema"]), syl(["f"], [], "minor")];
    const results = computeDurations(syls, DEFAULT_PROFILE, 1);
    results.forEach((ev, i) => expect(ev.syllableIndex).toBe(i));
  });

  // ── Teste 10: novos fatores em DEFAULT_PROFILE (D-23) ──────────────────────

  it("10. DEFAULT_PROFILE.factors contém oriscus/liqAug/liqDim/strophae e ≠ 1.5/2.0", () => {
    const f = DEFAULT_PROFILE.factors;
    expect(f).toHaveProperty("oriscus");
    expect(f).toHaveProperty("liqAug");
    expect(f).toHaveProperty("liqDim");
    expect(f).toHaveProperty("strophae");

    for (const key of ["oriscus", "liqAug", "liqDim", "strophae"] as const) {
      const v = (f as Record<string, number>)[key];
      expect(v).not.toBe(1.5);
      expect(v).not.toBe(2.0);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(3);
    }
  });

  // ── Teste 11: liqAug alarga, liqDim encurta ────────────────────────────────

  it("11. liqAug alarga nota, liqDim encurta nota (comparado a nota lisa)", () => {
    const plain  = computeDurations([syl(["g"], [])],         DEFAULT_PROFILE, 42)[0].notes[0].ms;
    const aug    = computeDurations([syl(["g"], ["liqAug"])],  DEFAULT_PROFILE, 42)[0].notes[0].ms;
    const dim    = computeDurations([syl(["g"], ["liqDim"])],  DEFAULT_PROFILE, 42)[0].notes[0].ms;
    expect(aug).toBeGreaterThan(plain);
    expect(dim).toBeLessThan(plain);
  });

});

// ── Helper anti-mensuralista: k-means 1D com 2 clusters ─────────────────────

/**
 * twoMeansRatio: agrupa valores em 2 clusters via k-means 1D e retorna
 * a razão maior/menor entre as médias dos clusters.
 */
function twoMeansRatio(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  // Inicializa centroides: menor e maior valor
  let c0 = sorted[0];
  let c1 = sorted[sorted.length - 1];

  for (let iter = 0; iter < 100; iter++) {
    const g0: number[] = [];
    const g1: number[] = [];
    for (const v of sorted) {
      if (Math.abs(v - c0) <= Math.abs(v - c1)) g0.push(v);
      else g1.push(v);
    }
    const newC0 = g0.length ? g0.reduce((a, b) => a + b, 0) / g0.length : c0;
    const newC1 = g1.length ? g1.reduce((a, b) => a + b, 0) / g1.length : c1;
    if (Math.abs(newC0 - c0) < 1e-9 && Math.abs(newC1 - c1) < 1e-9) break;
    c0 = newC0; c1 = newC1;
  }
  return c0 > 0 ? c1 / c0 : Infinity;
}
