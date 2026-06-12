import type { SyllableSource } from "./engine";

export function syllableAtOffset(map: SyllableSource[], offset: number): SyllableSource | null {
  for (const s of map) if (offset >= s.from && offset < s.to) return s;
  return null;
}
export function sourceOfSyllable(map: SyllableSource[], index: number): { from: number; to: number } | null {
  const s = map.find((x) => x.syllableIndex === index);
  return s ? { from: s.from, to: s.to } : null;
}

/** Intervalo de sílabas reais (ordinais 0-based ENTRE AS REAIS — mesma ordem de
 *  extractAll/svgIndices) cujos spans intersectam a seleção [from, to).
 *  Seleção vazia ou sem interseção → null (chamador toca a peça inteira). */
export function syllableRangeOfSelection(
  map: SyllableSource[], from: number, to: number,
): [number, number] | null {
  if (to <= from) return null;
  const real = map.filter((s) => s.syllableIndex >= 1);
  let first = -1;
  let last = -1;
  real.forEach((s, ord) => {
    if (s.from < to && s.to > from) {
      if (first < 0) first = ord;
      last = ord;
    }
  });
  return first < 0 ? null : [first, last];
}
