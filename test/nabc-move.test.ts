// test/nabc-move.test.ts
//
// Testa applyMove (função pura) com mocks manuais do tree-sitter,
// no mesmo padrão de mock de test/context.test.ts.
//
// NÃO carrega web-tree-sitter real; usa objetos JS que satisfazem a interface
// TSNode/TSTree esperada por outermostNabcAt em context.ts.

import { describe, it, expect } from "vitest";
import { applyMove } from "../src/neume/nabc-move";

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

/** Interface minimal de TSNode compatível com context.ts (sem ciclos de tipo). */
interface MockNode {
  type: string;
  startIndex: number;
  endIndex: number;
  parent: MockNode | null;
  childCount: number;
  child(i: number): MockNode | null;
  descendantForIndex(pos: number): MockNode | null;
}

/** Constrói um MockNode minimal compatível com context.ts. */
function makeNode(
  type: string,
  startIndex: number,
  endIndex: number,
  parent: MockNode | null = null
): MockNode {
  const node: MockNode = {
    type,
    startIndex,
    endIndex,
    parent,
    childCount: 0,
    child: (_i: number) => null,
    // descendantForIndex devolve o próprio nó se `pos` está dentro do range.
    descendantForIndex: (pos: number) => {
      if (pos >= startIndex && pos < endIndex) return node;
      return null;
    },
  };
  return node;
}

/**
 * Constrói um mock de TSTree cujo rootNode delega a descendantForIndex ao
 * `nabcNode` fornecido, ou devolve um nó fora de NABC (tipo "lyric") quando
 * `pos` está fora do range do token nabc.
 */
function makeTree(nabcNode: MockNode) {
  const outsideNode = makeNode("lyric", 0, 0);
  const rootNode = {
    type: "source_file",
    startIndex: 0,
    endIndex: 9999,
    parent: null,
    childCount: 1,
    child: (_i: number) => nabcNode,
    descendantForIndex: (pos: number) => {
      // Delega ao nó nabc se pos está dentro; senão devolve outsideNode.
      const hit = nabcNode.descendantForIndex(pos);
      return hit ?? outsideNode;
    },
  };
  return { rootNode };
}

// ---------------------------------------------------------------------------
// Documento de fixture
// ---------------------------------------------------------------------------

// GABC mínimo com um token NABC "(h|vi)"
// Estrutura: "nabc-lines: 1;\nname: x;\n%%\n(h|vi)"
//            posições:   0             14    19 20 21 22 23 24
// O token NABC "vi" começa em posição 22 (após "nabc-lines: 1;\nname: x;\n%%\n(h|")
// Calculamos abaixo de forma programática para robustez.

const DOC_SIMPLE = "nabc-lines: 1;\nname: x;\n%%\n(h|vi)";
// Posição do "v" de "vi" no doc.
const TOKEN_SIMPLE_FROM = DOC_SIMPLE.indexOf("vi");       // 28
const TOKEN_SIMPLE_TO   = TOKEN_SIMPLE_FROM + 2;          // 30  (exclusive)
// Posição do "|" (separador) é TOKEN_SIMPLE_FROM - 1.
// O outermostNabcAt recebe tokenFrom=TOKEN_SIMPLE_FROM, tokenTo=TOKEN_SIMPLE_TO.
// O raw será "vi" — sem "|" inicial porque o node nabc_snippet cobre só "vi".

