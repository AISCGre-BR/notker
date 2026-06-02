import { StateField, StateEffect } from "@codemirror/state";
import { nabcFieldStart } from "../editor/context";

/** Define/limpa o início do trecho NABC em composição (null = não compondo). */
export const setCompose = StateEffect.define<number | null>();

/** Início (offset) do trecho que o usuário está compondo como UM neuma, ou null. */
export const composeFromField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setCompose)) return e.value;
    let v = value;
    if (tr.docChanged) {
      if (v !== null) v = tr.changes.mapPos(v, 1);
      if (v === null) {
        // primeira digitação dentro de um campo NABC → começa a compor na posição da inserção
        let startPos = -1;
        tr.changes.iterChanges((_fA, _tA, _fromB, toB) => {
          if (startPos === -1 && toB > _fromB) startPos = _fromB;
        });
        if (startPos !== -1 && nabcFieldStart(tr.state.doc.toString(), startPos) !== -1)
          v = startPos;
      }
    }
    if (v !== null && tr.selection) {
      const doc = tr.state.doc.toString();
      const head = tr.state.selection.main.head;
      if (nabcFieldStart(doc, head) === -1 || head < v) v = null; // saiu do campo / cursor antes do início
    }
    return v;
  },
});
