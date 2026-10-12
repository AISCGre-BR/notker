/** Ligação do "remover episemas e puncta mora" ao editor: observa colagens, guarda o trecho
 *  colado (mapeado pelas edições seguintes) e aplica `stripMarks` num trecho numa só transação. */
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { detectMarks, scanMarks, type MarkCounts, type MarkKinds } from "./strip-marks";

export interface Range { from: number; to: number }

const setPasted = StateEffect.define<Range | null>();

/** Último trecho colado que tinha sinais, acompanhando as edições posteriores. */
export const pastedRange = StateField.define<Range | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setPasted)) return e.value;
    if (!v || !tr.docChanged) return v;
    const from = tr.changes.mapPos(v.from, 1);
    const to = tr.changes.mapPos(v.to, -1);
    return to > from ? { from, to } : null;
  },
});

const isInsert = (tr: { isUserEvent(e: string): boolean }): boolean => tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop");

/** Extensão: depois de uma colagem/soltura com sinais, guarda o intervalo e chama `onMarks`.
 *  Só vale com UMA mudança (vários cursores: não oferece, nunca junta intervalos). */
export function pasteMarksWatcher(onMarks: (range: Range, counts: MarkCounts) => void): Extension {
  return [
    pastedRange,
    EditorState.transactionExtender.of((tr) => {
      if (!tr.docChanged || !isInsert(tr)) return null;
      const ch: Range[] = [];
      tr.changes.iterChanges((_fa, _ta, fb, tb) => { ch.push({ from: fb, to: tb }); });
      if (ch.length !== 1 || ch[0].to <= ch[0].from) return null;
      // Detecta no documento inteiro (mesmo contexto: letra, comentário, colchete, nabc) só no trecho inserido.
      const c = detectMarks(tr.newDoc.toString(), ch[0]);
      return c.vertical + c.horizontal + c.mora > 0 ? { effects: setPasted.of(ch[0]) } : null;
    }),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || !u.transactions.some((t) => isInsert(t) && t.effects.some((e) => e.is(setPasted)))) return;
      const r = u.state.field(pastedRange, false);
      if (!r) return;
      const c = marksIn(u.state, r);
      if (c.vertical + c.horizontal + c.mora > 0) onMarks(r, c);
    }),
  ];
}

/** Contagens dos sinais em [from,to) (ou no canto todo), lendo o documento inteiro. */
export function marksIn(state: EditorState, range?: Range): MarkCounts {
  return detectMarks(state.doc.toString(), range);
}

/** Remove os sinais do trecho (ou do canto) numa única transação, só com as remoções (histórico e
 *  cursor preservados). Devolve quantos sinais saíram. */
export function applyStrip(view: EditorView, kinds: MarkKinds, range?: Range): number {
  const r = scanMarks(view.state.doc.toString(), kinds, range);
  const n = r.counts.vertical + r.counts.horizontal + r.counts.mora;
  if (n === 0 || r.removals.length === 0) return 0;
  view.dispatch({ changes: r.removals.map((x) => ({ from: x.from, to: x.to })), userEvent: "input.strip-marks" });
  return n;
}
