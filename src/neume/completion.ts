import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { nabcFieldStart } from "../editor/context";
import { glyphSvgEl } from "./render";
import type { NeumeSearch } from "./search";

export function nabcCompletion(search: () => NeumeSearch): Extension[] {
  return [
    autocompletion({
      activateOnTyping: true,
      override: [(ctx: CompletionContext): CompletionResult | null => {
        const doc = ctx.state.doc.toString();
        const from = nabcFieldStart(doc, ctx.pos);
        if (from === -1) return null;
        const query = doc.slice(from, ctx.pos);
        if (query.length === 0 && !ctx.explicit) return null;
        const results = search().query(query, 50);
        const seen = new Set<string>();
        const options: Completion[] = [];
        for (const e of results) {
          if (seen.has(e.nabc)) continue;
          seen.add(e.nabc);
          const svg = e.svg;
          options.push({
            label: e.nabc,
            detail: e.displayNames[0],
            apply: e.nabc,
            type: "constant",
            info: () => glyphSvgEl(svg, 40),
          });
        }
        return { from, filter: false, options };
      }],
    }),
    keymap.of([{ key: "Tab", run: acceptCompletion }]),
  ];
}
