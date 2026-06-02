import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { nabcFieldStart, inNabcTextual } from "../editor/context";
import { glyphSvgEl } from "./render";
import type { NeumeSearch } from "./search";
import { composeFromField, setCompose } from "./compose-state";

export function nabcCompletion(search: () => NeumeSearch): Extension[] {
  return [
    autocompletion({
      activateOnTyping: true,
      override: [(ctx: CompletionContext): CompletionResult | null => {
        const doc = ctx.state.doc.toString();
        const fieldStart = nabcFieldStart(doc, ctx.pos);
        if (fieldStart === -1) return null;
        const cf = ctx.state.field(composeFromField, false);
        const from = (cf !== null && cf !== undefined && cf <= ctx.pos) ? cf : fieldStart;
        const query = doc.slice(from, ctx.pos);
        if (query.length === 0 && !ctx.explicit) return null;
        const results = search().query(query, 50);
        const seen = new Set<string>();
        const options: Completion[] = [];
        for (const e of results) {
          if (seen.has(e.nabc)) continue;
          seen.add(e.nabc);
          const svg = e.svg;
          const code = e.nabc;
          options.push({
            label: e.nabc,
            detail: e.displayNames[0],
            type: "constant",
            info: () => glyphSvgEl(svg, 40),
            apply: (view, _c, aFrom, aTo) => {
              view.dispatch({
                changes: { from: aFrom, to: aTo, insert: code },
                selection: { anchor: aFrom + code.length },
                effects: setCompose.of(null),
              });
            },
          });
        }
        return { from, filter: false, options };
      }],
    }),
    // Tab: aceita a sugestão se o popup estiver aberto. DENTRO de um campo NABC,
    // consome o Tab mesmo sem popup (retorna true) para o foco NÃO sair do editor;
    // FORA do NABC, deixa o Tab seguir o comportamento normal (retorna false).
    keymap.of([{
      key: "Tab",
      run: (v: EditorView): boolean => {
        if (acceptCompletion(v)) return true;
        return inNabcTextual(v.state.doc.toString(), v.state.selection.main.head);
      },
    }]),
  ];
}
