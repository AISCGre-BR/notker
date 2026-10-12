// src/app/dirty.ts
/** "— Editado" (spec §4.5): impressão digital do projeto serializado, comparada com a do
 *  último salvo/aberto. Fica de fora o que é estado de VISTA: canto ativo, grupo
 *  recolhido e caminho. Onda sem fatores = sem onda (o .notker também não a grava). */
import type { NotkerProject, TreeNode } from "../project/tree";

function canon(n: TreeNode): unknown {
  if (n.kind === "group") return ["g", n.id, n.title, n.children.map(canon)];
  const f = n.interpretation?.factors;
  const wave = f && Object.keys(f).length > 0
    ? [n.interpretation!.gabcBodyHash, Object.keys(f).sort().map((k) => [k, f[k]])]
    : null;
  return ["c", n.id, n.title, n.family ?? "", n.content, wave];
}

/** cyrb53 (domínio público): hash de 53 bits do texto. */
function cyrb53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function projectFingerprint(p: NotkerProject): string {
  return cyrb53(JSON.stringify([p.title, p.family, p.root.map(canon)]));
}

export interface DirtyTracker { markSaved(p: NotkerProject): void; isDirty(p: NotkerProject): boolean }

export function createDirtyTracker(): DirtyTracker {
  let saved: string | null = null;
  return {
    markSaved(p) { saved = projectFingerprint(p); },
    isDirty(p) { return saved === null || projectFingerprint(p) !== saved; },
  };
}
