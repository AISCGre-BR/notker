import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { lintGutter, linter, type Diagnostic } from "@codemirror/lint";

export function createEditor(parent: HTMLElement, doc: string, extra: Extension[]): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(), history(), lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        ...extra,
      ],
    }),
  });
}

/** Fonte de diagnósticos controlada externamente (alimentada pelo LSP). */
export function externalLinter(get: () => Diagnostic[]): Extension {
  return linter(() => get());
}
