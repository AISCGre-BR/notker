/**
 * tuotilo-player.test.ts
 *
 * TDD: Player Web Audio do Tuotilo v2 — grupos legato.
 * jsdom não tem AudioContext — todos os testes usam um fake AudioContext injetado
 * via ctxFactory para isolar completamente a lógica de agendamento.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlayer, pitchToFreq, PEAK_GAIN, PULSE_DIP } from "../src/tuotilo/player";
import type { SynthTimbre } from "../src/tuotilo/player";
import type { TimedNote, TimedPlayback, Articulation } from "../src/tuotilo/duration";

// ── Fake AudioContext ─────────────────────────────────────────────────────────

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

interface FakeCtx {
  currentTime: number;
  destination: Record<string, never>;
  close: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  _oscillators: FakeNode[];
  _gains: FakeNode[];
  _filters: FakeBiquadNode[];
}

function fakeAudioParam(): FakeAudioParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function makeFakeCtx(currentTime = 0): FakeCtx {
  const ctx: FakeCtx = {
    currentTime,
    destination: {},
    close: vi.fn(),
    _oscillators: [],
    _gains: [],
    _filters: [],
    createOscillator: vi.fn(() => {
      const osc: FakeNode = {
        type: "triangle",
        frequency: fakeAudioParam(),
        gain: fakeAudioParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      ctx._oscillators.push(osc);
      return osc;
    }),
    createBiquadFilter: vi.fn(() => {
      const f: FakeBiquadNode = {
        type: "lowpass",
        frequency: fakeAudioParam(),
        gain: fakeAudioParam(),
        Q: fakeAudioParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      ctx._filters.push(f);
      return f;
    }),
    createGain: vi.fn(() => {
      const g: FakeNode = {
        frequency: fakeAudioParam(),
        gain: fakeAudioParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      ctx._gains.push(g);
      return g;
    }),
  };
  return ctx;
}

// ── Helpers de construção de TimedNote / TimedPlayback ────────────────────────

function tn(partial: Partial<TimedNote> & { pitch: string; ms: number }): TimedNote {
  return { idx: 0, pauseAfterMs: 0, articulation: "full" as Articulation, syllableIndex: 0, noteInSyllable: 0, alt: 0, ...partial };
}
function pb(notes: TimedNote[], leadInMs = 0): TimedPlayback {
  return { notes: notes.map((n, i) => ({ ...n, idx: i })), leadInMs };
}

// ── Testes: pitchToFreq ───────────────────────────────────────────────────────

describe("pitchToFreq", () => {
  it("6b. alt: −1/+1 semitom desloca a frequência por fator 2^(±1/12)", () => {
    const f = pitchToFreq("g");
    expect(pitchToFreq("g", -1)).toBeCloseTo(f / Math.pow(2, 1 / 12), 6);
    expect(pitchToFreq("g", 1)).toBeCloseTo(f * Math.pow(2, 1 / 12), 6);
  });

  it("6. monotônica crescente em a..m", () => {
    const letters = "abcdefghijklm".split("");
    const freqs = letters.map(pitchToFreq);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });

  it("6. frequências dentro de ~150–1200 Hz para a..m", () => {
    const letters = "abcdefghijklm".split("");
    for (const l of letters) {
      const f = pitchToFreq(l);
      expect(f).toBeGreaterThanOrEqual(150);
      expect(f).toBeLessThanOrEqual(1200);
    }
  });

  it("6. pitch inválido retorna fallback sem crash", () => {
    expect(() => pitchToFreq("z")).not.toThrow();
  });
});

// ── Testes: Player v2 — grupos legato ────────────────────────────────────────

describe("Player v2 — grupos legato", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function makePlayer(timbre: SynthTimbre = "flauta") {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    }, timbre);
    return { player, ctx: () => fakeCtx };
  }
  const BASE = 0.05;

  it("P1. legato: 3 notas articulation=[full,legato,legato] → 1 oscilador, 3 setValueAtTime de frequência", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 200 }),
      tn({ pitch: "g", ms: 150, articulation: "legato" }),
      tn({ pitch: "h", ms: 100, articulation: "legato" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(1);
    const osc = ctx()._oscillators[0];
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledTimes(3);
    expect(osc.frequency.setValueAtTime).toHaveBeenNthCalledWith(1, pitchToFreq("f"), BASE);
    expect(osc.frequency.setValueAtTime).toHaveBeenNthCalledWith(2, pitchToFreq("g"), expect.closeTo(BASE + 0.2, 9));
    expect(osc.frequency.setValueAtTime).toHaveBeenNthCalledWith(3, pitchToFreq("h"), expect.closeTo(BASE + 0.35, 9));
    // grupo cobre o total: stop no fim da última nota
    expect(osc.stop).toHaveBeenCalledWith(expect.closeTo(BASE + 0.45, 9));
  });

  it("P2. REGRA SAGRADA: articulation=full no meio (repercussão) → 2 osciladores", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 200 }),
      tn({ pitch: "f", ms: 200, articulation: "full" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(2);
    expect(ctx()._oscillators[0]).not.toBe(ctx()._oscillators[1]);
  });

  it("P3. solfejo (todas articulation=full) → n osciladores, comportamento v1", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 100 }), tn({ pitch: "g", ms: 100 }), tn({ pitch: "h", ms: 100 }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(3);
    expect(ctx()._gains).toHaveLength(3);
  });

  it("P4. envelope do grupo: release termina GAP_MS antes do fim do GRUPO", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 300 }),
      tn({ pitch: "g", ms: 300, articulation: "legato" }),
    ]), vi.fn(), vi.fn());
    const gain = ctx()._gains[0];
    const ramps = gain.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    const toZero = ramps.find(([v]) => v === 0);
    expect(toZero).toBeDefined();
    const nominalEnd = BASE + 0.6;
    expect(nominalEnd - toZero![1]).toBeCloseTo(0.022, 3);
  });

  it("P4b. grupo curto (30ms): automação do gain em ordem estritamente crescente", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([tn({ pitch: "g", ms: 30 })]), vi.fn(), vi.fn());
    const gain = ctx()._gains[0];
    const ts = [
      ...(gain.gain.setValueAtTime.mock.calls as [number, number][]).map(([, t]) => t),
      ...(gain.gain.linearRampToValueAtTime.mock.calls as [number, number][]).map(([, t]) => t),
    ];
    expect(ts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });

  it("P5. pauseAfterMs desloca o que vem depois; leadInMs desloca tudo", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 200, pauseAfterMs: 100 }),
      tn({ pitch: "g", ms: 100 }),
    ], 50), vi.fn(), vi.fn());
    const osc1 = ctx()._oscillators[1];
    // start = BASE + (50 + 200 + 100)/1000
    expect(osc1.start).toHaveBeenCalledWith(expect.closeTo(BASE + 0.35, 9));
  });

  it("P6. onNote por NOTA na ordem (timers lógicos); onEnd ao final", () => {
    const { player } = makePlayer();
    const order: number[] = [];
    const onNote = vi.fn((n: TimedNote) => order.push(n.idx));
    const onEnd = vi.fn();
    player.play(pb([
      tn({ pitch: "f", ms: 100 }),
      tn({ pitch: "g", ms: 100, articulation: "legato" }),
      tn({ pitch: "h", ms: 100 }),
    ]), onNote, onEnd);
    vi.runAllTimers();
    expect(order).toEqual([0, 1, 2]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("P7. stop() cancela timers e fecha ctx; callbacks não disparam depois", () => {
    const { player, ctx } = makePlayer();
    const onNote = vi.fn();
    const onEnd = vi.fn();
    player.play(pb([tn({ pitch: "f", ms: 500 })]), onNote, onEnd);
    expect(player.playing).toBe(true);
    player.stop();
    expect(player.playing).toBe(false);
    expect(ctx().close).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(onNote).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("P8. cadeia de conexão: osc → filter → gain → destination", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([tn({ pitch: "g", ms: 200 })]), vi.fn(), vi.fn());
    const osc = ctx()._oscillators[0];
    const filter = ctx()._filters[0];
    const gain = ctx()._gains[0];
    expect(osc.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx().destination);
  });

  it("P9. play() com playing=true faz stop() implícito (fecha o ctx anterior)", () => {
    let ctx1!: FakeCtx;
    let calls = 0;
    const player = createPlayer(() => {
      calls++;
      const c = makeFakeCtx(0);
      if (calls === 1) ctx1 = c;
      return c as unknown as AudioContext;
    });
    player.play(pb([tn({ pitch: "g", ms: 1000 })]), vi.fn(), vi.fn());
    expect(player.playing).toBe(true);
    player.play(pb([tn({ pitch: "h", ms: 1000 })]), vi.fn(), vi.fn());
    expect(ctx1.close).toHaveBeenCalledOnce();
    expect(player.playing).toBe(true);
  });

  it("P10. pauseAfterMs fecha o grupo MESMO com articulation=legato na nota seguinte", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 200, pauseAfterMs: 100 }),
      tn({ pitch: "g", ms: 100, articulation: "legato" }),
    ]), vi.fn(), vi.fn());
    // dois grupos: a pausa força current=null mesmo sem articulation=full
    expect(ctx()._oscillators).toHaveLength(2);
    expect(ctx()._oscillators[1].start).toHaveBeenCalledWith(expect.closeTo(0.05 + 0.3, 9));
  });

  it("P11. tristropha: 3 notas [full,pulse,pulse] → 1 oscilador com 2 mergulhos de gain", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 300 }),
      tn({ pitch: "f", ms: 300, articulation: "pulse" }),
      tn({ pitch: "f", ms: 300, articulation: "pulse" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(1);
    const gain = ctx()._gains[0];
    const ramps = gain.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    // 2 mergulhos para PEAK_GAIN×PULSE_DIP — valores exportados pelo player
    const dips = ramps.filter(([v]) => Math.abs(v - PEAK_GAIN * PULSE_DIP) < 1e-9);
    expect(dips).toHaveLength(2);
    // fronteiras corretas: BASE+0.3 e BASE+0.6
    expect(dips[0][1]).toBeCloseTo(0.05 + 0.3, 9);
    expect(dips[1][1]).toBeCloseTo(0.05 + 0.6, 9);
    // cada fluxo de automação é cronologicamente não-decrescente
    // (setValueAtTime e ramps são streams separados nos mocks — verificar cada um)
    const setTs = (gain.gain.setValueAtTime.mock.calls as [number, number][]).map(([, t]) => t);
    const rampTs = ramps.map(([, t]) => t);
    for (let i = 1; i < setTs.length; i++) expect(setTs[i]).toBeGreaterThan(setTs[i - 1]);
    for (let i = 1; i < rampTs.length; i++) expect(rampTs[i]).toBeGreaterThan(rampTs[i - 1]);
  });

  it("P12. REGRA SAGRADA: pulso que não cabe (nota curta) vira re-ataque pleno (2 osciladores)", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 40 }),
      tn({ pitch: "f", ms: 40, articulation: "pulse" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(2);
  });

  it("P12b. caso-limite exato (46ms+120ms) recua a re-ataque pleno (folga estrita)", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 46 }),
      tn({ pitch: "f", ms: 120, articulation: "pulse" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(2);
  });

  it("P13. pulse não quebra o pitch em degrau das notas legato seguintes", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([
      tn({ pitch: "f", ms: 300 }),
      tn({ pitch: "f", ms: 300, articulation: "pulse" }),
      tn({ pitch: "g", ms: 300, articulation: "legato" }),
    ]), vi.fn(), vi.fn());
    expect(ctx()._oscillators).toHaveLength(1);
    const osc = ctx()._oscillators[0];
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledTimes(3);
  });

  it("P14. nota com alt=-1 agenda freq bemolizada", () => {
    const { player, ctx } = makePlayer();
    player.play(pb([tn({ pitch: "g", ms: 200, alt: -1 })]), vi.fn(), vi.fn());
    const osc = ctx()._oscillators[0];
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
      pitchToFreq("g", -1), expect.any(Number));
  });
});

// ── Testes: Player — timbres ──────────────────────────────────────────────────

describe("Player — timbres", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("TB1. default 'voz': triangle + 2 formantes bandpass (F1≈710, F2≈1180)", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(pb([tn({ pitch: "g", ms: 300 })]), vi.fn(), vi.fn());
    const osc = fakeCtx._oscillators[0];
    expect(osc.type).toBe("triangle");
    const bandpass = fakeCtx._filters.filter((f) => f.type === "bandpass");
    expect(bandpass.length).toBeGreaterThanOrEqual(2);
    const freqs = bandpass.map((f) =>
      (f.frequency.setValueAtTime.mock.calls as [number, number][])[0]?.[0],
    );
    expect(freqs).toContain(710);
    expect(freqs).toContain(1180);
  });

  it("TB2. timbre 'flauta': cadeia legada triangle → lowpass 1200", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    }, "flauta");
    player.play(pb([tn({ pitch: "g", ms: 300 })]), vi.fn(), vi.fn());
    const osc = fakeCtx._oscillators[0];
    expect(osc.type).toBe("triangle");
    const lp = fakeCtx._filters.find((f) => f.type === "lowpass");
    expect(lp).toBeDefined();
    expect(lp!.frequency.setValueAtTime).toHaveBeenCalledWith(1200, expect.any(Number));
  });

  it("TB3. 'voz': envelope (gain final) continua ligado ao destination", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });
    player.play(pb([tn({ pitch: "g", ms: 300 })]), vi.fn(), vi.fn());
    const connectedToDest = fakeCtx._gains.some((g) =>
      (g.connect.mock.calls as unknown[][]).some((c) => c[0] === fakeCtx.destination),
    );
    expect(connectedToDest).toBe(true);
  });
});
