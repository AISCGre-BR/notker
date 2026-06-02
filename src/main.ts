import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { createEditor, externalLinter } from "./editor/editor";
import { highlightTheme } from "./editor/theme";
import { LspClient } from "./lsp/client";
import { SidecarTransport } from "./lsp/transport-sidecar";
import { lspDiagnosticsToCM, formatDocument } from "./lsp/cm-lsp";
import { makeTreeSitterHighlighter } from "./editor/highlight-tree-sitter";
import { forceLinting } from "@codemirror/lint";
import { openGabc, saveAsGabc } from "./files/file-io";
import type { Diagnostic } from "@codemirror/lint";
import grammarWasmUrl from "./assets/tree-sitter-gregorio.wasm?url";
import runtimeWasmUrl from "./assets/tree-sitter.wasm?url";
import { loadNeumeDb } from "./neume/db";
import { loadUserOverlay, saveUserOverlay, exportOverlay, importOverlay } from "./neume/overlay-io";
import { mergeEntry, addName, mergeOverlays } from "./neume/overlay";
import { NeumeSearch } from "./neume/search";
import { neumeExtensions } from "./neume/index";
import { gabcAssistExtensions } from "./gabc/index";
import type { Overlay, EffectiveEntry } from "./neume/types";
import type { Tree } from "web-tree-sitter";

/** Tipo inferido do segundo parâmetro de lspDiagnosticsToCM (não exportado do módulo). */
type LspDiagnosticParam = Parameters<typeof lspDiagnosticsToCM>[1][number];

const URI = "inmemory://notker.gabc";
let diagnostics: Diagnostic[] = [];

/** Escreve uma linha de status no rodapé (instrumentação visível de runtime). */
function setStatus(msg: string): void {
  const el = document.querySelector("#status");
  if (el) el.textContent = msg;
}

