/**
 * haec-regression.test.ts — Teste de regressão: pipeline completo Haec dies
 *
 * Reproduz EXATAMENTE o que main.ts faz ao clicar "Tocar":
 *   syllableSpans → extractAll → buildTimeline → computeTimedNotes
 *   → applyWave → player.play(...)
 *
 * Contexto: UAT relatou "playback parou em HAec→di". A investigação mostrou que
 * o bug NÃO é reproduzível com o fake AudioContext — todo o pipeline TypeScript
 * está correto (15 verificações, todas passando). O bug é específico do runtime
 * WebKit real.
 *
 * Este teste serve como regressão estrutural:
 * - Garante que o pipeline não regride em exceções, NaN, ou scheduling incorreto.
 * - Documenta a estrutura esperada (5 grupos, 31 notas, 2 pulsos no grupo di).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syllableSpans } from "../src/preview/nabc-lib";
import { extractAll } from "../src/tuotilo/signs";
import { buildTimeline } from "../src/tuotilo/timeline";
import { computeTimedNotes } from "../src/tuotilo/duration";
import { DEFAULT_PROFILE } from "../src/tuotilo/profile";
import { emptyWave, gabcBodyHash, applyWave } from "../src/tuotilo/wave";
import { createPlayer, pitchToFreq, PEAK_GAIN, PULSE_DIP } from "../src/tuotilo/player";
import type { TimedNote } from "../src/tuotilo/duration";

// ── Doc real do UAT ──────────────────────────────────────────────────────────

const HAEC_DIES = `name:Haec dies. ℣. Confitemini;
office-part:Graduale;
mode:2;
nabc-lines:1;
%%
(c3) HAec(gxf_e|///cllst2|/gvFEfd/f_h|cilscw3\`\`\`\`\`\`\`\`\`\`\`\`cl/pq) di(hhhvFE/fef|//ds///ci//po)es,(f.|vi-) *(;)
quam(ef|pe) fe(hh|bv-)cit(hh//ijhhvFEf.|//ds/////to//ci//vi-) (,)`;

// ── Fake AudioContext (copiado de tuotilo-player.test.ts) ───────────────────

interface FakeAudioParam {
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  value: number;
}

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  type?: string;
  frequency: FakeAudioParam;
  gain: FakeAudioParam;
  Q?: FakeAudioParam;
}

interface FakeBiquadNode extends FakeNode {
  frequency: FakeAudioParam;
}

interface FakeWaveShaperNode {
  curve: Float32Array | null;
  oversample: string;
  connect: ReturnType<typeof vi.fn>;
}

interface FakeCtx {
  currentTime: number;
  destination: Record<string, never>;
  close: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createWaveShaper: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  _oscillators: FakeNode[];
  _gains: FakeNode[];
  _filters: FakeBiquadNode[];
  _waveShapers: FakeWaveShaperNode[];
}

function fakeAudioParam(): FakeAudioParam {
  return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
}

function makeFakeCtx(currentTime = 0): FakeCtx {
  const ctx: FakeCtx = {
    currentTime,
    destination: {},
    close: vi.fn(),
    _oscillators: [],
    _gains: [],
    _filters: [],
    _waveShapers: [],
    createOscillator: vi.fn(() => {
      const osc: FakeNode = {
        type: "triangle", frequency: fakeAudioParam(), gain: fakeAudioParam(),
        connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      };
      ctx._oscillators.push(osc);
      return osc;
    }),
    createBiquadFilter: vi.fn(() => {
      const f: FakeBiquadNode = {
        type: "lowpass", frequency: fakeAudioParam(), gain: fakeAudioParam(), Q: fakeAudioParam(),
        connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      };
      ctx._filters.push(f);
      return f;
    }),
    createWaveShaper: vi.fn(() => {
      const ws: FakeWaveShaperNode = {
        curve: null,
        oversample: "none",
        connect: vi.fn(),
      };
      ctx._waveShapers.push(ws);
      return ws;
    }),
    createGain: vi.fn(() => {
      const g: FakeNode = {
        frequency: fakeAudioParam(), gain: fakeAudioParam(),
        connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      };
      ctx._gains.push(g);
      return g;
    }),
  };
  return ctx;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Coleta TODOS os timestamps do stream gain.gain (set + ramp) de cada nó de gain.
 *  Retorna { setTs, rampTs } — ambos em ordem de chamada. */
function collectGainTs(gain: FakeNode): { setTs: number[]; rampTs: number[] } {
  const setTs = (gain.gain.setValueAtTime.mock.calls as [number, number][]).map(([, t]) => t);
  const rampTs = (gain.gain.linearRampToValueAtTime.mock.calls as [number, number][]).map(([, t]) => t);
  return { setTs, rampTs };
}

