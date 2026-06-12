/**
 * player.ts — Player Web Audio do Tuotilo.
 *
 * Sintetiza SyllableEvents[] via Web Audio API (uma voz, oscilador triangle).
 * Regra do projeto: NUNCA ligar notas de mesmo pitch num gain contínuo —
 * cada nota cria seu próprio OscillatorNode+GainNode (re-ataque explícito,
 * repercussão audível em distropha/tristropha/bis-punctum).
 *
 * Envelope ADSR simplificado por nota:
 *   attack  18ms: 0 → 0.8 (linearRamp)
 *   sustain  até release point
 *   release 70ms: → 0  terminando 22ms ANTES do fim nominal (gap de re-ataque)
 */

import { staffOffset } from "../gabc/gabc-pitch";
import type { SyllableEvents } from "./duration";

// ── Pitch → Frequência ────────────────────────────────────────────────────────

/**
 * pitchToFreq: dó-móvel simplificado v1, sem modos.
 *
 * Modelo: letras gabc a..m = 13 posições diatônicas fixas na pauta.
 * staffOffset retorna 0..12 (a=0, m=12).
 *
 * Referência tonal: A3 = 220 Hz. O gabc usa letra 'a' como posição mais baixa.
 * A sequência de semitons da escala maior (Dó maior) a partir de A3:
 *   grau 0 (a) = A3 = 220 Hz  →  semitons da escala maior: 0,2,4,5,7,9,11 (×oitavas)
 *
 * Observação: o gabc real usa clave para definir qual posição é Dó, mas v1
 * trata o offset diretamente como grau diatônico da escala maior (sem clave).
 * Isso garante oitavas plausíveis (a..m: ~220–880 Hz) e monotônica crescente.
 */
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // semitons dos 7 graus diatônicos
const A3_HZ = 220;

export function pitchToFreq(pitch: string): number {
  const offset = staffOffset(pitch);
  if (Number.isNaN(offset)) return A3_HZ; // fallback

  // Divide o offset em oitava diatônica e grau dentro da oitava
  const octave = Math.floor(offset / 7);
  const degree = offset % 7;
  const semitones = octave * 12 + MAJOR_SEMITONES[degree];
  return A3_HZ * Math.pow(2, semitones / 12);
}

// ── Constantes de envelope ────────────────────────────────────────────────────

const ATTACK_MS   = 18;   // 0 → 0.8 via linearRamp
const RELEASE_MS  = 70;   // → 0 via linearRamp
const GAP_MS      = 22;   // gap antes do fim nominal (re-ataque audível)
const PEAK_GAIN   = 0.8;

// ── API pública ───────────────────────────────────────────────────────────────

export interface Player {
  play(
    events: SyllableEvents[],
    onSyllable: (i: number) => void,
    onEnd: () => void,
  ): void;
  stop(): void;
  readonly playing: boolean;
}

export function createPlayer(ctxFactory: () => AudioContext): Player {
  let _playing = false;
  let _ctx: AudioContext | null = null;
  let _timers: ReturnType<typeof setTimeout>[] = [];

  function stopInternal(): void {
    // Cancela todos os timers pendentes
    for (const t of _timers) clearTimeout(t);
    _timers = [];
    // Fecha o contexto de áudio (descarta recursos)
    if (_ctx !== null) {
      _ctx.close();
      _ctx = null;
    }
    _playing = false;
  }

  function scheduleNote(
    ctx: AudioContext,
    freq: number,
    startSec: number,
    durationMs: number,
  ): void {
    const endSec      = startSec + durationMs / 1000;
    const releaseSec  = endSec - (GAP_MS + RELEASE_MS) / 1000;
    const attackEndSec = startSec + ATTACK_MS / 1000;

    // Oscilador triangle → filtro lowpass → gain → destination
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startSec);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, startSec);

    const gain = ctx.createGain();
    // Inicia em 0
    gain.gain.setValueAtTime(0, startSec);
    // Attack: 0 → PEAK_GAIN em 18ms
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, attackEndSec);
    // Sustain até release point (ganho constante — não precisa de setValueAtTime explícito)
    // Release: PEAK_GAIN → 0 em 70ms, terminando 22ms antes do fim nominal
    if (releaseSec > attackEndSec) {
      gain.gain.setValueAtTime(PEAK_GAIN, releaseSec);
    }
    // Guard de nota curta: garante que o ramp→0 nunca fique ANTES do fim do attack.
    // Para notas < 40ms, releaseSec + RELEASE_MS/1000 pode ser menor que attackEndSec,
    // colocando eventos AudioParam fora de ordem (comportamento indefinido na Web Audio API).
    const releaseEndSec = Math.max(
      releaseSec + RELEASE_MS / 1000,
      attackEndSec + 0.001,
    );
    gain.gain.linearRampToValueAtTime(0, releaseEndSec);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startSec);
    osc.stop(endSec);
  }

  return {
    get playing(): boolean {
      return _playing;
    },

    stop(): void {
      stopInternal();
    },

    play(
      events: SyllableEvents[],
      onSyllable: (i: number) => void,
      onEnd: () => void,
    ): void {
      // Re-play seguro: para tudo antes de recomeçar
      if (_playing) stopInternal();

      _ctx = ctxFactory();
      _playing = true;
      const ctx = _ctx;

      // Tempo de início com margem de 50ms (= pré-fire da UI).
      // onSyllable dispara no cursor lógico (setTimeout com delay=cursor ms),
      // que é 50ms ANTES do áudio real de cada sílaba (pre-fire para UI).
      const baseTime = ctx.currentTime + 0.05;
      let cursor = 0; // acumulador em ms

      for (const syl of events) {
        // Agenda callback onSyllable no início da sílaba
        const sylTimer = setTimeout(
          () => onSyllable(syl.syllableIndex),
          cursor,
        );
        _timers.push(sylTimer);

        // Agenda cada nota da sílaba sequencialmente
        for (const note of syl.notes) {
          scheduleNote(ctx, pitchToFreq(note.pitch), baseTime + cursor / 1000, note.ms);
          cursor += note.ms;
        }

        // Pausa pós-sílaba
        cursor += syl.pauseMs;
      }

      // Callback onEnd após o fim total
      const endTimer = setTimeout(() => {
        _playing = false;
        onEnd();
      }, cursor);
      _timers.push(endTimer);
    },
  };
}
