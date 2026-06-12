/** timeline.ts — IR NoteTimeline do Tuotilo v2 (spec §2). Módulo PURO.
 *  Lista plana de notas com vínculos estruturais (sílaba, palavra, incisum)
 *  — consumida por duration (modos), player (cursor) e, na etapa B, pela onda. */
import type { SyllableRhythm, RhythmSign } from "./signs";

export type DivisioKind = "minima" | "minor" | "maior" | "finalis";

export interface TimelineNote {
  idx: number;
  pitch: string;
  alt: number;             // deslocamento em semitons: -1 (bemol) | 0 | +1 (sustenido)
  syllableIndex: number;   // índice no array de sílabas de entrada (0-based)
  noteInSyllable: number;
  wordIndex: number;
  incisumIndex: number;    // trecho entre divisiones → grupo legato (D2)
  signs: RhythmSign[];
  aligned: boolean;
  repercussion: boolean;   // mesma altura que a nota anterior do MESMO incisum
  wordFinal: boolean;      // da sílaba (fator wordFinal)
  divisio: SyllableRhythm["divisio"]; // da sílaba (fatores divisioX + cap)
  // recitação silábica em corda: true se nota pertence a run ≥3 unísonos silábicos
  // no mesmo incisum (cada sílaba com exatamente 1 nota) — fator redutor interpretado
  recitation: boolean;
  tonic: boolean;          // sílaba tônica da palavra (acento gráfico; sem acento: 1ª de palavra ≥2 sílabas)
}

export interface TimelineDivisio { afterNoteIdx: number; kind: DivisioKind; }
export interface NoteTimeline { notes: TimelineNote[]; divisiones: TimelineDivisio[]; }

export function buildTimeline(syls: SyllableRhythm[]): NoteTimeline {
  const notes: TimelineNote[] = [];
  const divisiones: TimelineDivisio[] = [];
  let wordIndex = 0;
  let incisumIndex = 0;
  let idx = 0;

  syls.forEach((syl, syllableIndex) => {
    syl.pitches.forEach((pitch, noteInSyllable) => {
      const prev = notes[notes.length - 1];
      notes.push({
        idx, pitch, syllableIndex, noteInSyllable, wordIndex, incisumIndex,
        alt: syl.perPitchAlt?.[noteInSyllable] ?? 0,
        signs: syl.perPitchSigns[noteInSyllable] ?? [],
        aligned: syl.aligned,
        repercussion: !!prev && prev.incisumIndex === incisumIndex && prev.pitch === pitch,
        wordFinal: syl.wordFinal,
        divisio: syl.divisio,
        recitation: false, // será atualizado no pós-processamento abaixo
        tonic: false,      // será atualizado no pós-processamento abaixo
      });
      idx++;
    });
    if (syl.divisio) {
      divisiones.push({ afterNoteIdx: idx - 1, kind: syl.divisio });
      incisumIndex++;
    }
    if (syl.wordFinal) wordIndex++;
  });

  // Pós-processamento: detectar runs de recitação silábica em corda.
  // Critério: run de ≥3 notas consecutivas onde cada nota é sílaba de 1 pitch
  // (noteInSyllable===0 e syls[syllableIndex].pitches.length===1) com mesma altura
  // e mesmo incisumIndex. Divisio ou sílaba melismática quebram o run.
  // Notas do run (≥3) recebem recitation=true; runs de 2 ficam false.
  {
    let i = 0;
    while (i < notes.length) {
      const n = notes[i];
      // candidata: sílaba de 1 única nota (texture silábica)
      if (syls[n.syllableIndex].pitches.length !== 1) { i++; continue; }
      // varrer para frente enquanto condições do run se mantiverem
      let j = i + 1;
      while (j < notes.length) {
        const m = notes[j];
        if (
          syls[m.syllableIndex].pitches.length !== 1 || // melisma
          m.pitch !== n.pitch ||                         // mudança de altura
          m.incisumIndex !== n.incisumIndex              // divisio (incisum mudou)
        ) break;
        j++;
      }
      const runLen = j - i;
      if (runLen >= 3) {
        for (let k = i; k < j; k++) notes[k].recitation = true;
      }
      i = j; // avança para depois do run (ou para a próxima nota fora do run)
    }
  }

  // ── Tônicas por palavra (latim litúrgico): sílaba com acento gráfico é
  // tônica; palavra sem acento com ≥2 sílabas cantadas → 1ª sílaba tônica
  // (latim não tem oxítonas); monossílabo → átono. Sílabas sem notas
  // (divisio) não contam como sílaba da palavra.
  {
    let wordStart = 0;
    for (let s = 0; s < syls.length; s++) {
      if (!syls[s].wordFinal && s < syls.length - 1) continue;
      const word = syls.slice(wordStart, s + 1);
      const sung = word
        .map((syl, k) => ({ syl, syllableIndex: wordStart + k }))
        .filter((w) => w.syl.pitches.length > 0);
      const accented = sung.filter((w) => w.syl.accented);
      const tonicSyls = accented.length > 0
        ? accented.map((w) => w.syllableIndex)
        : sung.length >= 2
          ? [sung[0].syllableIndex]
          : [];
      if (tonicSyls.length > 0) {
        const set = new Set(tonicSyls);
        for (const n of notes) if (set.has(n.syllableIndex)) n.tonic = true;
      }
      wordStart = s + 1;
    }
  }

  return { notes, divisiones };
}
