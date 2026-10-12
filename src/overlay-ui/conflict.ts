import type { NeumeEntry, Overlay, OverlayEntry } from "../neume/types";
import { promoteName } from "../neume/overlay";

/** Há conflito se o overlay declara um nome que difere do nome canônico da base. */
export function hasConflict(base: NeumeEntry, ov: OverlayEntry | undefined): boolean {
  if (!ov?.names?.length) return false;
  return ov.names.some((n) => n !== base.name);
}

/** Reordena os nomes do usuário para que `name` seja o primeiro (o "padrão" exibido).
 *  Vale para ids do catálogo e de sequência (`seq:…`). */
export function promoteToDefault(o: Overlay, id: string, name: string): Overlay {
  return promoteName(o, id, name);
}
