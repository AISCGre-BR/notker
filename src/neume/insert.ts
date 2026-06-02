// src/neume/insert.ts
import type { NabcContext } from "../editor/context";

export type Placement = "inNote" | "outside";
export interface Insertion { insert: string; from: number; to: number; }

export function computeInsertion(
  ctx: NabcContext, nabc: string, cursor: number, placement: Placement = "outside",
): Insertion {
  if (ctx.inNabc) return { insert: nabc, from: ctx.tokenTo, to: ctx.tokenTo };
  if (placement === "inNote") return { insert: `|${nabc}`, from: cursor, to: cursor };
  return { insert: `(|${nabc})`, from: cursor, to: cursor };
}
