// src/gabc/gabc-pitch.ts
// Mapeamento diatônico do gabc letra→solfejo, dado a clave.
// Letras a..m = posições FIXAS na pauta (d = linha 1, sempre). A clave define
// qual linha é Dó (c-clef) ou Fá (f-clef). Convenção verificada contra
// notker-LEGACY/src-tauri/src/render/native/note_glyph.rs (gregorio CLI):
//   c4 → d=Ré e=Mi f=Fá g=Sol h=Lá i=Si j=Dó (clave na linha 4).
const LETTERS = "abcdefghijklm";
const SOLFEGE = ["do", "re", "mi", "fa", "sol", "la", "si"];

export function staffOffset(letter: string): number {
  const i = LETTERS.indexOf(letter.toLowerCase());
  return i < 0 ? NaN : i;
}

/** Offset de letra onde fica o "Dó" para a clave dada. */
function doOffset(clef: string): number {
  const kind = clef[0].toLowerCase();                 // 'c' ou 'f'
  const line = parseInt(clef.replace(/[^0-9]/g, ""), 10) || 4;
  const lineOffset = 1 + 2 * line;                    // linha L → offset (c4: linha4 = j = 9)
  return kind === "f" ? lineOffset - 3 : lineOffset;  // f-clef: Dó fica 3 graus abaixo do Fá
}

export function pitchName(letter: string, clef: string | null): string {
  const off = staffOffset(letter);
  if (Number.isNaN(off)) return "?";
  const d = doOffset(clef ?? "c4");
  const idx = ((off - d) % 7 + 7) % 7;
  return SOLFEGE[idx];
}
