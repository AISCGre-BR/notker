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
      });
      idx++;
    });
    if (syl.divisio) {
      divisiones.push({ afterNoteIdx: idx - 1, kind: syl.divisio });
      incisumIndex++;
    }
    if (syl.wordFinal) wordIndex++;
  });

  return { notes, divisiones };
}
