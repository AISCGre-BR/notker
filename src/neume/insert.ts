// src/neume/insert.ts
import type { EditorView } from "@codemirror/view";
import { nabcContextAt, type NabcContext } from "../editor/context";

export type Placement = "inNote" | "outside";
export interface Insertion { insert: string; from: number; to: number; }

export function computeInsertion(
  ctx: NabcContext, nabc: string, cursor: number, placement: Placement = "outside",
): Insertion {
  if (ctx.inNabc) return { insert: nabc, from: ctx.tokenTo, to: ctx.tokenTo };
  if (placement === "inNote") return { insert: `|${nabc}`, from: cursor, to: cursor };
  return { insert: `(|${nabc})`, from: cursor, to: cursor };
}

type TreeLike = Parameters<typeof nabcContextAt>[0];

/** Insere `nabc` no cursor (no fim do token se já está num campo nabc; senão `(|nabc)`).
 *  Mesmo comportamento que a paleta sempre teve; usado também por "Inserir no canto". */
export function insertNabcAtCursor(view: EditorView, tree: TreeLike | null, nabc: string): void {
  const pos = view.state.selection.main.head;
  const doc = view.state.doc.toString();
  const ctx = tree ? nabcContextAt(tree, doc, pos) : { inNabc: false, tokenFrom: pos, tokenTo: pos };
  const ins = computeInsertion(ctx, nabc, pos, "outside");
  view.dispatch({ changes: { from: ins.from, to: ins.to, insert: ins.insert } });
}
