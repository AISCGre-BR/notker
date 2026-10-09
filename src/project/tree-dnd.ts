// src/project/tree-dnd.ts
/** Geometria pura do arrastar-e-soltar da árvore: dada a posição vertical do ponteiro
 *  e as linhas visíveis (com retângulos), decide ONDE soltar. Índices na convenção do
 *  tree.ts (posição na lista do pai ANTES da mudança). */
export interface DropRow {
  id: string; kind: "group" | "chant"; parentId: string | null; index: number;
  top: number; height: number; expanded: boolean; childCount: number;
}
export interface Drop { parentId: string | null; index: number; rowId: string; where: "before" | "after" | "inside" | "end" }

export function computeDrop(rows: DropRow[], y: number, isForbidden: (parentId: string | null) => boolean): Drop | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  let d: Drop;
  if (y >= last.top + last.height) {
    d = { parentId: null, index: Infinity, rowId: last.id, where: "end" };
  } else {
    const r = rows.find((x) => y < x.top + x.height) ?? last;
    const rel = r.height > 0 ? (y - r.top) / r.height : 0;
    if (r.kind === "group" && rel >= 0.25 && rel < 0.75) d = { parentId: r.id, index: r.childCount, rowId: r.id, where: "inside" };
    else if (rel < (r.kind === "group" ? 0.25 : 0.5)) d = { parentId: r.parentId, index: r.index, rowId: r.id, where: "before" };
    else if (r.kind === "group" && r.expanded && r.childCount > 0) d = { parentId: r.id, index: 0, rowId: r.id, where: "after" };
    else d = { parentId: r.parentId, index: r.index + 1, rowId: r.id, where: "after" };
  }
  return isForbidden(d.parentId) ? null : d;
}
