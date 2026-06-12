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
import type { Diagnostic } from "@codemirror/lint";
import grammarWasmUrl from "./assets/tree-sitter-gregorio.wasm?url";
import runtimeWasmUrl from "./assets/tree-sitter.wasm?url";
import { loadNeumeDb } from "./neume/db-load";
import { loadUserOverlay, saveUserOverlay, exportOverlay, importOverlay } from "./neume/overlay-io";
import { mergeEntry, addName, mergeOverlays } from "./neume/overlay";
import { NeumeSearch } from "./neume/search";
import { neumeExtensions } from "./neume/index";
import { nabcMoveKeymap, runMove } from "./neume/nabc-move";
import { gabcAssistExtensions } from "./gabc/index";
import type { Overlay, EffectiveEntry, Family } from "./neume/types";
import type { Tree } from "web-tree-sitter";
import { createCommands } from "./ui/commands";
import { createToolbar } from "./ui/toolbar";
import { newDocumentDialog } from "./ui/new-dialog";
import { NabcLibEngine } from "./preview/nabc-lib";
import { createPreviewPanel } from "./preview/panel";
import { installSync, syncFromCursor } from "./preview/sync";
import { highlightSyllable, clearHighlight } from "./preview/highlight";
import { createPlayer } from "./tuotilo/player";
import { extractAll } from "./tuotilo/signs";
import { computeDurations } from "./tuotilo/duration";
import { DEFAULT_PROFILE } from "./tuotilo/profile";
import { createOverlayPanel } from "./overlay-ui/panel";
import { createSplit, type Split } from "./ui/split";
import { toggleLegend, legendVisible } from "./gabc/staff-legend";
import { openProject, saveProject, exportCurrentGabc, exportAllGabc } from "./files/project-io";
import {
  type NotkerProject, newProject, getActiveDoc, effectiveFamily,
  withActiveContent, setActive, setDocFamily, addDoc, removeDoc,
} from "./project/model";
import { createDocList } from "./project/doc-list";

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
    // F4: Alt+setas movem o neuma sob o cursor (altura/horizontal). O thunk lê o
    // getTree atual (reatribuído quando o highlighter WASM carrega).
    nabcMoveKeymap(() => getTree()),
  );

  // Compartment para injetar extensões F2 após o carregamento assíncrono do db.
  const neumeCompartment = new Compartment();
  extraExtensions.push(neumeCompartment.of([]));

  let project: NotkerProject = newProject({ family: "stgall", name: "Novo" });
  const view = createEditor(app, getActiveDoc(project).content, extraExtensions);

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
  const currentFamily = (): Family => effectiveFamily(project, project.activeId);

  function familyLabel(f: Family): string { return f === "stgall" ? "St. Gall" : "Laon"; }
  function updateFamilyIndicator(): void {
    const el = document.querySelector("#family");
    if (el) {
      el.textContent = "✠ " + familyLabel(currentFamily());
      (el as HTMLElement).title = "Família ativa (clique ou Ctrl/Cmd+Shift+G para alternar)";
    }
  }
  function toggleFamily(): void {
    const f: Family = currentFamily() === "stgall" ? "laon" : "stgall";
    project = setDocFamily(project, project.activeId, f);
    updateFamilyIndicator();
    reindex();
    setStatus("família do documento: " + familyLabel(f) + " — busca/hover priorizam esta notação");
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
    let searchInst = new NeumeSearch(effective(), currentFamily());
    reindex = () => { searchInst = new NeumeSearch(effective(), currentFamily()); };
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
      activeFamily: () => currentFamily(),
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
  // panel é declarado fora do try para que playToggle (Tuotilo) acesse em runtime.
  let panel: ReturnType<typeof createPreviewPanel> | null = null;
  try {
    const engine = new NabcLibEngine();
    panel = createPreviewPanel(previewHost, engine, { debounceMs: 150 });
    installSync(view, panel);
    panel.update(view.state.doc.toString());
    // Encadeia no onDocChange (que já vale o sync/LSP didChange) sem substituí-lo.
    const prevOnDocChange = onDocChange;
    onDocChange = () => { prevOnDocChange(); panel!.update(view.state.doc.toString()); };
    // Realce de sílaba segue o cursor.
    view.dom.addEventListener("keyup", () => syncFromCursor(view, panel!));
    view.dom.addEventListener("mouseup", () => syncFromCursor(view, panel!));
    const workspace = document.querySelector<HTMLElement>("#workspace")!;
    split = createSplit(workspace, app, previewHost, "horizontal");
  } catch (err) {
    console.error("[notker] preview ao vivo indisponível:", err);
  }

  // Tuotilo — player semiológico. AudioContext criado no clique (= gesto do usuário).
  // O panel pode ser null se o preview falhou — todos os caminhos degradam com setStatus.
  const player = createPlayer(() => new AudioContext());

  /** Para o playback de forma consistente: silencia, restaura botão, limpa realce e status. */
  function stopPlayback(reason?: string): void {
    player.stop();
    const btn = document.querySelector<HTMLElement>('.toolbar-btn[title="playback semiológico (Tuotilo)"]');
    if (btn) btn.textContent = "Tocar";
    const svg = panel?.svgEl?.() ?? null;
    if (svg) clearHighlight(svg);
    setStatus(reason ?? "playback: parado");
  }

  const docListHost = document.querySelector<HTMLElement>("#doc-list")!;
  const dialogHost = document.querySelector<HTMLElement>("#dialog-host")!;
  const docList = createDocList(docListHost, {
    onSelect: (id) => switchToDoc(id),
    onAdd: () => void addNewDoc(),
    onRemove: (id) => { project = removeDoc(project, id); syncFromProject(); },
  });

  /** Reflete o doc ativo do projeto no editor + indicadores. */
  function syncFromProject(): void {
    if (player.playing) stopPlayback("playback: interrompido (troca de canto)");
    replaceDoc(getActiveDoc(project).content);
    docList.render(project);
    updateFamilyIndicator();
    reindex();
  }
  function captureEditorIntoProject(): void {
    project = withActiveContent(project, view.state.doc.toString());
  }
  function switchToDoc(id: string): void {
    captureEditorIntoProject();
    project = setActive(project, id);
    syncFromProject();
  }
  // Adiciona um canto novo via popup (família por botões-toggle, sem radio nativo).
  async function addNewDoc(): Promise<void> {
    const r = await newDocumentDialog(dialogHost, { title: "Adicionar canto" });
    if (!r) return;
    captureEditorIntoProject();
    const content = `name: ${r.name ?? "Novo"};\n${r.office ? `office-part: ${r.office};\n` : ""}%%\n(c4) `;
    project = addDoc(project, { title: r.name ?? "Novo", content, family: r.family });
    project = setActive(project, project.docs[project.docs.length - 1].id);
    syncFromProject();
    view.focus();
    setStatus(`canto adicionado: ${r.name ?? "Novo"}`);
  }
  docList.render(project);

  const commands = createCommands({
    // Novo projeto via popup (família por botões-toggle, sem radio nativo que
    // travava o WebKitGTK). O nome vira o cabeçalho name: do canto inicial.
    newProjectCmd: async () => {
      const r = await newDocumentDialog(dialogHost, {
        title: "Novo projeto",
        warning: "substitui o projeto atual — alterações não salvas serão perdidas",
        okLabel: "Substituir",
      });
      if (!r) { setStatus("Novo: cancelado"); return; }
      project = newProject({ family: r.family, name: r.name, office: r.office });
      syncFromProject();
      view.focus();
      setStatus("novo projeto — família " + familyLabel(r.family));
    },
    openFile: async () => {
      try {
        setStatus("abrindo…");
        const p = await openProject();
        if (!p) { setStatus("abrir: cancelado"); return; }
        project = p;
        syncFromProject();
        setStatus("aberto: " + (p.path ?? "projeto (.gabc importado)"));
      } catch (err) { setStatus("abrir ERRO: " + String(err)); console.error(err); }
    },
    saveFile: async () => {
      try {
        captureEditorIntoProject();
        setStatus("salvando projeto…");
        const path = await saveProject(project);
        if (!path) { setStatus("salvar: cancelado"); return; }
        project = { ...project, path };
        setStatus("salvo: " + path);
      } catch (err) { setStatus("salvar ERRO: " + String(err)); console.error(err); }
    },
    exportGabc: async () => {
      try {
        captureEditorIntoProject();
        const out = await exportCurrentGabc(project);
        setStatus(out ? "exportado .gabc: " + out : "exportar: cancelado");
      } catch (err) { setStatus("exportar ERRO: " + String(err)); console.error(err); }
    },
    exportAllGabcCmd: async () => {
      try {
        captureEditorIntoProject();
        const n = await exportAllGabc(project);
        setStatus(n ? `exportados ${n} .gabc` : "exportar todos: cancelado");
      } catch (err) { setStatus("exportar todos ERRO: " + String(err)); console.error(err); }
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
        const n = Object.values(overlay.entries).filter((e) => e.names?.length).length;
        await exportOverlay(overlay);
        setStatus(n ? `nomes exportados: ${n} entrada(s)` : "exportar: nenhum nome cadastrado — arquivo vazio");
      } catch (err) {
        setStatus("Ctrl+Alt+E ERRO: " + String(err));
        console.error("[notker] erro ao exportar overlay:", err);
      }
    },
    importOverlay: async () => {
      try {
        const imported = await importOverlay();
        if (!imported) { setStatus("importar: cancelado"); return; }
        const n = Object.keys(imported.entries).length;
        if (n === 0) {
          setStatus("importar: arquivo de nomes vazio (0 entradas) — nada a importar");
          return;
        }
        overlay = mergeOverlays(overlay, imported);
        await saveUserOverlay(overlay);
        reindex();
        setStatus(`nomes importados: ${n} entrada(s)`);
      } catch (err) {
        setStatus("importar ERRO (arquivo inválido?): " + String(err));
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
      const closePanel = () => { host.style.display = "none"; host.innerHTML = ""; };
      // Toggle: se já está aberto, fecha.
      if (host.style.display === "block") { closePanel(); return; }
      host.style.display = "block";
      const op = createOverlayPanel(host, {
        entries: effectiveRef,
        initial: () => overlay,
        onSave: async (o) => {
          // O rascunho já parte do overlay atual (initial) e foi editado por
          // completo — substitui (permite remover/renomear), não só unir.
          overlay = o;
          await saveUserOverlay(overlay);
          reindex();
          setStatus("nomes salvos");
        },
        onExport: async (draft) => {
          // Exporta o que está NA TELA: commita o rascunho (persiste) e exporta-o.
          // Evita "exportei e veio vazio" por não ter clicado Salvar antes.
          overlay = draft;
          await saveUserOverlay(overlay);
          reindex();
          const n = Object.values(overlay.entries).filter((e) => e.names?.length).length;
          await exportOverlay(overlay);
          setStatus(n ? `nomes exportados: ${n} entrada(s)` : "exportar: nenhum nome cadastrado — arquivo vazio");
        },
        onImport: async () => {
          await commands.run("importOverlay");
          op.refresh(); // recarrega a lista com os nomes importados (evita Salvar apagá-los)
        },
        onClose: closePanel,
      });
      op.open();
    },
    togglePreview: () => {
      previewHost.style.display = previewHost.style.display === "none" ? "" : "none";
    },
    toggleSplit: () => { split.toggle(); },
    toggleLegend: () => {
      view.dispatch({ effects: toggleLegend.of(!view.state.field(legendVisible)) });
    },
    // F4: mover o neuma sob o cursor (espelham os atalhos Alt+setas).
    moveUp: () => { runMove(view, () => getTree(), "up"); },
    moveDown: () => { runMove(view, () => getTree(), "down"); },
    moveLeft: () => { runMove(view, () => getTree(), "left"); },
    moveRight: () => { runMove(view, () => getTree(), "right"); },
    moveReset: () => { runMove(view, () => getTree(), "reset"); },
    // Tuotilo: alterna Tocar↔Parar no playback semiológico.
    playToggle: () => {
      if (player.playing) {
        stopPlayback();
        return;
      }
      // Obtém mapa de sílabas do preview; sem preview → degrada com status
      const map = panel?.sourceMap?.();
      if (!map || map.length === 0) {
        setStatus("playback indisponível (preview sem dados)");
        return;
      }
      const texto = view.state.doc.toString();
      // Índices SVG 1-based das sílabas reais (mesma filtragem de extractAll)
      const svgIndices = map.filter((s) => s.syllableIndex >= 1).map((s) => s.syllableIndex);
      const syls = extractAll(texto, map);
      if (syls.length === 0) {
        setStatus("playback: nenhuma sílaba encontrada");
        return;
      }
      const events = computeDurations(syls, DEFAULT_PROFILE, Date.now() % 9973);
      const svg = panel?.svgEl?.() ?? null;
      const btn = document.querySelector<HTMLElement>('.toolbar-btn[title="playback semiológico (Tuotilo)"]');
      if (btn) btn.textContent = "Parar";
      setStatus("playback: tocando…");
      player.play(
        events,
        // i = posição 0-based no array de eventos; mapear para índice SVG real
        (i) => { if (svg) highlightSyllable(svg, svgIndices[i] ?? i + 1); },
        () => { stopPlayback("playback: fim"); },
      );
    },
  });

  createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
    { id: "newProjectCmd", label: "Novo projeto", title: "novo projeto (.notker)" },
    { id: "openFile", label: "Abrir", title: "Ctrl+O — .notker ou .gabc" },
    { id: "saveFile", label: "Salvar", title: "Ctrl+S — projeto .notker" },
    { id: "exportGabc", label: "Exportar", title: "exportar o canto atual como .gabc padrão" },
    { id: "exportAllGabcCmd", label: "Exportar todos", title: "exportar todos os cantos como .gabc" },
    { id: "format", label: "Formatar", title: "Ctrl+Shift+F" },
    { id: "openSearch", label: "Buscar", title: "F2" },
    { id: "openOverlayPanel", label: "Nomes", title: "Ctrl+Alt+N — nomes de neumas (scriptorium)" },
    { id: "toggleLegend", label: "Régua", title: "Ctrl+Alt+L — letra↔altura na pauta" },
    { id: "toggleFamily", label: "Família", title: "Ctrl+Shift+G" },
    { id: "togglePreview", label: "Preview", title: "mostrar/ocultar painel" },
    { id: "toggleSplit", label: "Dividir", title: "alternar lado-a-lado / empilhado" },
    { id: "playToggle", label: "Tocar", title: "playback semiológico (Tuotilo)" },
    { id: "moveLeft", label: "◀", title: "Alt+← — empurrar o neuma à esquerda" },
    { id: "moveDown", label: "▼", title: "Alt+↓ — descer a altura do neuma" },
    { id: "moveUp", label: "▲", title: "Alt+↑ — subir a altura do neuma" },
    { id: "moveRight", label: "▶", title: "Alt+→ — empurrar o neuma à direita" },
    { id: "moveReset", label: "⟳", title: "Alt+0 — resetar posição do neuma" },
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
    if (e.ctrlKey && e.altKey && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      void commands.run("openOverlayPanel");
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
