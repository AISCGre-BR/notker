/**
 * duration.ts — Modelo de duração log-aditivo saturado do Tuotilo (v2).
 *
 * API pública: computeTimedNotes / TimedNote / TimedPlayback / PlaybackMode.
 *
 * Fórmula nuclear por nota:
 *   D = baseMs × exp( sat( Σ log(f_i) ) ) × (1+g)
 *
 * Onde:
 *   - f_i = fatores do perfil para cada sinal ativo na nota
 *   - sat(L) = min(L, log(cap))   — teto de saturação dependente do contexto
 *   - jitter = 1 + g              — ruído determinístico (mulberry32 PRNG)
 *
 * Módulo PURO: zero DOM, zero Tauri, zero audio.
 */

import type { SyllableRhythm, RhythmSign } from "./signs";
import type { RhythmProfile } from "./profile";
import type { NoteTimeline } from "./timeline";

// ── PRNG determinístico: mulberry32 ─────────────────────────────────────────

/** Retorna um gerador mulberry32 inicializado com `seed`. Cada chamada a `next()`
 *  produz um número em [0, 1) e avança o estado interno. */
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    return z;
  };
}

/** Amostra gaussiana aproximada pela média de 4 uniformes (teorema central do limite leve).
 *  Resultado centrado em 0, com σ ≈ 0.97 (clamp ±2 encolhe o σ efetivo de 1 para ≈0.97). */
function gaussSample(rng: () => number): number {
  // soma de 4 uniformes iid ~ N(2, 1/3) → centrar subtraindo 2, escala ×sqrt(3)
  const u = rng() + rng() + rng() + rng();
  const g = (u - 2) * Math.sqrt(3); // σ ≈ 1 antes do clamp
  return Math.max(-2, Math.min(2, g)); // clamp ±2σ; reduz σ efetivo para ≈0.97
}

// ── Mapeamento sinal → factor key ────────────────────────────────────────────

/** Retorna a chave correspondente no `RhythmProfile.factors` para um sinal neumático.
 *  Retorna null para sinais sem mapeamento direto (ignorados na v1). */
function signToKey(sign: RhythmSign): keyof RhythmProfile["factors"] | null {
  switch (sign) {
    case "episema":      return "episema";
    case "preQuilisma":  return "preQuilisma";
    case "quilisma":     return "quilisma";
    case "currentes":    return "currentes";
    case "initioDebilis":return "initioDebilis";
    case "oriscus":      return "oriscus";
    case "liqAug":       return "liqAug";
    case "liqDim":       return "liqDim";
    case "strophae":     return "strophae";
    default:             return null;
  }
}

// ── Saturação ────────────────────────────────────────────────────────────────

/** Seleciona o teto de saturação adequado ao contexto da sílaba. */
function selectCap(
  caps: RhythmProfile["caps"],
  divisio: SyllableRhythm["divisio"],
  wordFinal: boolean,
): number {
  if (divisio === "maior" || divisio === "finalis") return caps.phrase;
  if (wordFinal || divisio === "minima" || divisio === "minor") return caps.incisum;
  return caps.sign;
}

/** Aplica saturação ao log-sum:
 *  - clamp inferior: log(0.6) — fatores redutores não levam abaixo de 0.6 × base
 *  - clamp superior: log(cap) */
function saturate(logSum: number, cap: number): number {
  const logFloor = Math.log(0.6);
  const logCap   = Math.log(cap);
  return Math.max(logFloor, Math.min(logCap, logSum));
}

// ── API pública ──────────────────────────────────────────────────────────────

export type PlaybackMode = "interpretado" | "solfejo";

/** Articulação da nota no fluxo (B1.2):
 *  full   = novo oscilador + envelope (início de incisum, pós-divisio, récita)
 *  pulse  = repercussão INTRA-sílaba: pulso de volume no som contínuo
 *  legato = continua o grupo sem rearticular */
export type Articulation = "full" | "pulse" | "legato";

