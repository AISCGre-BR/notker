// src/neume/decode.ts
import type { Family, NeumeEntry, GlyphSvg, BaseAnnotations } from "./types";
import { KIND_NAMES, NEUME_KINDS, decodeName } from "./tables";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Letras significativas: grupos `ls..`/`lt..` opcionalmente com dígito. */
function extractLetters(rest: string): string[] {
  return rest.match(/l[st][a-z]*\d*/g) ?? [];
}

/** Termos de busca derivados dos modificadores NABC (GregorioNabcRef:270-271,528). */
function modifierTerms(rest: string): string[] {
  const out: string[] = [];
  const su = rest.match(/su[tuwx]?(\d)?/);   // subpunctis (su) + opcional forma + contagem
  if (su) { out.push("subpunctis"); if (su[1] === "2") out.push("subbipunctis"); }
  const pp = rest.match(/pp[tuwx]?(\d)?/);   // prepunctis (pp)
  if (pp) out.push("prepunctis", "praepunctis");
  return out;
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
    norm(name), norm(base), norm(code), norm(nabc), ...ptTerms, ...modifierTerms(rest).map(norm),
  ].filter(Boolean)));

  return {
    id: `${family}:${code}`,
    family, code, nabc, nabcValid: true, base, name,
    qualifiers, letters, terms, meaning: a.meaning ?? "", svg,
  };
}