// Posição do cursor dentro do token (qualquer ponto entre from e to).
const POS_INSIDE_SIMPLE = TOKEN_SIMPLE_FROM + 1;

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("applyMove (puro, mock de tree-sitter)", () => {

  // ----- caso 1: Alt+↑ sobe o pitch (vi → vihg) -----
  it("Alt+↑ sobre '(h|vi)' → insert 'vihg'", () => {
    // Token nabc_snippet cobre "vi" (sem o "|", que é parte da nota GABC).
    const nabcNode = makeNode("nabc_snippet", TOKEN_SIMPLE_FROM, TOKEN_SIMPLE_TO);
    const tree = makeTree(nabcNode);

    const edit = applyMove(tree, DOC_SIMPLE, POS_INSIDE_SIMPLE, "up");

    expect(edit).not.toBeNull();
    expect(edit!.from).toBe(TOKEN_SIMPLE_FROM);
    expect(edit!.to).toBe(TOKEN_SIMPLE_TO);
    expect(edit!.insert).toBe("vihg");
  });

  // ----- caso 2: Alt+→ desloca à direita (vi → /vi) -----
  it("Alt+→ sobre '(h|vi)' → insert '/vi'", () => {
    const nabcNode = makeNode("nabc_snippet", TOKEN_SIMPLE_FROM, TOKEN_SIMPLE_TO);
    const tree = makeTree(nabcNode);

    const edit = applyMove(tree, DOC_SIMPLE, POS_INSIDE_SIMPLE, "right");

    expect(edit).not.toBeNull();
    expect(edit!.insert).toBe("/vi");
    expect(edit!.from).toBe(TOKEN_SIMPLE_FROM);
    expect(edit!.to).toBe(TOKEN_SIMPLE_TO);
  });

  // ----- caso 3: Alt+0 reset em "(h|//vihg)" → insert "vi" -----
  it("Alt+0 sobre '(h|//vihg)' → insert 'vi'", () => {
    const DOC_SHIFTED = "nabc-lines: 1;\nname: x;\n%%\n(h|//vihg)";
    const tfrom = DOC_SHIFTED.indexOf("//vihg");
    const tto   = tfrom + "//vihg".length;
    const pos   = tfrom + 2; // dentro de "//vihg"

    const nabcNode = makeNode("nabc_snippet", tfrom, tto);
    const tree     = makeTree(nabcNode);

    const edit = applyMove(tree, DOC_SHIFTED, pos, "reset");

    expect(edit).not.toBeNull();
    expect(edit!.insert).toBe("vi");
    expect(edit!.from).toBe(tfrom);
    expect(edit!.to).toBe(tto);
  });

  // ----- caso 3b (regressão Bug 1): cursor no FIM do token ainda move -----
  // Após um nudge, o cursor fica logo após o token (fronteira do nabc_snippet),
  // onde descendantForIndex já não acerta o nó. applyMove deve tolerar isso
  // (provar pos-1) para que nudges repetidos funcionem sem reselecionar.
  it("cursor na fronteira final do token ainda move o mesmo neuma (Bug 1)", () => {
    const nabcNode = makeNode("nabc_snippet", TOKEN_SIMPLE_FROM, TOKEN_SIMPLE_TO);
    const tree = makeTree(nabcNode);
    const edit = applyMove(tree, DOC_SIMPLE, TOKEN_SIMPLE_TO, "up"); // pos == tokenTo
    expect(edit).not.toBeNull();
    expect(edit!.insert).toBe("vihg");
  });

  // ----- caso 4: cursor fora de NABC → null -----
  it("cursor fora de NABC → applyMove devolve null", () => {
    // Nó nabc está em [TOKEN_SIMPLE_FROM, TOKEN_SIMPLE_TO); cursor fora.
    const nabcNode = makeNode("nabc_snippet", TOKEN_SIMPLE_FROM, TOKEN_SIMPLE_TO);
    const tree     = makeTree(nabcNode);

    // Posição na sílaba "Pó" (bem antes do token nabc).
    const posOutside = DOC_SIMPLE.indexOf("(h"); // antes do |, dentro da nota mas não é NABC

    // Com o mock, descendantForIndex para posOutside devolve outsideNode (tipo "lyric"),
    // que não está em NABC_KINDS → outermostNabcAt retorna inNabc=false.
    const edit = applyMove(tree, DOC_SIMPLE, posOutside, "up");

    expect(edit).toBeNull();
  });

  // ----- caso 5: token com "|" inicial (raw do nó inclui o separador) -----
  it("token com '|' inicial: from ajustado, '|' não faz parte do insert", () => {
    // Simula um nó cujo range inclui o "|" (tokenFrom aponta para o "|").
    // Ex: raw = "|vi", token real = "vi".
    const DOC_PIPE = "nabc-lines: 1;\nname: x;\n%%\n(h|vi)";
    const pipeIdx  = DOC_PIPE.indexOf("|");       // índice do "|"
    const tfrom    = pipeIdx;                      // range inclui o "|"
    const tto      = pipeIdx + 3;                  // "|vi"
    const pos      = pipeIdx + 2;                  // dentro de "vi"

    const nabcNode = makeNode("nabc_snippet", tfrom, tto);
    const tree     = makeTree(nabcNode);

    const edit = applyMove(tree, DOC_PIPE, pos, "up");

    expect(edit).not.toBeNull();
    // from deve pular o "|"
    expect(edit!.from).toBe(tfrom + 1);
    expect(edit!.to).toBe(tto);
    // insert deve ser o resultado de nudgePitch("vi", +1) = "vihg"
    expect(edit!.insert).toBe("vihg");
  });
});
