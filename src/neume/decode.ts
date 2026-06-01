// src/neume/decode.ts
import type { Family, NeumeEntry, GlyphSvg, BaseAnnotations } from "./types";
import { KIND_NAMES, NEUME_KINDS, decodeName } from "./tables";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Letras significativas: grupos `ls..`/`lt..` opcionalmente com dígito. */
function extractLetters(rest: string): string[] {
  return rest.match(/l[st][a-z]*\d*/g) ?? [];
}

export function decodeGlyph(
  family: Family,
  code: string,
  svg: GlyphSvg,
  annot: BaseAnnotations,
): NeumeEntry {
  const nabc = decodeName(code);
  const base = code.slice(0, 2);
  const name = NEUME_KINDS.has(base) ? (KIND_NAMES[base] ?? base) : base;
  const rest = code.slice(2);
  const letters = extractLetters(rest);
  const qualifiers = rest ? [decodeName(rest)] : [];
  const a = annot[base] ?? {};
  const ptTerms = (a.pt ?? []).map(norm);

  const terms = Array.from(new Set([
    norm(name), norm(base), norm(code), norm(nabc), ...ptTerms,
  ].filter(Boolean)));

  return {
    id: `${family}:${code}`,
    family, code, nabc, nabcValid: true, base, name,
    qualifiers, letters, terms, meaning: a.meaning ?? "", svg,
  };
}
