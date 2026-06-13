/**
 * player.ts — Player Web Audio do Tuotilo v2 (grupos legato por incisum).
 *
 * Modelo de agendamento:
 *   - Notas consecutivas com articulation="legato" formam um GRUPO LEGATO: 1 oscilador,
 *     pitch muda em degrau via frequency.setValueAtTime nas fronteiras de nota,
 *     envelope único cobre todo o grupo.
 *   - articulation="full" sempre cria um oscilador NOVO (repercussão sagrada do projeto:
 *     distropha/tristropha/bis-punctum são re-articulações explícitas, nunca fundir).
 *   - articulation="pulse" = repercussão intra-sílaba: continuidade + pulso de gain (B1.2).
 *     Fallback sagrado: pulso inviável (notas curtas) → re-ataque pleno.
 *   - Divisio (pauseAfterMs > 0) também quebra o grupo (cursor recomeça sem carry).
 *
 * Envelope por GRUPO (D2):
 *   ataque  18ms: 0 → 0.8 (linearRamp)
 *   sustain  até release point
 *   release 70ms: → 0  terminando 22ms ANTES do fim do GRUPO (gap de re-ataque)
 */

import { staffOffset } from "../gabc/gabc-pitch";
import type { TimedNote, TimedPlayback } from "./duration";

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

export function pitchToFreq(pitch: string, alt = 0): number {
  const offset = staffOffset(pitch);
  if (Number.isNaN(offset)) return A3_HZ; // fallback

  // Divide o offset em oitava diatônica e grau dentro da oitava
  const octave = Math.floor(offset / 7);
  const degree = offset % 7;
  const semitones = octave * 12 + MAJOR_SEMITONES[degree] + alt;
  return A3_HZ * Math.pow(2, semitones / 12);
}

// ── Constantes de envelope ────────────────────────────────────────────────────

const ATTACK_MS   = 18;   // 0 → 0.8 via linearRamp
const RELEASE_MS  = 70;   // → 0 via linearRamp
const GAP_MS      = 22;   // gap antes do fim nominal do GRUPO (re-ataque audível)
export const PEAK_GAIN  = 0.8;
export const PULSE_DIP  = 0.34;  // nível do mergulho na repercussão (× PEAK_GAIN)
export const PULSE_MS   = 56;    // duração total do mergulho vai-e-volta (ms)

// ── Presets de timbre ─────────────────────────────────────────────────────────

/** Timbres do sintetizador (B1.3): "voz" = triangle + formantes (vogal "ah");
 *  "flauta" = triangle + lowpass (timbre da v1/v2). Decisão final por UAT. */
export type SynthTimbre = "voz" | "flauta";

// "voz": caminho SERIAL (WebKit-safe) — sem fan-out paralelo. Parâmetros expostos
// p/ o mixer (B2b). Formante "ah" via filtro peaking (mantém o fundamental).
export const VOZ_FORMANT_HZ = 900;   // realce de formante "ah"
export const VOZ_FORMANT_Q  = 1.0;
export const VOZ_PEAK_DB     = 6;    // ganho do peaking (dB)
export const VOZ_SHAPE_K     = 2.2;  // intensidade da curva de harmônicos
const VOZ_CURVE = makeVozCurve(VOZ_SHAPE_K);

/** Curva suave (tanh) p/ adicionar harmônicos ao triângulo. Determinística. */
function makeVozCurve(k: number): Float32Array<ArrayBuffer> {
  const N = 1024;
  const c = new Float32Array(new ArrayBuffer(N * 4));
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x);
  }
  return c;
}

// ── Grupo legato ──────────────────────────────────────────────────────────────

interface GroupNote { freq: number; atMs: number; durMs: number; pulse: boolean; }

/** Agenda um grupo legato: 1 oscilador, pitch em degrau nas fronteiras de nota,
 *  envelope único no grupo (D2). Grupos de 1 nota reproduzem o envelope v1.
 *  Notas com pulse=true recebem mergulho de volume na fronteira (B1.2).
 *  O parâmetro timbre define a cadeia de síntese (fonte + filtros). */
