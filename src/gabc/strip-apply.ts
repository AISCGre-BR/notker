/** Ligação do "remover episemas e puncta mora" ao editor: observa colagens, guarda o trecho
 *  colado (mapeado pelas edições seguintes) e aplica `stripMarks` num trecho numa só transação. */
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { bodyStart, detectMarks, stripMarks, type MarkCounts, type MarkKinds } from "./strip-marks";

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

/** Extensão: depois de uma colagem com sinais, guarda o intervalo e chama `onMarks`. */
export function pasteMarksWatcher(onMarks: (range: Range, counts: MarkCounts) => void): Extension {
  return [
    pastedRange,
    EditorState.transactionExtender.of((tr) => {
      if (!tr.docChanged || !tr.isUserEvent("input.paste")) return null;
      const bs = bodyStart(tr.newDoc.toString());
      let lo = Infinity, hi = -1;
      tr.changes.iterChanges((_fa, _ta, fb, tb, ins) => {
        if (tb <= bs) return; // colado no cabeçalho
        const text = ins.toString();
        const a = Math.max(fb, bs);
        const t = a === fb ? text : text.slice(a - fb);
        const c = detectMarks(t);
        if (c.vertical + c.horizontal + c.mora === 0) return;
        lo = Math.min(lo, a);
        hi = Math.max(hi, tb);
      });
      return hi >= 0 ? { effects: setPasted.of({ from: lo, to: hi }) } : null;
    }),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || !u.transactions.some((t) => t.isUserEvent("input.paste"))) return;
      const r = u.state.field(pastedRange, false);
      if (!r || !u.transactions.some((t) => t.effects.some((e) => e.is(setPasted)))) return;
      const c = detectMarks(u.state.sliceDoc(r.from, r.to));
      if (c.vertical + c.horizontal + c.mora > 0) onMarks(r, c);
    }),
  ];
}

/** Contagens dos sinais em [from,to) (ou no canto todo, respeitando o início do corpo). */
export function marksIn(state: EditorState, range?: Range): MarkCounts {
  return detectMarks(clamp(state, range).text);
}

function clamp(state: EditorState, range?: Range): { from: number; to: number; text: string } {
  const bs = bodyStart(state.doc.toString());
  const from = Math.max(range ? range.from : 0, bs);
  const to = Math.max(from, range ? Math.min(range.to, state.doc.length) : state.doc.length);
  return { from, to, text: state.sliceDoc(from, to) };
}

/** Aplica a remoção ao trecho (ou ao canto) numa única transação. Devolve quantos sinais saíram. */
export function applyStrip(view: EditorView, kinds: MarkKinds, range?: Range): number {
  const { from, to, text } = clamp(view.state, range);
  const r = stripMarks(text, kinds);
  const n = r.counts.vertical + r.counts.horizontal + r.counts.mora; // só os tipos escolhidos são contados
  if (n === 0 || r.text === text) return 0;
  view.dispatch({ changes: { from, to, insert: r.text }, userEvent: "input.strip-marks" });
  return n;
}