/** Verifica se um array de timestamps é estritamente crescente. */
function isStrictlyIncreasing(ts: number[]): { ok: boolean; firstBadIdx: number } {
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] <= ts[i - 1]) return { ok: false, firstBadIdx: i };
  }
  return { ok: true, firstBadIdx: -1 };
}

/** Verifica se algum timestamp é NaN ou negativo. */
function hasNanOrNegative(ts: number[]): number[] {
  return ts.filter((t) => isNaN(t) || t < 0);
}

// ── Suite de diagnóstico ─────────────────────────────────────────────────────

describe("debug-haec: pipeline completo Haec dies", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  // ── Etapa 1: syllableSpans + extractAll ─────────────────────────────────

  it("DIAG-1: syllableSpans produz spans corretos para Haec dies", () => {
    const spans = syllableSpans(HAEC_DIES);
    // Deveria ter: clave(0), HAec(1), di(2), es,(3), *(;)(4), quam(5), fe(6), cit(7), (,)(8)
    expect(spans.length).toBeGreaterThanOrEqual(8);
    const clave = spans.find((s) => s.syllableIndex === 0);
    expect(clave).toBeDefined();
    const haec = spans.find((s) => s.syllableIndex === 1);
    expect(haec).toBeDefined();
    const di = spans.find((s) => s.syllableIndex === 2);
    expect(di).toBeDefined();
    // Verifica que HAec e di são contíguos (di.from === haec.to + 1 ou similar)
    if (haec && di) {
      const haecContent = HAEC_DIES.slice(haec.from, haec.to);
      const diContent = HAEC_DIES.slice(di.from, di.to);
      expect(haecContent).toContain("HAec");
      expect(diContent).toContain("di");
    }
  });

  it("DIAG-2: extractAll produz sílabas com pitches corretos para HAec e di", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    // HAec = índice 0 da array real (syllableIndex=1)
    const haec = syls[0];
    // di = índice 1
    const di = syls[1];

    expect(haec).toBeDefined();
    expect(di).toBeDefined();
    // HAec deve ter 9 pitches: [f,e,g,f,e,f,d,f,h]
    expect(haec.pitches).toHaveLength(9);
    expect(haec.pitches[8]).toBe("h"); // último pitch = h
    // di deve ter 8 pitches: [h,h,h,f,e,f,e,f]
    expect(di.pitches).toHaveLength(8);
    expect(di.pitches[0]).toBe("h"); // primeiro pitch = h
    expect(di.pitches[1]).toBe("h");
    expect(di.pitches[2]).toBe("h");
  });

  it("DIAG-3: buildTimeline produz articulações corretas na fronteira HAec→di", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);

    // HAec tem 9 notas (idx 0..8), di tem 8 (idx 9..16)
    const haecLast = tl.notes[8]; // última nota de HAec = h
    const diFirst = tl.notes[9];  // primeira nota de di = h
    const diSecond = tl.notes[10]; // segunda nota de di = h (strophae)
    const diThird = tl.notes[11]; // terceira nota de di = h

    expect(haecLast.pitch).toBe("h");
    expect(diFirst.pitch).toBe("h");

    // Ambas no mesmo incisum (nenhuma divisio entre elas)
    expect(haecLast.incisumIndex).toBe(diFirst.incisumIndex);

    // di[0]: repercussão inter-sílabas
    expect(diFirst.repercussion).toBe(true);
    expect(diFirst.syllableIndex).not.toBe(haecLast.syllableIndex);

    // di[1] e di[2] devem ser repercussão intra-sílaba
    expect(diSecond.repercussion).toBe(true);
    expect(diSecond.syllableIndex).toBe(diFirst.syllableIndex);
    expect(diThird.repercussion).toBe(true);
    expect(diThird.syllableIndex).toBe(diFirst.syllableIndex);
  });

  it("DIAG-4: computeTimedNotes produz articulações corretas para di", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    // Seed fixo para reprodutibilidade
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");

    // di[0] = note idx 9: repercussão inter-sílabas → "full"
    const di0 = pb.notes[9];
    expect(di0.articulation).toBe("full");
    // di[1] = note idx 10: repercussão intra-sílaba → "pulse" (se pulseFits)
    const di1 = pb.notes[10];
    expect(di1.articulation).toBe("pulse");
    // di[2] = note idx 11: id.
    const di2 = pb.notes[11];
    expect(di2.articulation).toBe("pulse");

    // Verificar que as durações são razoáveis (> 120ms para pulseFits)
    expect(di0.ms).toBeGreaterThan(120);
    expect(di1.ms).toBeGreaterThan(120);
    expect(di2.ms).toBeGreaterThan(120);
  });

  // ── Etapa 2: play() sem exceção + contagem de osciladores ───────────────

  it("DIAG-5: play() não lança exceção síncrona para o doc completo", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const wave = emptyWave(gabcBodyHash(HAEC_DIES));
    const shaped = applyWave(pb, wave);

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    // play() NÃO deve lançar — se lançar, o teste falha com a exceção real
    expect(() => {
      player.play(shaped, vi.fn(), vi.fn());
    }).not.toThrow();
  });

  it("DIAG-6: número de osciladores == número de grupos (não de notas)", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(shaped, vi.fn(), vi.fn());

    // Cada grupo legato = 1 oscilador. Notas "full" iniciam novo grupo.
    // Contamos quantas notas têm articulation="full"
    const fullCount = shaped.notes.filter((n) => n.articulation === "full").length;
    const oscCount = fakeCtx._oscillators.length;
    expect(oscCount).toBe(fullCount);

    // Estrutura de grupos do Haec dies com seed=42:
    // 1: HAec (9 notas, sem pulsos)
    // 2: di (8 notas, 2 pulsos = di[1]+di[2] strophae)
    // 3: es, (1 nota, sem pulsos)
    // 4: quam+fe (quam=2 notas + fe=2 notas — merge porque quam[1]=f, fe[0]=h, sem repercussão)
    // 5: cit (9 notas — fe[1]=h, cit[0]=h, inter-sílaba repercussão → "full")
    // TOTAL: 5 grupos
    expect(oscCount).toBe(5);
  });

  it("DIAG-7: todos os timers (onNote) disparam — count igual ao nº de notas", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const notesFired: number[] = [];
    const onNote = vi.fn((note: TimedNote) => notesFired.push(note.idx));
    const onEnd = vi.fn();

    player.play(shaped, onNote, onEnd);
    vi.runAllTimers();

    // onNote deve disparar para CADA nota
    expect(notesFired.length).toBe(shaped.notes.length);
    // onEnd deve disparar uma vez
    expect(onEnd).toHaveBeenCalledOnce();
    // Notas devem disparar em ordem
    for (let i = 1; i < notesFired.length; i++) {
      expect(notesFired[i]).toBeGreaterThanOrEqual(notesFired[i - 1]);
    }
  });

  // ── Etapa 3: verificação de NaN / timestamp ordenado ────────────────────

  it("DIAG-8: nenhum timestamp NaN/negativo em gain.gain de nenhum oscilador", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(shaped, vi.fn(), vi.fn());

    // Para cada gain node do envelope (um por grupo):
    // timbre "voz" serial: só há gains de envelope (sem mix gains paralelos).
    // Os gains de envelope são os que conectam ao destination
    const envelopeGains = fakeCtx._gains.filter((g) =>
      (g.connect.mock.calls as unknown[][]).some((c) => c[0] === fakeCtx.destination),
    );

    for (let i = 0; i < envelopeGains.length; i++) {
      const g = envelopeGains[i];
      const { setTs, rampTs } = collectGainTs(g);
      const allTs = [...setTs, ...rampTs];

      const badTs = hasNanOrNegative(allTs);
      expect(badTs).toHaveLength(0);

      // setValueAtTime stream deve ser estritamente crescente
      const setCheck = isStrictlyIncreasing(setTs);
      expect(setCheck.ok, `gain[${i}] setValueAtTime não monotônico no idx ${setCheck.firstBadIdx}: ${setTs}`).toBe(true);

      // linearRampToValueAtTime stream deve ser estritamente crescente
      const rampCheck = isStrictlyIncreasing(rampTs);
      expect(rampCheck.ok, `gain[${i}] linearRamp não monotônico no idx ${rampCheck.firstBadIdx}: ${rampTs}`).toBe(true);
    }
  });

  it("DIAG-9: osc.start/stop têm timestamps positivos e em ordem (start < stop)", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(shaped, vi.fn(), vi.fn());

    for (let i = 0; i < fakeCtx._oscillators.length; i++) {
      const osc = fakeCtx._oscillators[i];
      const startCalls = osc.start.mock.calls as [number][];
      const stopCalls = osc.stop.mock.calls as [number][];
      expect(startCalls).toHaveLength(1);
      expect(stopCalls).toHaveLength(1);
      const startT = startCalls[0][0];
      const stopT = stopCalls[0][0];
      expect(isNaN(startT), `osc[${i}] start é NaN`).toBe(false);
      expect(isNaN(stopT), `osc[${i}] stop é NaN`).toBe(false);
      expect(startT, `osc[${i}] start < 0`).toBeGreaterThanOrEqual(0);
      expect(stopT, `osc[${i}] stop <= start`).toBeGreaterThan(startT);
    }
  });

  // ── Etapa 4: verificação específica grupo di ─────────────────────────────

  it("DIAG-10: grupo di tem 2 pulsos de gain e automation em ordem", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(shaped, vi.fn(), vi.fn());

    // Procurar o gain do grupo di: o segundo gain de envelope (HAec é o primeiro)
    const envelopeGains = fakeCtx._gains.filter((g) =>
      (g.connect.mock.calls as unknown[][]).some((c) => c[0] === fakeCtx.destination),
    );

    // Pelo menos 2 grupos: HAec e di
    expect(envelopeGains.length).toBeGreaterThanOrEqual(2);
    const diGain = envelopeGains[1]; // segundo grupo = di

    const ramps = diGain.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    // Deve ter 2 mergulhos (dip = PEAK_GAIN * PULSE_DIP) para di[1] e di[2]
    const dips = ramps.filter(([v]) => Math.abs(v - PEAK_GAIN * PULSE_DIP) < 1e-6);
    expect(dips).toHaveLength(2);

    // Verifica ordem dos timestamps no stream de ramp do grupo di
    const rampTs = ramps.map(([, t]) => t);
    const check = isStrictlyIncreasing(rampTs);
    expect(check.ok, `di group ramp não monotônico no idx ${check.firstBadIdx}: ${rampTs}`).toBe(true);
  });

  // ── Etapa 5: verificação com applyWave (fator 1 = neutro) ────────────────

  it("DIAG-11: applyWave com onda vazia não altera ms das notas", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const wave = emptyWave(gabcBodyHash(HAEC_DIES));
    const shaped = applyWave(pb, wave);

    for (let i = 0; i < pb.notes.length; i++) {
      expect(shaped.notes[i].ms).toBeCloseTo(pb.notes[i].ms, 9);
    }
  });

  // ── Etapa 6: verificação de NaN em ms das notas ─────────────────────────

  it("DIAG-12: nenhuma nota com ms NaN, zero ou negativo após pipeline completo", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    for (const note of shaped.notes) {
      expect(isNaN(note.ms), `nota idx=${note.idx} pitch=${note.pitch} ms=NaN`).toBe(false);
      expect(note.ms, `nota idx=${note.idx} pitch=${note.pitch} ms=${note.ms} ≤ 0`).toBeGreaterThan(0);
    }
  });

  // ── Etapa 7: resume de diagnóstico impresso ─────────────────────────────

  it("DIAG-INFO: imprime resumo do pipeline para inspeção manual", () => {
    const spans = syllableSpans(HAEC_DIES);
    const syls = extractAll(HAEC_DIES, spans);
    const tl = buildTimeline(syls);
    const pb = computeTimedNotes(tl, DEFAULT_PROFILE, 42, "interpretado");
    const shaped = applyWave(pb, emptyWave(gabcBodyHash(HAEC_DIES)));

    // Imprimir notas da fronteira HAec→di (notas 7-12)
    console.log("\n=== DIAG-INFO: notas fronteira HAec→di ===");
    for (let i = 7; i <= 12 && i < shaped.notes.length; i++) {
      const n = shaped.notes[i];
      const tln = tl.notes[i];
      console.log(
        `  note[${i}] pitch=${n.pitch} ms=${n.ms.toFixed(1)} artic=${n.articulation}` +
        ` syl=${n.syllableIndex} noteInSyl=${n.noteInSyllable}` +
        ` incisumIdx=${tln.incisumIndex} repercussion=${tln.repercussion}` +
        ` signs=${JSON.stringify(tln.signs)}`,
      );
    }

    // Contar grupos
    const groups: number[] = [];
    let groupId = -1;
    for (const n of shaped.notes) {
      if (n.articulation === "full") { groupId++; }
      groups.push(groupId);
    }
    console.log(`\n  Total notes: ${shaped.notes.length}, Total groups: ${groupId + 1}`);

    // Cursor acumulado até HAec→di
    let cursor = shaped.leadInMs;
    for (let i = 0; i < 9; i++) cursor += shaped.notes[i].ms + shaped.notes[i].pauseAfterMs;
    console.log(`  Cursor at di start: ${cursor.toFixed(1)}ms (~${(cursor/1000).toFixed(3)}s)`);

    // baseTime = 0.05 no player
    console.log(`  di group startSec (baseTime=0.05): ${(0.05 + cursor / 1000).toFixed(4)}s`);

    // Verificar que existe pelo menos uma nota
    expect(shaped.notes.length).toBeGreaterThan(0);
  });
});