function scheduleGroup(ctx: AudioContext, baseTime: number, notes: GroupNote[], timbre: SynthTimbre): void {
  const first = notes[0];
  const last = notes[notes.length - 1];
  const startSec = baseTime + first.atMs / 1000;
  const endSec = baseTime + (last.atMs + last.durMs) / 1000;
  const attackEndSec = startSec + ATTACK_MS / 1000;
  const releaseSec = endSec - (GAP_MS + RELEASE_MS) / 1000;

  const osc = ctx.createOscillator();
  for (const n of notes) osc.frequency.setValueAtTime(n.freq, baseTime + n.atMs / 1000);

  const gain = ctx.createGain(); // envelope do grupo (ataque/pulsos/release)

  if (timbre === "flauta") {
    osc.type = "triangle";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, startSec);
    osc.connect(filter);
    filter.connect(gain);
  } else {
    // "voz": triangle → waveshaper (corpo vocálico) → peaking (formante "ah") → gain
    // Caminho serial único: elimina o fan-out de 3 biquad+gain que travava o WebKit
    // na transição HAec→di (UAT 2026-06-12/13).
    osc.type = "triangle";
    const shaper = ctx.createWaveShaper();
    shaper.curve = VOZ_CURVE;
    shaper.oversample = "2x";
    const formant = ctx.createBiquadFilter();
    formant.type = "peaking";
    formant.frequency.setValueAtTime(VOZ_FORMANT_HZ, startSec);
    formant.Q.setValueAtTime(VOZ_FORMANT_Q, startSec);
    formant.gain.setValueAtTime(VOZ_PEAK_DB, startSec);
    osc.connect(shaper);
    shaper.connect(formant);
    formant.connect(gain);
  }

  // Envelope: ataque + pulsos + release — IGUAL para os dois timbres.
  gain.gain.setValueAtTime(0, startSec);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, attackEndSec);

  // Pulsos de repercussão intra-sílaba (B1.2): mergulho de volume na
  // fronteira de cada nota `pulse` — som contínuo, rearticulação audível.
  // Emitidos em ordem cronológica crescente ANTES das linhas de release
  // (garantido pelo pulseFits que assegura tSec ± PULSE_MS/2000 dentro do grupo).
  for (const n of notes) {
    if (!n.pulse) continue;
    const tSec = baseTime + n.atMs / 1000;
    gain.gain.setValueAtTime(PEAK_GAIN, tSec - PULSE_MS / 2000);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN * PULSE_DIP, tSec);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, tSec + PULSE_MS / 2000);
  }

  // Release emitido DEPOIS dos pulsos para garantir ordem cronológica no stream
  if (releaseSec > attackEndSec) gain.gain.setValueAtTime(PEAK_GAIN, releaseSec);
  const releaseEndSec = Math.max(releaseSec + RELEASE_MS / 1000, attackEndSec + 0.001);
  gain.gain.linearRampToValueAtTime(0, releaseEndSec);

  gain.connect(ctx.destination);
  osc.start(startSec);
  osc.stop(endSec);
}

// ── API pública ───────────────────────────────────────────────────────────────

export interface Player {
  play(playback: TimedPlayback, onNote: (note: TimedNote) => void, onEnd: () => void): void;
  stop(): void;
  readonly playing: boolean;
}

export function createPlayer(ctxFactory: () => AudioContext, timbre: SynthTimbre = "voz"): Player {
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

  return {
    get playing(): boolean {
      return _playing;
    },

    stop(): void {
      stopInternal();
    },

    play(playback, onNote, onEnd) {
      if (_playing) stopInternal();
      _ctx = ctxFactory();
      _playing = true;
      const ctx = _ctx;
      const baseTime = ctx.currentTime + 0.05;

      let cursor = playback.leadInMs; // acumulador em ms
      const groups: GroupNote[][] = [];
      let current: GroupNote[] | null = null;
      for (const note of playback.notes) {
        const prev = current !== null && current.length > 0 ? current[current.length - 1] : null;
        // Pulso só cabe se as duas notas comportam o vai-e-volta do gain
        // SEM violar a ordem da automação (ataque no início do grupo e
        // release no fim). Não coube → re-ataque pleno (regra sagrada).
        // Folga estrita (>): no caso-limite exato, mergulho e release coincidiriam
        // no mesmo timestamp — limite estrito garante folga audível entre eles.
        const pulseFits =
          note.articulation === "pulse" &&
          prev !== null &&
          prev.durMs > ATTACK_MS + PULSE_MS / 2 &&
          note.ms > GAP_MS + RELEASE_MS + PULSE_MS / 2;
        const startsGroup =
          current === null ||
          note.articulation === "full" ||
          (note.articulation === "pulse" && !pulseFits);
        if (startsGroup) {
          current = [];
          groups.push(current);
        }
        current!.push({
          freq: pitchToFreq(note.pitch, note.alt),
          atMs: cursor,
          durMs: note.ms,
          pulse: !startsGroup && note.articulation === "pulse",
        });
        const t = setTimeout(() => onNote(note), cursor);
        _timers.push(t);
        cursor += note.ms;
        if (note.pauseAfterMs > 0) {
          cursor += note.pauseAfterMs;
          current = null; // divisio: próximo grupo recomeça mesmo sem articulation=full
        }
      }
      for (const g of groups) scheduleGroup(ctx, baseTime, g, timbre);
      const endTimer = setTimeout(() => { _playing = false; onEnd(); }, cursor);
      _timers.push(endTimer);
    },
  };
}
