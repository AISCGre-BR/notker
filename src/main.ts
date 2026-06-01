import { EditorView } from "@codemirror/view";
import { createEditor, externalLinter } from "./editor/editor";
import { LspClient } from "./lsp/client";
import { SidecarTransport } from "./lsp/transport-sidecar";
import { lspDiagnosticsToCM, formatDocument } from "./lsp/cm-lsp";
import { makeTreeSitterHighlighter } from "./editor/highlight-tree-sitter";
import { forceLinting } from "@codemirror/lint";
import { openGabc, saveAsGabc } from "./files/file-io";
import type { Diagnostic } from "@codemirror/lint";
import grammarWasmUrl from "./assets/tree-sitter-gregorio.wasm?url";
import runtimeWasmUrl from "./assets/tree-sitter.wasm?url";

/** Tipo inferido do segundo parâmetro de lspDiagnosticsToCM (não exportado do módulo). */
type LspDiagnosticParam = Parameters<typeof lspDiagnosticsToCM>[1][number];

const URI = "inmemory://notker.gabc";
let diagnostics: Diagnostic[] = [];

async function boot() {
  const app = document.querySelector<HTMLElement>("#app")!;
  app.textContent = "";

  // Collect extra extensions; highlighter is optional — a WASM load failure
  // must not prevent the editor from mounting.
  const extraExtensions: Parameters<typeof createEditor>[2] = [];

  try {
    const highlighter = await makeTreeSitterHighlighter(runtimeWasmUrl, grammarWasmUrl);
    extraExtensions.push(highlighter);
  } catch (err) {
    console.error("[notker] falha ao carregar highlighter WASM; editor inicia sem realce de sintaxe:", err);
  }

  // Wire a doc-change callback before constructing the editor so the
  // updateListener can reference it.  The real callback is assigned after
  // the LSP client is ready; until then it is a no-op.
  let onDocChange = () => {};

  extraExtensions.push(
    externalLinter(() => diagnostics),
    EditorView.updateListener.of((u) => { if (u.docChanged) onDocChange(); }),
  );

  const view = createEditor(app, "name: Novo;\n%%\n(c4) ", extraExtensions);

  const client = new LspClient(new SidecarTransport());
  client.onNotification("textDocument/publishDiagnostics", (p: { uri: string; diagnostics: LspDiagnosticParam[] }) => {
    if (p.uri !== URI) return;
    diagnostics = lspDiagnosticsToCM(view.state.doc, p.diagnostics);
    forceLinting(view); // força o linter a re-pintar os diagnósticos
  });
  await client.start();
  await client.request("initialize", { processId: null, capabilities: {}, rootUri: null });
  client.notify("initialized", {});
  client.notify("textDocument/didOpen", {
    textDocument: { uri: URI, languageId: "gabc", version: 1, text: view.state.doc.toString() },
  });
  let version = 1;
  const sync = () => client.notify("textDocument/didChange", {
    textDocument: { uri: URI, version: ++version },
    contentChanges: [{ text: view.state.doc.toString() }],
  });
  // Use the updateListener wired above — captures ALL edits (paste, undo/redo,
  // programmatic replacements), not just physical keystrokes.
  onDocChange = sync;

  window.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.key === "o") { e.preventDefault(); const r = await openGabc(); if (r) location.reload(); }
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); await saveAsGabc(view.state.doc.toString()); }
    if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      const f = await formatDocument(client, URI, view.state.doc);
      if (f != null) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: f } });
    }
  });
}

boot().catch((err) => {
  const app = document.querySelector("#app");
  if (app) app.textContent = "Falha ao iniciar o Notker: " + String(err);
  console.error(err);
});
