/** wave.ts — Overlay da onda de interpretação (spec §7/D4). Módulo PURO.
 *  O usuário ajusta fatores multiplicativos POR NOTA por cima da interpretação
 *  neumática; chave (syllableIndex, noteInSyllable); clamp [0.5, 2.5];
 *  hash do corpo gabc detecta canto editado (banner manter/resetar). */
import type { TimedPlayback } from "./duration";

export const WAVE_MIN = 0.5;
export const WAVE_MAX = 2.5;

export interface WaveOverlay {
  gabcBodyHash: string;
  factors: Record<string, number>; // chave waveKey(syl, nota) → fator ≠ 1
}

export function waveKey(syllableIndex: number, noteInSyllable: number): string {
  return `${syllableIndex}:${noteInSyllable}`;
}

export function emptyWave(gabcBodyHash: string): WaveOverlay {
  return { gabcBodyHash, factors: {} };
}

/** Define o fator de uma nota (imutável). Clamp [0.5, 2.5]; fator 1 remove. */
export function setWaveFactor(
  w: WaveOverlay, syllableIndex: number, noteInSyllable: number, factor: number,
): WaveOverlay {
  const f = Math.min(WAVE_MAX, Math.max(WAVE_MIN, factor));
  const factors = { ...w.factors };
  const key = waveKey(syllableIndex, noteInSyllable);
  if (Math.abs(f - 1) < 1e-9) delete factors[key];
  else factors[key] = f;
  return { ...w, factors };
}

/** Aplica o overlay ao playback computado (imutável; pausas/leadIn intactos). */
export function applyWave(pb: TimedPlayback, w: WaveOverlay): TimedPlayback {
  return {
    leadInMs: pb.leadInMs,
    notes: pb.notes.map((n) => {
      const f = w.factors[waveKey(n.syllableIndex, n.noteInSyllable)];
      return f === undefined ? n : { ...n, ms: n.ms * f };
    }),
  };
}

/** Hash FNV-1a do CORPO gabc (após %%): detecta canto editado.
 *  Cabeçalhos fora — mudar metadado não invalida a interpretação. */
export function gabcBodyHash(doc: string): string {
  const sep = doc.indexOf("%%");
  const body = sep >= 0 ? doc.slice(sep + 2) : doc;
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