export interface TimedNote {
  idx: number;
  pitch: string;
  alt: number;             // deslocamento em semitons: -1 (bemol) | 0 | +1 (sustenido)
  ms: number;
  pauseAfterMs: number;   // pausa de divisio após ESTA nota
  articulation: Articulation;  // articulação da nota no fluxo
  syllableIndex: number;
  noteInSyllable: number;  // posição 0-based dentro da sílaba (chave da onda)
}
export interface TimedPlayback { notes: TimedNote[]; leadInMs: number; }

/** Duração por nota sobre a NoteTimeline (spec §4).
 *  interpretado: log-aditivo saturado com sinais DA NOTA + contexto da sílaba;
 *  solfejo: baseMs fixo, sem jitter, re-ataque por nota, pausas mantidas. */
export function computeTimedNotes(
  tl: NoteTimeline,
  p: RhythmProfile,
  seed: number,
  mode: PlaybackMode,
): TimedPlayback {
  const rng = makePrng(seed);
  const pauseAfter = new Map<number, number>();
  let leadInMs = 0;
  for (const d of tl.divisiones) {
    const ms = p.pauseBeats[d.kind] * p.baseMs;
    if (d.afterNoteIdx < 0) leadInMs += ms;
    else pauseAfter.set(d.afterNoteIdx, (pauseAfter.get(d.afterNoteIdx) ?? 0) + ms);
  }

  const notes: TimedNote[] = tl.notes.map((n, i) => {
    let ms: number;
    let articulation: Articulation;
    if (mode === "solfejo") {
      ms = p.baseMs;
      articulation = "full";
    } else {
      let L = 0;
      for (const sign of n.signs) {
        const key = signToKey(sign);
        if (key !== null) L += Math.log(p.factors[key]);
      }
      if (n.wordFinal)             L += Math.log(p.factors.wordFinal);
      if (n.divisio === "minima")  L += Math.log(p.factors.divisioMinima);
      if (n.divisio === "minor")   L += Math.log(p.factors.divisioMinor);
      if (n.divisio === "maior")   L += Math.log(p.factors.divisioMaior);
      if (n.divisio === "finalis") L += Math.log(p.factors.divisioFinalis);
      if (n.recitation) {
        L += Math.log(p.factors.recitation);
        if (n.tonic) L += Math.log(p.factors.recitationTonic);
      }

      const cap = selectCap(p.caps, n.divisio, n.wordFinal);
      const D = p.baseMs * Math.exp(saturate(L, cap));
      const g = gaussSample(rng) * p.jitterSigma;
      ms = Math.max(1, D * (1 + g));

      const prev = tl.notes[i - 1];
      if (!prev || prev.incisumIndex !== n.incisumIndex) {
        articulation = "full";
      } else if (n.repercussion) {
        articulation = prev.syllableIndex === n.syllableIndex ? "pulse" : "full";
      } else {
        articulation = "legato";
      }
    }
    return {
      idx: n.idx, pitch: n.pitch, alt: n.alt,
      ms, pauseAfterMs: pauseAfter.get(n.idx) ?? 0,
      articulation, syllableIndex: n.syllableIndex,
      noteInSyllable: n.noteInSyllable,
    };
  });

  return { notes, leadInMs };
}

/** Recorta o playback para as sílabas [a, b] (ordinais da timeline).
 *  Contexto interpretativo (incisum/récita/tônica) já foi computado na peça
 *  inteira — o recorte só filtra a EXECUÇÃO. leadIn zera no recorte parcial. */
export function sliceBySyllables(pb: TimedPlayback, range: [number, number]): TimedPlayback {
  const [a, b] = range;
  const notes = pb.notes.filter((n) => n.syllableIndex >= a && n.syllableIndex <= b);
  const full = notes.length === pb.notes.length;
  return { leadInMs: full ? pb.leadInMs : 0, notes };
}

/** Recorta o playback da sílaba `a` (ordinal da timeline) até o FIM da peça.
 *  Contexto interpretativo já computado na peça inteira; leadIn zera se a > 0. */
export function sliceFromSyllable(pb: TimedPlayback, a: number): TimedPlayback {
  const notes = pb.notes.filter((n) => n.syllableIndex >= a);
  const full = notes.length === pb.notes.length;
  return { leadInMs: full ? pb.leadInMs : 0, notes };
}
