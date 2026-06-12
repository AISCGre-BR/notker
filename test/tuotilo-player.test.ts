/**
 * tuotilo-player.test.ts
 *
 * TDD: Player Web Audio do Tuotilo.
 * jsdom não tem AudioContext — todos os testes usam um fake AudioContext injetado
 * via ctxFactory para isolar completamente a lógica de agendamento.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlayer, pitchToFreq } from "../src/tuotilo/player";
import type { SyllableEvents } from "../src/tuotilo/duration";

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

// ── Helper: cria SyllableEvents simples ──────────────────────────────────────

function sylEvents(
  pitches: string[],
  msPerNote: number,
  pauseMs = 0,
  syllableIndex = 0,
): SyllableEvents {
  return {
    notes: pitches.map((pitch) => ({ pitch, ms: msPerNote, reattack: true })),
    pauseMs,
    syllableIndex,
  };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("pitchToFreq", () => {
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

describe("Player — agendamento de notas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Teste 1: frequência e tempos cumulativos corretos ────────────────────────
  it("1. nota agendada com frequência de pitchToFreq e start/stop em tempos cumulativos", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    // sílaba única: 1 nota de 200ms, pausa 100ms
    const events: SyllableEvents[] = [sylEvents(["g"], 200, 100, 0)];
    player.play(events, vi.fn(), vi.fn());

    expect(fakeCtx._oscillators).toHaveLength(1);
    const osc = fakeCtx._oscillators[0];

    // Oscilador deve ter recebido start com tempo = currentTime + 0.05
    const BASE = 0.05; // ctx.currentTime=0 + 0.05
    expect(osc.start).toHaveBeenCalledWith(BASE);

    // stop no fim nominal: BASE + 200/1000 = BASE + 0.2
    expect(osc.stop).toHaveBeenCalledWith(BASE + 0.2);

    // frequency.setValueAtTime com pitchToFreq("g")
    const expectedFreq = pitchToFreq("g");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(expectedFreq, BASE);
  });

  // ── Teste 1b: pausa acumula no tempo da próxima nota ─────────────────────────
  it("1b. pausa entre sílabas acumula no tempo de start da próxima sílaba", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    // sílaba 0: nota 200ms + pausa 100ms; sílaba 1: nota 150ms
    const events: SyllableEvents[] = [
      sylEvents(["g"], 200, 100, 0),
      sylEvents(["h"], 150, 0, 1),
    ];
    player.play(events, vi.fn(), vi.fn());

    expect(fakeCtx._oscillators).toHaveLength(2);
    const BASE = 0.05;
    const osc0 = fakeCtx._oscillators[0];
    const osc1 = fakeCtx._oscillators[1];

    expect(osc0.start).toHaveBeenCalledWith(BASE);
    // nota 1 começa em BASE + 200ms + 100ms (pausa) = BASE + 0.3
    expect(osc1.start).toHaveBeenCalledWith(expect.closeTo(BASE + 0.3, 9));
  });

  // ── Teste 2: cada nota cria oscillator+gain novos (re-ataque) ────────────────
  it("2. CADA nota cria oscillator+gain NOVOS (n notas → n osciladores)", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    // 3 notas na mesma sílaba
    const events: SyllableEvents[] = [sylEvents(["f", "g", "h"], 100, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    expect(fakeCtx._oscillators).toHaveLength(3);
    expect(fakeCtx._gains).toHaveLength(3);

    // cada oscilador deve ser objeto distinto
    const unique = new Set(fakeCtx._oscillators);
    expect(unique.size).toBe(3);
  });

  it("2. mesmo pitch em sequência → dois osciladores distintos (f,f)", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const events: SyllableEvents[] = [sylEvents(["f", "f"], 100, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    expect(fakeCtx._oscillators).toHaveLength(2);
    expect(fakeCtx._oscillators[0]).not.toBe(fakeCtx._oscillators[1]);
  });

  // ── Teste 2b: cadeia de conexão osc → filter → gain → destination ────────────
  it("2b. cadeia de conexão: osc.connect(filter), filter.connect(gain), gain.connect(destination)", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const events: SyllableEvents[] = [sylEvents(["g"], 200, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    const osc    = fakeCtx._oscillators[0];
    const filter = fakeCtx._filters[0];
    const gain   = fakeCtx._gains[0];

    // osc → filter
    expect(osc.connect).toHaveBeenCalledWith(filter);
    // filter → gain
    expect(filter.connect).toHaveBeenCalledWith(gain);
    // gain → destination
    expect(gain.connect).toHaveBeenCalledWith(fakeCtx.destination);
  });

  // ── Teste 3: release termina ANTES do fim nominal (gap nominal 22ms) ─────────
  it("3. release termina antes do fim nominal da nota (gap nominal = 22ms)", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const NOTE_MS = 300;
    const events: SyllableEvents[] = [sylEvents(["g"], NOTE_MS, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    const gainNode = fakeCtx._gains[0];
    // linearRampToValueAtTime(0, t) — o último ramp deve ser para 0
    const rampCalls = gainNode.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    const rampToZero = rampCalls.find(([val]) => val === 0);
    expect(rampToZero).toBeDefined();

    if (rampToZero) {
      const releaseEndSec = rampToZero[1];
      const BASE = 0.05;
      const nominalEndSec = BASE + NOTE_MS / 1000;
      // gap nominal = GAP_MS (22ms); tolerância de ±0.5ms (3 casas decimais)
      expect(nominalEndSec - releaseEndSec).toBeCloseTo(0.022, 3);
    }
  });

  // ── Teste 3c: nota curta (30ms) — automação do gain em ordem crescente ────────
  it("3c. nota de 30ms → todos os timestamps de automação do gain em ordem estritamente crescente", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const events: SyllableEvents[] = [sylEvents(["g"], 30, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    const gainNode = fakeCtx._gains[0];
    // Coleta todos os timestamps: setValueAtTime + linearRampToValueAtTime
    const setCalls = gainNode.gain.setValueAtTime.mock.calls as [number, number][];
    const rampCalls = gainNode.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    const timestamps: number[] = [
      ...setCalls.map(([, t]) => t),
      ...rampCalls.map(([, t]) => t),
    ];

    // Deve haver ao menos 3 eventos de automação (setValueAtTime(0), ramp→peak, ramp→0)
    expect(timestamps.length).toBeGreaterThanOrEqual(3);

    // Todos os timestamps devem estar em ordem estritamente crescente
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  it("3b. com duas notas: release da nota 0 termina antes do start da nota 1", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const NOTE_MS = 200;
    const events: SyllableEvents[] = [sylEvents(["f", "f"], NOTE_MS, 0, 0)];
    player.play(events, vi.fn(), vi.fn());

    const BASE = 0.05;
    const startNota1 = BASE + NOTE_MS / 1000; // início da nota 1

    const gain0 = fakeCtx._gains[0];
    const rampCalls = gain0.gain.linearRampToValueAtTime.mock.calls as [number, number][];
    const rampToZero = rampCalls.find(([val]) => val === 0);
    expect(rampToZero).toBeDefined();
    if (rampToZero) {
      expect(rampToZero[1]).toBeLessThan(startNota1);
    }
  });

  // ── Teste 4: stop() cancela timers, fecha ctx, playing=false ─────────────────
  it("4. stop() cancela timers e fecha ctx; playing=false", () => {
    let fakeCtx!: FakeCtx;
    const player = createPlayer(() => {
      fakeCtx = makeFakeCtx(0);
      return fakeCtx as unknown as AudioContext;
    });

    const onSyllable = vi.fn();
    const onEnd = vi.fn();

    // 2 sílabas com notas e pausas grandes para timers ficarem pendentes
    const events: SyllableEvents[] = [
      sylEvents(["g"], 500, 200, 0),
      sylEvents(["h"], 500, 200, 1),
    ];
    player.play(events, onSyllable, onEnd);
    expect(player.playing).toBe(true);

    player.stop();
    expect(player.playing).toBe(false);
    expect(fakeCtx.close).toHaveBeenCalledOnce();

    // avança todos os timers — callbacks NÃO devem ser chamados após stop
    vi.runAllTimers();
    expect(onSyllable).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  // ── Teste 5: onSyllable e onEnd disparados na ordem correta ──────────────────
  it("5. onSyllable disparado por sílaba na ordem; onEnd ao final", () => {
    const player = createPlayer(() => {
      return makeFakeCtx(0) as unknown as AudioContext;
    });

    const order: string[] = [];
    const onSyllable = vi.fn((i: number) => order.push(`syl${i}`));
    const onEnd = vi.fn(() => order.push("end"));

    // 3 sílabas
    const events: SyllableEvents[] = [
      sylEvents(["g"], 100, 50, 0),
      sylEvents(["h"], 120, 30, 1),
      sylEvents(["f"], 80, 0, 2),
    ];
    player.play(events, onSyllable, onEnd);

    // Antes de avançar timers — nada disparado ainda
    expect(onSyllable).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();

    // Avança todos os timers pendentes
    vi.runAllTimers();

    expect(onSyllable).toHaveBeenCalledTimes(3);
    expect(onSyllable).toHaveBeenNthCalledWith(1, 0);
    expect(onSyllable).toHaveBeenNthCalledWith(2, 1);
    expect(onSyllable).toHaveBeenNthCalledWith(3, 2);
    expect(onEnd).toHaveBeenCalledOnce();

    // sílabas devem preceder o end
    expect(order).toEqual(["syl0", "syl1", "syl2", "end"]);
  });

  it("5b. onSyllable da sílaba 1 é chamado DEPOIS de onSyllable da sílaba 0", () => {
    const player = createPlayer(() => {
      return makeFakeCtx(0) as unknown as AudioContext;
    });

    const calls: number[] = [];
    const onSyllable = vi.fn((i: number) => calls.push(i));

    const events: SyllableEvents[] = [
      sylEvents(["g"], 100, 50, 0),
      sylEvents(["h"], 100, 0, 1),
    ];
    player.play(events, onSyllable, vi.fn());

    // Avança apenas até o tempo da sílaba 1 (mas não além de 150ms)
    vi.advanceTimersByTime(100);
    // só sílaba 0 no offset=0
    expect(calls).toEqual([0]);

    vi.advanceTimersByTime(200);
    expect(calls).toEqual([0, 1]);
  });

  // ── Teste extra: re-play implícito (play() com playing=true) ─────────────────
  it("play() com playing=true faz stop() implícito antes", () => {
    let ctx1!: FakeCtx;
    let ctx2!: FakeCtx;
    let callCount = 0;

    const player = createPlayer(() => {
      callCount++;
      if (callCount === 1) {
        ctx1 = makeFakeCtx(0);
        return ctx1 as unknown as AudioContext;
      }
      ctx2 = makeFakeCtx(0);
      return ctx2 as unknown as AudioContext;
    });

    const events: SyllableEvents[] = [sylEvents(["g"], 1000, 0, 0)];
    player.play(events, vi.fn(), vi.fn());
    expect(player.playing).toBe(true);

    // segundo play: deve fechar ctx1 e criar ctx2
    player.play(events, vi.fn(), vi.fn());
    expect(ctx1.close).toHaveBeenCalledOnce();
    expect(player.playing).toBe(true);
  });
});