async function boot() {
  const app = document.querySelector<HTMLElement>("#app")!;
  app.textContent = "";

  // O tema (cores dos tokens) é SEMPRE incluído — independente de o WASM do
  // realce carregar — para que as marcas de decoração tenham cor quando existirem.
  const extraExtensions: Parameters<typeof createEditor>[2] = [highlightTheme];

  // Highlighter é opcional: uma falha de carga do WASM não pode impedir o editor
  // de montar. Reportamos o resultado no rodapé de status.
  let highlightStatus = "realce: ativo";
  let getTree: () => Tree | null = () => null;
  try {
    const ts = await makeTreeSitterHighlighter(runtimeWasmUrl, grammarWasmUrl);
    extraExtensions.push(ts.extension);
    getTree = ts.getTree;
  } catch (err) {
    highlightStatus = "realce: FALHOU — " + String(err);
    console.error("[notker] falha ao carregar highlighter WASM:", err);
  }

  // Callback de mudança de doc, referenciado pelo updateListener; o valor real é
  // atribuído após o cliente LSP estar pronto.
  let onDocChange = () => {};

  extraExtensions.push(
    externalLinter(() => diagnostics),
    EditorView.updateListener.of((u) => { if (u.docChanged) onDocChange(); }),
  );

  // Compartment para injetar extensões F2 após o carregamento assíncrono do db.
  const neumeCompartment = new Compartment();
  extraExtensions.push(neumeCompartment.of([]));

  const view = createEditor(app, "name: Novo;\n%%\n(c4) ", extraExtensions);

  const client = new LspClient(new SidecarTransport());
  client.onNotification("textDocument/publishDiagnostics", (p: { uri: string; diagnostics: LspDiagnosticParam[] }) => {
    if (p.uri !== URI) return;
    diagnostics = lspDiagnosticsToCM(view.state.doc, p.diagnostics);
    forceLinting(view);
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
  onDocChange = sync;

  setStatus(highlightStatus + "  ·  LSP: conectado  ·  Ctrl+O abrir · Ctrl+S salvar · Ctrl+Shift+F formatar · Ctrl+Space busca · Ctrl+Alt+L régua · Ctrl+Alt+E/I overlay");

  // Variáveis de overlay e reindex hoistadas para serem acessíveis no handler de teclado.
  let overlay: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: {} };
  let reindex = () => {};

  // Carrega db de neumas e reconfigura o compartment F2.
  try {
    const db = await loadNeumeDb();
    overlay = await loadUserOverlay();
    const effective = (): EffectiveEntry[] => db.all().map((e) => mergeEntry(e, overlay.entries[e.id]));
    let searchInst = new NeumeSearch(effective());
    reindex = () => { searchInst = new NeumeSearch(effective()); };
    const byNabc = new Map(db.all().map((e) => [e.nabc, e] as const));
    const rt = {
      getTree,
      search: () => searchInst,
      lookupByNabc: (nabc: string) => {
        const base = byNabc.get(nabc);
        return base ? mergeEntry(base, overlay.entries[base.id]) : undefined;
      },
      onAddName: async (id: string) => {
        const name = window.prompt("Novo nome para este neuma:");
        if (!name) return;
        overlay = addName(overlay, id, name);
        await saveUserOverlay(overlay);
        reindex();
      },
    };
    view.dispatch({ effects: neumeCompartment.reconfigure([...neumeExtensions(rt), ...gabcAssistExtensions(getTree)]) });
  } catch (err) {
    console.error("[notker] falha ao carregar neume-db (F2):", err);
    setStatus("neumas: indisponível — " + String(err));
  }

  /** Substitui todo o conteúdo do editor (usado ao abrir arquivo). */
  function replaceDoc(text: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  window.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && !e.shiftKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      try {
        setStatus("Ctrl+O: abrindo diálogo…");
        const r = await openGabc();
        if (!r) { setStatus("Ctrl+O: cancelado"); return; }
        replaceDoc(r.content); // carrega o conteúdo de fato (antes fazia location.reload e perdia tudo)
        setStatus("aberto: " + r.path);
      } catch (err) {
        setStatus("Ctrl+O ERRO: " + String(err));
        console.error("[notker] erro ao abrir:", err);
      }
    }
    if (e.ctrlKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      try {
        setStatus("Ctrl+S: salvando…");
        const p = await saveAsGabc(view.state.doc.toString());
        setStatus(p ? "salvo: " + p : "Ctrl+S: cancelado");
      } catch (err) {
        setStatus("Ctrl+S ERRO: " + String(err));
        console.error("[notker] erro ao salvar:", err);
      }
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      try {
        const f = await formatDocument(client, URI, view.state.doc);
        if (f != null) { replaceDoc(f); setStatus("formatado"); }
        else setStatus("formatar: sem alterações");
      } catch (err) {
        setStatus("Ctrl+Shift+F ERRO: " + String(err));
        console.error("[notker] erro ao formatar:", err);
      }
    }
    if (e.ctrlKey && e.altKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      try {
        await exportOverlay(overlay);
        setStatus("overlay exportado");
      } catch (err) {
        setStatus("Ctrl+Alt+E ERRO: " + String(err));
        console.error("[notker] erro ao exportar overlay:", err);
      }
    }
    if (e.ctrlKey && e.altKey && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      try {
        const imported = await importOverlay();
        if (!imported) { setStatus("importar: cancelado"); return; }
        overlay = mergeOverlays(overlay, imported);
        await saveUserOverlay(overlay);
        reindex();
        setStatus("overlay importado");
      } catch (err) {
        setStatus("Ctrl+Alt+I ERRO: " + String(err));
        console.error("[notker] erro ao importar overlay:", err);
      }
    }
  });
}

boot().catch((err) => {
  const app = document.querySelector("#app");
  if (app) app.textContent = "Falha ao iniciar o Notker: " + String(err);
  setStatus("BOOT ERRO: " + String(err));
  console.error(err);
});
