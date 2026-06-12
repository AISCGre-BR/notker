/** timeline.ts — IR NoteTimeline do Tuotilo v2 (spec §2). Módulo PURO.
 *  Lista plana de notas com vínculos estruturais (sílaba, palavra, incisum)
 *  — consumida por duration (modos), player (cursor) e, na etapa B, pela onda. */
import type { SyllableRhythm, RhythmSign } from "./signs";

export type DivisioKind = "minima" | "minor" | "maior" | "finalis";

export interface TimelineNote {
  idx: number;
  pitch: string;
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
        signs: syl.perPitchSigns[noteInSyllable] ?? [],
        aligned: syl.aligned,
        repercussion: !!prev && prev.incisumIndex === incisumIndex && prev.pitch === pitch,
        wordFinal: syl.wordFinal,
        divisio: syl.divisio,
        recitation: false, // será atualizado no pós-processamento abaixo
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

  return { notes, divisiones };
}
