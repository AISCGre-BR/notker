import type { NeumeEntry, Overlay, OverlayEntry } from "../neume/types";

/** Há conflito se o overlay declara um nome que difere do nome canônico da base. */
export function hasConflict(base: NeumeEntry, ov: OverlayEntry | undefined): boolean {
  if (!ov?.names?.length) return false;
  return ov.names.some((n) => n !== base.name);
}

/** Reordena os nomes do overlay para que `name` seja o primeiro (o "padrão" exibido). */
export function promoteToDefault(o: Overlay, id: string, name: string): Overlay {
  const prev = o.entries[id];
  if (!prev?.names?.length) return o;
  const names = [name, ...prev.names.filter((n) => n !== name)];
  return { ...o, entries: { ...o.entries, [id]: { ...prev, names } } };
}
