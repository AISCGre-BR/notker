import { autocompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { inNabcTextual } from "../editor/context";
import { glyphSvgEl } from "./render";
import type { NeumeSearch } from "./search";

export function nabcCompletion(search: () => NeumeSearch) {
  return autocompletion({
    activateOnTyping: true,
    override: [(ctx: CompletionContext): CompletionResult | null => {
      const doc = ctx.state.doc.toString();
      if (!inNabcTextual(doc, ctx.pos)) return null;
      const word = ctx.matchBefore(/[A-Za-z0-9>!~-]*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const results = search().query(word.text, 50);
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
      return { from: word.from, filter: false, options };
    }],
  });
}
