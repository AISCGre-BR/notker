// src/editor/context.ts
//
// Dado um parse tree (tree-sitter-gregorio v0.5.2) e uma posição em bytes,
// determina:
//   (a) se a posição está dentro de um campo NABC e qual o intervalo do token;
//   (b) o tipo do nó na posição;
//   (c) o texto da clave ativa à esquerda da posição.
//
// Nomes reais dos nós descobertos em highlight-tree-sitter.ts + dump empírico:
//   NABC: "nabc_snippet" (cobre o trecho após o separador "|" em grupos de notas)
//   Clave: "c_clef" | "f_clef" | "gabc_clef"  (texto sem parênteses, ex: "c4")

interface TSNode {
  type: string; startIndex: number; endIndex: number;
  parent: TSNode | null;
  childCount: number; child(i: number): TSNode | null;
  namedChildren?: TSNode[];
  descendantForIndex(start: number, end?: number): TSNode | null;
}

interface TSTree {
  rootNode: TSNode;
}

/** Nós do tree-sitter-gregorio que representam anotações NABC. */
const NABC_KINDS = new Set([
  "nabc_snippet",
  "nabc_glyph_descriptor",
  "nabc_complex_glyph_descriptor",
  "nabc_significant_letter_descriptor",
]);

/** Tipos de nós que representam a clave. */
const CLEF_KINDS = new Set(["c_clef", "f_clef", "gabc_clef"]);

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

export interface NabcContext {
  inNabc: boolean;
  tokenFrom: number;
  tokenTo: number;
}

// ---------------------------------------------------------------------------
// Funções internas
// ---------------------------------------------------------------------------

/** Nó mais profundo (folha) na posição `pos`. */
function deepestAt(root: TSNode, pos: number): TSNode {
  return root.descendantForIndex(pos) ?? root;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Tipo do nó mais profundo (folha) na posição `pos`.
 * Sempre devolve uma string (nunca null).
 */
export function nodeKindAt(tree: TSTree, pos: number): string {
  return deepestAt(tree.rootNode, pos).type;
}

/**
 * Range do nó NABC mais EXTERNO sob `pos` (o neuma inteiro, p/ hover de compostos).
 */
export function outermostNabcAt(tree: TSTree, _doc: string, pos: number): NabcContext {
  let node: TSNode | null = tree.rootNode.descendantForIndex(pos);
  let outer: TSNode | null = null;
  while (node) {
    if (NABC_KINDS.has(node.type)) outer = node;
    node = node.parent;
  }
  if (!outer) return { inNabc: false, tokenFrom: pos, tokenTo: pos };
  return { inNabc: true, tokenFrom: outer.startIndex, tokenTo: outer.endIndex };
}

/**
 * Informa se `pos` está dentro de uma anotação NABC e, caso positivo,
 * o intervalo [tokenFrom, tokenTo) do nó NABC mais próximo.
 */
export function nabcContextAt(tree: TSTree, _doc: string, pos: number): NabcContext {
  let node: TSNode | null = tree.rootNode.descendantForIndex(pos);
  while (node) {
    if (NABC_KINDS.has(node.type))
      return { inNabc: true, tokenFrom: node.startIndex, tokenTo: node.endIndex };
    node = node.parent;
  }
  return { inNabc: false, tokenFrom: pos, tokenTo: pos };
}

/**
 * Texto da clave ativa imediatamente à esquerda de `pos`.
 * Exemplos de retorno: `"c4"`, `"f3"`.
 * Retorna `null` se não houver clave à esquerda.
 *
 * Garante que o retorno é apenas o par letra+dígito (ex: "c4"), sem
 * parênteses ou espaços, caso o nó contenha texto diferente.
 */
export function activeClefAt(
  tree: TSTree,
  doc: string,
  pos: number
): string | null {
  let found: string | null = null;

  const walk = (n: TSNode): void => {
    // Nós que começam a partir de `pos` não são "à esquerda"
    if (n.startIndex >= pos) return;

    if (CLEF_KINDS.has(n.type) && n.endIndex <= pos) {
      const raw = doc.slice(n.startIndex, n.endIndex);
      // Extrai exatamente o padrão letra+dígito (c4, f3, cb3, etc.)
      const m = raw.match(/[cfCF][bB]?\d/);
      found = m ? m[0].toLowerCase() : raw.trim();
    }

    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) walk(c);
    }
  };

  walk(tree.rootNode);
  return found;
}
