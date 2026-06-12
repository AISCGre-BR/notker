/** Perfil rítmico do Tuotilo — TUDO configurável; defaults em decimais
 *  irregulares (decisão D-23: nada de 1,5/2,0 — semiologia, não mensuralismo). */
export interface RhythmProfile {
  baseMs: number;                       // valor silábico de referência
  factors: {
    episema: number; mora: number; preQuilisma: number; quilisma: number;
    wordFinal: number; divisioMinor: number; divisioMaior: number; divisioFinalis: number;
    currentes: number; initioDebilis: number;
  };
  caps: { sign: number; incisum: number; phrase: number }; // tetos de saturação por nível
  jitterSigma: number;                  // fração de D (ex.: 0.04)
  pauseBeats: { minor: number; maior: number; finalis: number }; // pausa pós-divisio (× baseMs)
}
export const DEFAULT_PROFILE: RhythmProfile = {
  baseMs: 380,
  factors: { episema: 1.31, mora: 1.83, preQuilisma: 1.27, quilisma: 0.92,
    wordFinal: 1.12, divisioMinor: 1.34, divisioMaior: 1.52, divisioFinalis: 1.78,
    currentes: 0.86, initioDebilis: 0.88 },
  caps: { sign: 1.35, incisum: 1.7, phrase: 2.05 },
  jitterSigma: 0.04,
  pauseBeats: { minor: 0.45, maior: 0.95, finalis: 1.6 },
};
export function validateProfile(p: RhythmProfile): boolean {
  return p.baseMs > 0 && p.caps.sign < p.caps.incisum && p.caps.incisum < p.caps.phrase
    && Object.values(p.factors).every((v) => v > 0 && v < 3);
}
