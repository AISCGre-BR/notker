import type { SyllableSource } from "./engine";

export function syllableAtOffset(map: SyllableSource[], offset: number): SyllableSource | null {
  for (const s of map) if (offset >= s.from && offset < s.to) return s;
  return null;
}
export function sourceOfSyllable(map: SyllableSource[], index: number): { from: number; to: number } | null {
  const s = map.find((x) => x.syllableIndex === index);
  return s ? { from: s.from, to: s.to } : null;
}
