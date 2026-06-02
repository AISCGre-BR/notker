import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Tree } from "web-tree-sitter";
import { nabcContextAt } from "../editor/context";
import type { NeumeSearch } from "./search";

export function nabcCompletion(getTree: () => Tree | null, search: () => NeumeSearch) {
  return autocompletion({
    override: [(ctx: CompletionContext): CompletionResult | null => {
      const tree = getTree();
      if (!tree) return null;
      const doc = ctx.state.doc.toString();
      const nc = nabcContextAt(tree as any, doc, ctx.pos);
      if (!nc.inNabc) return null;
      const word = ctx.matchBefore(/[A-Za-z0-9>!~-]*/);
      if (!word) return null;
      const results = search().query(word.text, 50);
      return {
        from: word.from,
        options: results.map((e) => ({
          label: e.nabc, detail: e.displayNames[0], type: "constant",
        })),
      };
    }],
  });
}
