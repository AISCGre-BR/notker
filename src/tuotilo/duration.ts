/**
 * duration.ts — Modelo de duração log-aditivo saturado do Tuotilo.
 *
 * Fórmula nuclear por nota:
 *   D = baseMs × exp( sat( Σ log(f_i) ) ) × (1+g)
 *
 * Onde:
 *   - f_i = fatores do perfil para cada sinal ativo na nota/sílaba
 *   - sat(L) = min(L, log(cap))   — teto de saturação dependente do contexto
 *   - jitter = 1 + g              — ruído determinístico (mulberry32 PRNG)
 *
 * Módulo PURO: zero DOM, zero Tauri, zero audio.
 */

import type { SyllableRhythm, RhythmSign } from "./signs";
import type { RhythmProfile } from "./profile";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface NoteEvent {
  pitch: string;
  ms: number;
  reattack: boolean; // sempre true — repercussão explícita (regra do projeto)
}

export interface SyllableEvents {
  notes: NoteEvent[];
  pauseMs: number;
  syllableIndex: number;
}

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
    case "mora":         return "mora";
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

// ── Cálculo de duração por nota ──────────────────────────────────────────────

/** Calcula log-sum dos fatores de sinal para uma nota específica, incluindo
 *  os fatores de contexto silábico (wordFinal, divisio). */
function computeLogSum(
  noteSignsList: RhythmSign[],
  sylSigns: RhythmSign[],
  divisio: SyllableRhythm["divisio"],
  wordFinal: boolean,
  factors: RhythmProfile["factors"],
): number {
  let L = 0;

  // Contribuição dos sinais da nota
  for (const sign of noteSignsList) {
    const key = signToKey(sign);
    if (key !== null) L += Math.log(factors[key]);
  }

  // Contribuição dos sinais silábicos não presentes em perPitchSigns[i]
  // (ex.: oriscus, strophae vêm de NABC e afetam toda a sílaba)
  // Para v1: a nota herda sinais silábicos que não foram atribuídos por nota
  const noteSigns = new Set(noteSignsList);
  for (const sign of sylSigns) {
    if (!noteSigns.has(sign)) {
      const key = signToKey(sign);
      if (key !== null) L += Math.log(factors[key]);
    }
  }

  // Fator wordFinal
  if (wordFinal) L += Math.log(factors.wordFinal);

  // Fator divisio
  if (divisio === "minima")  L += Math.log(factors.divisioMinima);
  if (divisio === "minor")   L += Math.log(factors.divisioMinor);
  if (divisio === "maior")   L += Math.log(factors.divisioMaior);
  if (divisio === "finalis") L += Math.log(factors.divisioFinalis);

  return L;
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Computa durações para um array de sílabas neumáticas.
 *
 * @param syls  - sílabas com sinais rítmicos (output de extractAll/extractSyllable)
 * @param p     - perfil rítmico (fatores, tetos, jitter, pausas)
 * @param seed  - semente PRNG para jitter determinístico
 * @returns     - array de SyllableEvents paralelo a `syls`
 */
export function computeDurations(
  syls: SyllableRhythm[],
  p: RhythmProfile,
  seed: number,
): SyllableEvents[] {
  const rng = makePrng(seed);

  return syls.map((syl, syllableIndex) => {
    // ── Sílaba sem pitches (divisio pura) ──────────────────────────────────
    if (syl.pitches.length === 0) {
      const pauseMs = syl.divisio
        ? p.pauseBeats[syl.divisio] * p.baseMs
        : 0;
      return { notes: [], pauseMs, syllableIndex };
    }

    // ── Cap de saturação para o contexto desta sílaba ─────────────────────
    const cap = selectCap(p.caps, syl.divisio, syl.wordFinal);

    // ── Calcular ms de cada nota com jitter individual ────────────────────
    const notes: NoteEvent[] = syl.pitches.map((pitch, noteIdx) => {
      const noteSignsList = syl.perPitchSigns[noteIdx] ?? [];

      // log-sum de todos os fatores
      const L = computeLogSum(noteSignsList, syl.signs, syl.divisio, syl.wordFinal, p.factors);

      // saturação
      const Lsat = saturate(L, cap);

      // duração base saturada
      const D = p.baseMs * Math.exp(Lsat);

      // jitter gaussiano (1 amostra por nota, avança PRNG)
      const g = gaussSample(rng) * p.jitterSigma;
      const ms = Math.max(1, D * (1 + g)); // nunca negativo

      return { pitch, ms, reattack: true };
    });

    // ── Pausa pós-sílaba ───────────────────────────────────────────────────
    const pauseMs = syl.divisio ? p.pauseBeats[syl.divisio] * p.baseMs : 0;

    return { notes, pauseMs, syllableIndex };
  });
}
