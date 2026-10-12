// src/neume/effective.ts — entradas efetivas (catálogo + nomes do usuário + sequências
// do usuário) num só lugar, para busca, paleta, hover, completion e a vista Neumas. PURO.
import type { EffectiveEntry, Family, GlyphSvg, NeumeEntry, Overlay, UserSequence } from "./types";
import { mergeEntry, normalizeNabc } from "./overlay";
import { nameNeume } from "./naming";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Partes de uma cadeia nabc: separa em `!` (glifos ligados) e `/` (espaço). */
export function splitNabcParts(nabc: string): string[] {
  return normalizeNabc(nabc).split(/[!/]+/).filter(Boolean);
}

export type GlyphLookup = (family: Family, nabc: string) => GlyphSvg | undefined;

/** Índice família+nabc → glifo da fonte (só entradas com glifo próprio, não as sintéticas). */
export function glyphIndex(catalog: NeumeEntry[]): GlyphLookup {
  const m = new Map<string, GlyphSvg>();
  for (const e of catalog) if (!e.synthetic && !m.has(`${e.family}:${e.nabc}`)) m.set(`${e.family}:${e.nabc}`, e.svg);
  return (family, nabc) => m.get(`${family}:${normalizeNabc(nabc)}`);
}

/** Glifos das partes, na ordem; undefined se a cadeia é vazia ou alguma parte não tem glifo. */
export function partGlyphs(family: Family, nabc: string, glyphOf: GlyphLookup): GlyphSvg[] | undefined {
  const parts = splitNabcParts(nabc);
  if (parts.length === 0) return undefined;
  const out: GlyphSvg[] = [];
  for (const p of parts) {
    const g = glyphOf(family, p);
    if (!g) return undefined;
    out.push(g);
  }
  return out;
}

/** Sequência do usuário como entrada efetiva (sem `svg`: o desenho vem do motor). */
export function sequenceEntry(id: string, s: UserSequence, glyphOf: GlyphLookup): EffectiveEntry {
  const naming = nameNeume(s.nabc, s.family);
  const ref = naming.displayNames[0] ?? s.nabc;
  const names = s.names ?? [];
  const first = splitNabcParts(s.nabc)[0] ?? s.nabc;
  return {
    id, family: s.family, code: s.nabc, nabc: s.nabc, nabcValid: true,
    base: first.slice(0, 2), name: ref, qualifiers: [], letters: [],
    terms: Array.from(new Set([...names.map(norm), ...naming.terms, s.nabc.toLowerCase()])),
    meaning: s.note ?? "", provenance: naming.provenance,
    synthetic: true, userSequence: true,
    partSvgs: partGlyphs(s.family, s.nabc, glyphOf),
    displayNames: [...names, ref], hidden: s.hidden ?? false, userNames: [...names],
    ...(s.note ? { userNote: s.note } : {}),
  };
}

/** Catálogo com os nomes do usuário + sequências do usuário (ordem: catálogo, depois
 *  sequências por data de criação). Sintéticas do catálogo ganham `partSvgs`. */
export function buildEffective(catalog: NeumeEntry[], o: Overlay, glyphOf: GlyphLookup = glyphIndex(catalog)): EffectiveEntry[] {
  const out: EffectiveEntry[] = catalog.map((e) => {
    const m = mergeEntry(e, Object.hasOwn(o.entries, e.id) ? o.entries[e.id] : undefined);
    if (e.synthetic) {
      const parts = partGlyphs(e.family, e.nabc, glyphOf);
      if (parts) m.partSvgs = parts;
    }
    return m;
  });
  const seqs = Object.entries(o.sequences).sort((a, b) => a[1].created.localeCompare(b[1].created) || a[0].localeCompare(b[0]));
  for (const [id, s] of seqs) out.push(sequenceEntry(id, s, glyphOf));
  return out;
}

/** Item que JÁ representa esta cadeia nesta família: glifo do catálogo, depois
 *  sequência do catálogo, depois sequência do usuário. Comparação normalizada. */
export function findChain(entries: EffectiveEntry[], family: Family, nabc: string): EffectiveEntry | undefined {
  const n = normalizeNabc(nabc);
  if (!n) return undefined;
  const same = entries.filter((e) => e.family === family && normalizeNabc(e.nabc) === n);
  return same.find((e) => !e.synthetic) ?? same.find((e) => !e.userSequence) ?? same[0];
}

/** Índice para o hover/lookup: nabc normalizado → entradas (todas as famílias). */
export function byNabcIndex(entries: EffectiveEntry[]): (nabc: string) => EffectiveEntry[] {
  const m = new Map<string, EffectiveEntry[]>();
  for (const e of entries) {
    const k = normalizeNabc(e.nabc);
    const arr = m.get(k);
    if (arr) arr.push(e); else m.set(k, [e]);
  }
  return (nabc) => m.get(normalizeNabc(nabc)) ?? [];
}
