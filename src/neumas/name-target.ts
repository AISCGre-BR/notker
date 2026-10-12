// src/neumas/name-target.ts — "Nomear neuma…": que cadeia nabc o usuário quer nomear e
// qual item da vista Neumas a representa. PURO (o parse tree é injetado).
import { nabcFieldStart, outermostNabcAt } from "../editor/context";
import { normalizeNabc } from "../neume/overlay";
import { findChain } from "../neume/effective";
import type { EffectiveEntry, Family } from "../neume/types";

type TreeLike = Parameters<typeof outermostNabcAt>[0];

/** Fim do campo nabc que começa em `start` (antes do próximo `|`, `)` ou quebra de linha). */
function fieldEnd(doc: string, start: number): number {
  let i = start;
  while (i < doc.length && !"|)\n".includes(doc[i])) i++;
  return i;
}

/**
 * Cadeia nabc a nomear, ou null.
 * 1. Seleção dentro de UM campo nabc → o texto selecionado.
 * 2. Seleção que cobre mais que um campo (ex.: clique numa sílaba da partitura, que
 *    seleciona `Pó(h|vi)`) → o PRIMEIRO campo nabc dentro da seleção, inteiro.
 * 3. Sem seleção → o neuma mais externo sob o cursor (tree-sitter); sem árvore, o campo
 *    textual inteiro em que o cursor está.
 */
export function chainAtSelection(doc: string, from: number, to: number, tree: TreeLike | null): string | null {
  const a = Math.min(from, to), b = Math.max(from, to);
  if (a !== b) {
    // (1) seleção inteira dentro de um campo: o campo que contém o fim começa antes do início
    const start = nabcFieldStart(doc, b);
    if (start !== -1 && start <= a) {
      const sel = normalizeNabc(doc.slice(a, b));
      if (sel) return sel;
    }
    // (2) primeiro campo nabc que começa dentro da seleção
    for (let i = a; i < b; i++) {
      if (doc[i] !== "|" || nabcFieldStart(doc, i + 1) !== i + 1) continue;
      const n = normalizeNabc(doc.slice(i + 1, fieldEnd(doc, i + 1)));
      if (n) return n;
    }
    return null;
  }
  if (tree) {
    const ctx = outermostNabcAt(tree, doc, a);
    if (ctx.inNabc) {
      const n = normalizeNabc(doc.slice(ctx.tokenFrom, ctx.tokenTo).replace(/^\|/, ""));
      if (n) return n;
    }
  }
  const start = nabcFieldStart(doc, a);
  if (start === -1) return null;
  return normalizeNabc(doc.slice(start, fieldEnd(doc, start))) || null;
}

export type NameTarget = { kind: "existing"; id: string } | { kind: "new"; nabc: string };

/** Item que a vista deve abrir: glifo/sequência do catálogo, sequência do usuário ou nova. */
export function resolveNameTarget(entries: EffectiveEntry[], family: Family, nabc: string): NameTarget {
  const hit = findChain(entries, family, nabc);
  return hit ? { kind: "existing", id: hit.id } : { kind: "new", nabc: normalizeNabc(nabc) };
}
