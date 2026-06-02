import "./ui/tokens.css";
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
import { loadNeumeDb } from "./neume/db-load";
import { loadUserOverlay, saveUserOverlay, exportOverlay, importOverlay } from "./neume/overlay-io";
import { mergeEntry, addName, mergeOverlays } from "./neume/overlay";
import { NeumeSearch } from "./neume/search";
import { neumeExtensions } from "./neume/index";
import { gabcAssistExtensions } from "./gabc/index";
import type { Overlay, EffectiveEntry, Family } from "./neume/types";
import type { Tree } from "web-tree-sitter";
import { createCommands } from "./ui/commands";
import { createToolbar } from "./ui/toolbar";
import { NabcLibEngine } from "./preview/nabc-lib";
import { createPreviewPanel } from "./preview/panel";
import { installSync, syncFromCursor } from "./preview/sync";
import { createOverlayPanel } from "./overlay-ui/panel";
import { createSplit, type Split } from "./ui/split";

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

  setStatus(highlightStatus + "  ·  LSP: conectado");

  // effectiveRef: hoistado para fora do bloco F2 para que os comandos o alcancem.
  let effectiveRef: () => EffectiveEntry[] = () => [];

  // Variáveis de overlay, reindex e família ativa — hoistadas para o handler de teclado.
  let overlay: Overlay = { schema: 1, kind: "notker-neume-overlay", entries: {} };
  let reindex = () => {};
  let activeFamily: Family = "stgall";

  function familyLabel(f: Family): string { return f === "stgall" ? "St. Gall" : "Laon"; }
  function updateFamilyIndicator(): void {
    const el = document.querySelector("#family");
    if (el) {
      el.textContent = "✠ " + familyLabel(activeFamily);
      (el as HTMLElement).title = "Família ativa (clique ou Ctrl/Cmd+Shift+G para alternar)";
    }
  }
  function toggleFamily(): void {
    activeFamily = activeFamily === "stgall" ? "laon" : "stgall";
    updateFamilyIndicator();
    reindex();
  }

  // Carrega db de neumas e reconfigura o compartment F2.
  try {
    const db = await loadNeumeDb();
    // Overlay é OPCIONAL: uma falha (ex.: permissão de fs ausente) não pode
    // impedir a injeção das extensões F2 (paleta/hover/completion/régua).
    try { overlay = await loadUserOverlay(); }
    catch (e) { console.warn("[notker] overlay de nomes indisponível (usando vazio):", e); }
    const effective = (): EffectiveEntry[] => db.all().map((e) => mergeEntry(e, overlay.entries[e.id]));
    effectiveRef = effective;
    let searchInst = new NeumeSearch(effective(), activeFamily);
    reindex = () => { searchInst = new NeumeSearch(effective(), activeFamily); };
    // Agrupamento por nabc: múltiplas entradas (famílias diferentes) podem compartilhar o mesmo código.
    const byNabc = new Map<string, import("./neume/types").NeumeEntry[]>();
    for (const e of db.all()) {
      const arr = byNabc.get(e.nabc) ?? [];
      arr.push(e);
      byNabc.set(e.nabc, arr);
    }
    const rt = {
      getTree,
      search: () => searchInst,
      lookupByNabc: (nabc: string): EffectiveEntry[] =>
        (byNabc.get(nabc) ?? []).map((e) => mergeEntry(e, overlay.entries[e.id])),
      activeFamily: () => activeFamily,
      onAddName: async (id: string) => {
        const name = window.prompt("Novo nome para este neuma:");
        if (!name) return;
        overlay = addName(overlay, id, name);
        reindex();
        try { await saveUserOverlay(overlay); setStatus("nome adicionado: " + name); }
        catch (e) { setStatus("nome adicionado (não persistido): " + String(e)); }
      },
    };
    view.dispatch({ effects: neumeCompartment.reconfigure([...neumeExtensions(rt), ...gabcAssistExtensions(getTree)]) });
    updateFamilyIndicator();
    document.querySelector("#family")?.addEventListener("click", toggleFamily);
  } catch (err) {
    console.error("[notker] falha ao carregar neume-db (F2):", err);
    setStatus("neumas: indisponível — " + String(err));
  }

  /** Substitui todo o conteúdo do editor (usado ao abrir arquivo). */
  function replaceDoc(text: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  // Preview ao vivo + divisor redimensionável. Fica DEPOIS do bloco F2 e dentro de
  // try/catch para que as assistências (hover/completion/paleta) carreguem sempre,
  // mesmo que o motor de preview (webview-only) falhe.
  const previewHost = document.querySelector<HTMLElement>("#preview")!;
  let split: Split = { orientation: () => "horizontal", setOrientation: () => {}, toggle: () => {} };
  try {
    const engine = new NabcLibEngine();
    const panel = createPreviewPanel(previewHost, engine, { debounceMs: 250 });
    installSync(view, panel);
    panel.update(view.state.doc.toString());
    // Encadeia no onDocChange (que já vale o sync/LSP didChange) sem substituí-lo.
    const prevOnDocChange = onDocChange;
    onDocChange = () => { prevOnDocChange(); panel.update(view.state.doc.toString()); };
    // Realce de sílaba segue o cursor.
    view.dom.addEventListener("keyup", () => syncFromCursor(view, panel));
    view.dom.addEventListener("mouseup", () => syncFromCursor(view, panel));
    const workspace = document.querySelector<HTMLElement>("#workspace")!;
    split = createSplit(workspace, app, previewHost, "horizontal");
  } catch (err) {
    console.error("[notker] preview ao vivo indisponível:", err);
  }

  const commands = createCommands({
    openFile: async () => {
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
    },
    saveFile: async () => {
      try {
        setStatus("Ctrl+S: salvando…");
        const p = await saveAsGabc(view.state.doc.toString());
        setStatus(p ? "salvo: " + p : "Ctrl+S: cancelado");
      } catch (err) {
        setStatus("Ctrl+S ERRO: " + String(err));
        console.error("[notker] erro ao salvar:", err);
      }
    },
    format: async () => {
      try {
        const f = await formatDocument(client, URI, view.state.doc);
        if (f != null) { replaceDoc(f); setStatus("formatado"); }
        else setStatus("formatar: sem alterações");
      } catch (err) {
        setStatus("Ctrl+Shift+F ERRO: " + String(err));
        console.error("[notker] erro ao formatar:", err);
      }
    },
    exportOverlay: async () => {
      try {
        await exportOverlay(overlay);
        setStatus("overlay exportado");
      } catch (err) {
        setStatus("Ctrl+Alt+E ERRO: " + String(err));
        console.error("[notker] erro ao exportar overlay:", err);
      }
    },
    importOverlay: async () => {
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
    },
    toggleFamily: () => { toggleFamily(); },
    // palette.ts não exporta função open isolada; openRun é interno ao keymap.
    // Estratégia: focar o editor e disparar KeyboardEvent "F2" no contentDOM.
    openSearch: () => {
      view.focus();
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
    },
    openOverlayPanel: () => {
      const host = document.querySelector<HTMLElement>("#overlay-host")!;
      host.style.display = "block";
      const op = createOverlayPanel(host, {
        entries: effectiveRef,
        onSave: async (o) => {
          overlay = mergeOverlays(overlay, o);
          await saveUserOverlay(overlay);
          reindex();
          host.style.display = "none";
        },
      });
      op.open();
    },
    togglePreview: () => {
      previewHost.style.display = previewHost.style.display === "none" ? "" : "none";
    },
    toggleSplit: () => { split.toggle(); },
  });

  createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
    { id: "openFile", label: "Abrir", title: "Ctrl+O" },
    { id: "saveFile", label: "Salvar", title: "Ctrl+S" },
    { id: "format", label: "Formatar", title: "Ctrl+Shift+F" },
    { id: "openSearch", label: "Buscar", title: "F2" },
    { id: "openOverlayPanel", label: "Overlay", title: "Ctrl+Alt+E/I" },
    { id: "toggleFamily", label: "Família", title: "Ctrl+Shift+G" },
    { id: "togglePreview", label: "Preview", title: "mostrar/ocultar painel" },
    { id: "toggleSplit", label: "Dividir", title: "alternar lado-a-lado / empilhado" },
  ]);

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.shiftKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      void commands.run("openFile");
    }
    if (e.ctrlKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      void commands.run("saveFile");
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      void commands.run("format");
    }
    if (e.ctrlKey && e.altKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      void commands.run("exportOverlay");
    }
    if (e.ctrlKey && e.altKey && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      void commands.run("importOverlay");
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
      e.preventDefault();
      void commands.run("toggleFamily");
    }
  });
}

boot().catch((err) => {
  const app = document.querySelector("#app");
  if (app) app.textContent = "Falha ao iniciar o Notker: " + String(err);
  setStatus("BOOT ERRO: " + String(err));
  console.error(err);
});
