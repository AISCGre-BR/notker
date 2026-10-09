// src/app/chant-capture.ts — o que o editor grava de volta no canto exibido.
// A interpretação (onda) carregada do .notker volta INTACTA mesmo com o playback
// desligado (PLAYBACK-OFF 2026-10-09): ninguém a edita, então o mesmo objeto é regravado.
// Onda sem fatores = sem onda (o .notker também não a grava).
import type { ChantPatch, Interpretation } from "../project/tree";

export function chantCapture(content: string, wave: Interpretation | undefined): ChantPatch {
  return { content, interpretation: wave && Object.keys(wave.factors).length > 0 ? wave : undefined };
}
