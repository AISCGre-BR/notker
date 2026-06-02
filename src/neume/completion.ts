import { autocompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt } from "../editor/context";
import type { NeumeSearch } from "./search";
import { glyphSvgEl } from "./render";

export function nabcCompletion(getTree: () => Tree | null, search: () => NeumeSearch) {
  return autocompletion({
    activateOnTyping: true,
    override: [(ctx: CompletionContext): CompletionResult | null => {
      const tree = getTree();
      if (!tree) return null;
      const doc = ctx.state.doc.toString();
      const nc = nabcContextAt(tree as any, doc, ctx.pos);
      if (!nc.inNabc) return null;
      const word = ctx.matchBefore(/[A-Za-z0-9>!~-]*/);
      if (!word) return null;
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
          info: (_c: Completion) => glyphSvgEl(svg, 40),
        });
      }
      return { from: word.from, filter: false, options };
    }],
  });
}
