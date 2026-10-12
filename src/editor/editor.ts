import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { lintGutter, linter, type Diagnostic } from "@codemirror/lint";

/** Extensões base + extras, na MESMA ordem para todo estado (um por canto). */
export function editorExtensions(extra: Extension[]): Extension[] {
  return [
    lineNumbers(), history(), lintGutter(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    ...extra,
  ];
}

export function createEditorState(doc: string, extra: Extension[]): EditorState {
  return EditorState.create({ doc, extensions: editorExtensions(extra) });
}

export function createEditor(parent: HTMLElement, doc: string, extra: Extension[]): EditorView {
  return new EditorView({ parent, state: createEditorState(doc, extra) });
}

/** Fonte de diagnósticos controlada externamente (alimentada pelo LSP). */
export function externalLinter(get: () => Diagnostic[]): Extension {
  return linter(() => get());
}
