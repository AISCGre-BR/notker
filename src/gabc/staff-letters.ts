// src/gabc/staff-letters.ts
// Letras na pauta (Task 4): a letra gabc de cada linha e espaço da pauta.
// Gabc.tex §Pitches (Gregorio v6.2.0): cada letra é a posição TIPOGRÁFICA na pauta,
// "regardless of the position of the clef" — a linha 1 (de baixo) é sempre d. Por isso
// as LETRAS não mudam com a clave; o que muda é o som (solfejo), que vem de gabc-pitch.ts.
import { pitchName } from "./gabc-pitch";
import { syllableSpans } from "../preview/nabc-lib";

const LETTERS = "abcdefghijklm";
/** Índice (em LETTERS) da linha 1 da pauta: d. */
const FIRST_LINE = 3;
const CLEF_RE = /^[cf]b?[1-4]$/;

export interface StaffPosition {
  letter: string;
  kind: "line" | "space";
  /** 0 = linha de baixo; cada grau (linha ↔ espaço) sobe 1. */
  degree: number;
  /** Solfejo da posição com a clave dada ("do", "re", …). */
  solfege: string;
}

/** Linhas e espaços DENTRO da pauta, de baixo para cima (4 linhas → 7 posições).
 *  Clave nula/desconhecida vale c4; bemol de clave é ignorado. */
export function staffLetters(clef: string | null, lines = 4): StaffPosition[] {
  const c = clef && CLEF_RE.test(clef) ? clef : "c4";
  const n = Math.max(0, 2 * lines - 1);
  return Array.from({ length: n }, (_, degree) => {
    const letter = LETTERS[FIRST_LINE + degree] ?? "?";
    return { letter, kind: degree % 2 === 0 ? "line" : "space", degree, solfege: pitchName(letter, c) };
  });
}

/** Clave escrita num grupo de notas (só a parte gabc, antes do 1º `|`): a ÚLTIMA,
 *  ex. `c4`, `cb3`, `::f3`. Maiúscula não é clave (C = punctum inclinatum). */
export function clefInGroup(group: string): string | null {
  const gabc = group.split("|")[0];
  let found: string | null = null;
  for (const m of gabc.matchAll(/(?:^|[^a-zA-Z])([cf]b?[1-4])(?![0-9])/g)) found = m[1];
  return found;
}

/** Clave ativa DEPOIS de cada grupo, indexada como o preview numera as sílabas
 *  (`syllableSpans`: clave inicial = 0, demais grupos 1..M). out[0] é a clave do início. */
export function clefsBySyllable(doc: string): string[] {
  const out: string[] = ["c4"];
  let clef = "c4";
  for (const s of syllableSpans(doc)) {
    const open = doc.lastIndexOf("(", s.to - 1);
    clef = clefInGroup(doc.slice(open + 1, s.to - 1)) ?? clef;
    out[s.syllableIndex] = clef;
  }
  for (let i = 0; i < out.length; i++) out[i] ??= out[i - 1] ?? "c4";
  return out;
}
