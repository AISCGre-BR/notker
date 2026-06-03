// src/neume/nabc-move.ts
//
// Núcleo de "mover neuma" (posicionamento NABC): aplica nudges de altura /
// deslocamento horizontal ao token NABC sob o cursor, expõe um keymap
// CodeMirror (Alt+setas) e uma factory de comandos reutilizáveis por botões.
//
// Funções puras (applyMove) não dependem de CodeMirror — 100% testáveis.
// A casca CodeMirror (keymap / runMove) usa @codemirror/view.

import { nudgePitch, nudgeHShift, resetPosition } from "./positions";
import { outermostNabcAt } from "../editor/context";
import { keymap, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type MoveAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "left-large"
  | "right-large"
  | "reset";

export interface MoveEdit {
  from: number;
  to: number;
  insert: string;
}

// Tipo mínimo do tree-sitter para desacoplar do import de web-tree-sitter
// (os testes podem injetar um mock sem depender do módulo nativo).
interface TSTree {
  rootNode: unknown;
}

// ---------------------------------------------------------------------------
// applyMove — função pura
// ---------------------------------------------------------------------------

/**
 * Dado um parse tree, o documento completo como string, a posição do cursor e
 * a ação desejada, devolve a edição a aplicar ou `null` se o cursor não estiver
 * sobre um token NABC.
 *
 * Regra do `|` inicial:
 *   – Se o token bruto começa com `|`, o `|` é separador GABC/NABC e NÃO faz
 *     parte do conteúdo de posicionamento; opera-se no conteúdo após o `|` e
 *     o `from` é ajustado para `tokenFrom + 1`.
 */
export function applyMove(
  tree: TSTree,
  doc: string,
  pos: number,
  action: MoveAction
): MoveEdit | null {
  // Tolerância de fronteira (Bug 1): após um nudge o cursor fica em tokenTo, logo
  // após o nabc_snippet, onde descendantForIndex já não acerta o nó. Provamos pos
  // e, se falhar, pos-1 — assim nudges repetidos funcionam sem reselecionar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx = outermostNabcAt(tree as any, doc, pos);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!ctx.inNabc && pos > 0) ctx = outermostNabcAt(tree as any, doc, pos - 1);
  if (!ctx.inNabc) return null;
  const { tokenFrom, tokenTo } = ctx;

  const raw = doc.slice(tokenFrom, tokenTo);

  // Ajuste do `|` inicial: o separador não é conteúdo de posicionamento.
  const hasPipe = raw.startsWith("|");
  const contentFrom = hasPipe ? tokenFrom + 1 : tokenFrom;
  const token = hasPipe ? raw.slice(1) : raw;

  // Aplica a função pura correspondente à ação.
  let insert: string;
  switch (action) {
    case "up":
      insert = nudgePitch(token, +1);
      break;
    case "down":
      insert = nudgePitch(token, -1);
      break;
    case "right":
      insert = nudgeHShift(token, +1, false);
      break;
    case "left":
      insert = nudgeHShift(token, -1, false);
      break;
    case "right-large":
      insert = nudgeHShift(token, +1, true);
      break;
    case "left-large":
      insert = nudgeHShift(token, -1, true);
      break;
    case "reset":
      insert = resetPosition(token);
      break;
    default: {
      // TypeScript narrowing — nunca chegará aqui.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }

  return { from: contentFrom, to: tokenTo, insert };
}

// ---------------------------------------------------------------------------
// Casca CodeMirror
// ---------------------------------------------------------------------------

/**
 * Executa a ação de mover sobre a view ativa.
 * Exportado para uso por botões / comandos externos.
 * Retorna `true` se a edição foi aplicada, `false` caso contrário.
 */
export function runMove(
  view: EditorView,
  getTree: () => TSTree | null,
  action: MoveAction
): boolean {
  const tree = getTree();
  if (!tree) return false;

  const doc = view.state.doc.toString();
  const pos = view.state.selection.main.head;
  const edit = applyMove(tree, doc, pos, action);
  if (!edit) return false;

  // Cursor permanece no INÍCIO do neuma movido (dentro do nabc_snippet), para que
  // o próximo nudge encontre o mesmo token sem reselecionar (Bug 1).
  view.dispatch({
    changes: edit,
    selection: { anchor: edit.from },
  });
  return true;
}

/**
 * Cria um Extension CodeMirror com os atalhos Alt+setas para mover o neuma.
 *
 * Mapeamento:
 *   Alt-ArrowUp        → up
 *   Alt-ArrowDown      → down
 *   Alt-ArrowRight     → right
 *   Alt-ArrowLeft      → left
 *   Shift-Alt-ArrowRight → right-large
 *   Shift-Alt-ArrowLeft  → left-large
 *   Alt-0              → reset
 */
export function nabcMoveKeymap(getTree: () => TSTree | null): Extension {
  return keymap.of([
    { key: "Alt-ArrowUp",           run: (v) => runMove(v, getTree, "up") },
    { key: "Alt-ArrowDown",         run: (v) => runMove(v, getTree, "down") },
    { key: "Alt-ArrowRight",        run: (v) => runMove(v, getTree, "right") },
    { key: "Alt-ArrowLeft",         run: (v) => runMove(v, getTree, "left") },
    { key: "Shift-Alt-ArrowRight",  run: (v) => runMove(v, getTree, "right-large") },
    { key: "Shift-Alt-ArrowLeft",   run: (v) => runMove(v, getTree, "left-large") },
    { key: "Alt-0",                 run: (v) => runMove(v, getTree, "reset") },
  ]);
}
