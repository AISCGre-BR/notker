import "parchment-design/parchment.css";
import "parchment-design/components.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./ui/notker.css";
import { applyTheme, loadTheme, setTheme, type ThemeChoice } from "./app/theme";
import { createToaster } from "./ui/pd/toast";
import { EditorView } from "@codemirror/view";
import { Compartment, type Extension } from "@codemirror/state";
import { createEditorState, externalLinter } from "./editor/editor";
import { createChantStates } from "./editor/chant-states";
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
import { addNameToEntries, mergeOverlays, emptyOverlay, overlayCounts } from "./neume/overlay";
import { buildEffective, glyphIndex, byNabcIndex } from "./neume/effective";
import { validateNabc, type NabcParser } from "./neume/validate-nabc";
import { createNeumeDrawer } from "./neume/draw";
import { insertNabcAtCursor } from "./neume/insert";
import { createNabcOnlyRenderer } from "./preview/nabc-only";
import { createNeumasView, type NeumasView, type OpenOpts } from "./neumas/view";
import { chainAtSelection, resolveNameTarget } from "./neumas/name-target";
import { nabcFieldStart } from "./editor/context";
import { openContextMenu } from "./ui/pd/context-menu";
import { createAutosave } from "./neume/autosave";
import { NeumeSearch } from "./neume/search";
import { neumeExtensions } from "./neume/index";
import { nabcMoveKeymap, runMove } from "./neume/nabc-move";
import { gabcAssistExtensions } from "./gabc/index";
import type { Overlay, EffectiveEntry, Family } from "./neume/types";
import type { Tree } from "web-tree-sitter";
import { createRegistry } from "./app/commands";
import { undo, redo } from "@codemirror/commands";
import { createToolbar, type ToolbarHandle } from "./ui/toolbar";
import { installTooltips } from "./ui/pd/tooltip";
import { createMenubar, type MenuItem } from "./ui/menubar";
import { createDirtyTracker } from "./app/dirty";
import { createViews } from "./app/views";
import { chantCapture } from "./app/chant-capture";
import { debounce } from "./preview/debounce";
// PLAYBACK-OFF (2026-10-09): barra da onda.
// import { createWaveBar, type WaveBarHandle } from "./ui/wave-bar";
import { newDocumentDialog } from "./ui/new-dialog";
import { openDialog } from "./ui/pd/dialog";
import { askSaveChanges, resolveUnsaved, type UnsavedGuard } from "./app/session";
import { NabcLibEngine } from "./preview/nabc-lib";
import { createPreviewPanel } from "./preview/panel";
import { installSync, syncFromCursor } from "./preview/sync";
// PLAYBACK-OFF (2026-10-09): realce de playback/onda.
// import { highlightSyllable, clearHighlight } from "./preview/highlight";
// PLAYBACK-OFF (2026-10-09): player e linha do tempo.
// import { createPlayer } from "./tuotilo/player";
// import { extractAll } from "./tuotilo/signs";
// import { buildTimeline } from "./tuotilo/timeline";
// import { computeTimedNotes, sliceFromSyllable, type PlaybackMode } from "./tuotilo/duration";
// import { syllableRangeOfSelection } from "./preview/source-map";
// import { DEFAULT_PROFILE } from "./tuotilo/profile";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSplit, type Split } from "./ui/split";
import { toggleLegend, legendVisible } from "./gabc/staff-legend";
import { openProject, saveProject, exportCurrentGabc, exportAllGabc, pickGabcFile } from "./files/project-io";
import {
  type NotkerProject, newProject, getActiveChant, effectiveFamily, updateChant, setActive,
  setChantFamily, insertNode, removeNode, restoreRemoved, moveSibling, newChant, gabcName, gabcSkeleton,
  findNode, countChants, newGroup, renameNode, setCollapsed, revealNode, moveNode, duplicateNode,
} from "./project/tree";
import { createTreePanel } from "./project/tree-panel";
// PLAYBACK-OFF (2026-10-09): faixas da onda.
// import { createWaveLanes, factorFromDrag, deformLiveSegment, WAVE_SPREAD, WAVE_LINE_SPACING_PX, type NoteIdent } from "./preview/wave-lanes";
import type { WaveOverlay } from "./tuotilo/wave";
// PLAYBACK-OFF (2026-10-09): setWaveFactor, applyWave, waveKey (só a UI da onda os usava).
import { emptyWave, gabcBodyHash } from "./tuotilo/wave"; // a interpretação salva continua sendo lida e regravada

/** Tipo inferido do segundo parâmetro de lspDiagnosticsToCM (não exportado do módulo). */
type LspDiagnosticParam = Parameters<typeof lspDiagnosticsToCM>[1][number];

const URI = "inmemory://notker.gabc";
let diagnostics: Diagnostic[] = [];

async function boot() {
  const toaster = createToaster(document.querySelector<HTMLElement>("#toast-host")!);
  applyTheme(loadTheme());
  const app = document.querySelector<HTMLElement>("#app")!;
  app.textContent = "";

  // O tema (cores dos tokens) é SEMPRE incluído — independente de o WASM do
  // realce carregar — para que as marcas de decoração tenham cor quando existirem.
  const extraExtensions: Extension[] = [highlightTheme];

  // Highlighter é opcional: uma falha de carga do WASM não pode impedir o editor
  // de montar. Falha vira aviso (toast) depois que o editor está de pé.
  let highlightFailed = false;
  let getTree: () => Tree | null = () => null;
  /** Parser do realce, reusado para validar cadeias nabc na vista Neumas (null sem WASM). */
  let nabcParser: NabcParser | null = null;
  try {
    const ts = await makeTreeSitterHighlighter(runtimeWasmUrl, grammarWasmUrl);
    extraExtensions.push(ts.extension);
    getTree = ts.getTree;
    nabcParser = { parse: ts.parse };
  } catch (err) {
    highlightFailed = true;
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

  // Compartment das extensões F2 (paleta/hover/completion/régua), preenchido quando o
  // db carrega. Estados criados DEPOIS já nascem com elas (neumeExt); o estado inicial
  // recebe via reconfigure.
  const neumeCompartment = new Compartment();
  let neumeExt: Extension = [];
  // Um EditorState por canto (histórico/seleção/rolagem próprios) — spec §4.3.
  const chantStates = createChantStates((doc) =>
    createEditorState(doc, [...extraExtensions, neumeCompartment.of(neumeExt)]));

  let project: NotkerProject = newProject({ family: "stgall", name: "Novo" });
  const view = new EditorView({ parent: app, state: chantStates.get(project.activeId, getActiveChant(project).content) });
  /** Canto cujo texto está no editor agora: o capture escreve SEMPRE nele. */
  let shownId: string | null = project.activeId;
  /** Muda a cada projeto carregado: um "Desfazer" antigo não age no projeto novo. */
  let projectEpoch = 0;
  const dirty = createDirtyTracker();
  /** Só depois do boot o título reage (captureEditorIntoProject lê `wave`, criada adiante). */
  let booted = false;
  let menubar: ReturnType<typeof createMenubar> | undefined;
  /** Título na menubar com "— Editado" quando o projeto difere do último salvo/aberto. */
  function updateTitle(): void {
    if (!booted) return;
    captureEditorIntoProject();
    menubar?.setTitle(project.title, dirty.isDirty(project));
  }
  const scheduleTitle = debounce(updateTitle, 250);

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
  onDocChange = () => { sync(); scheduleTitle(); };

  if (highlightFailed) toaster.show("O realce de sintaxe não carregou. O editor funciona sem cores.", { kind: "warn" });

  // effectiveRef: hoistado para fora do bloco F2 para que os comandos o alcancem.
  let effectiveRef: () => EffectiveEntry[] = () => [];

  // Variáveis de overlay, reindex e família ativa — hoistadas para o handler de teclado.
  let overlay: Overlay = emptyOverlay();
  /** O arquivo de nomes existe mas não pôde ser lido (corrompido, versão mais nova, sem
   *  permissão): NADA é gravado nesta sessão, para não sobrescrevê-lo com um overlay vazio. */
  let overlayBlocked: string | null = "os nomes ainda não foram carregados"; // guarda começa FECHADA
  async function writeOverlay(): Promise<void> {
    if (overlayBlocked) throw new Error("os nomes salvos não puderam ser lidos (" + overlayBlocked + "); nada foi gravado");
    await saveUserOverlay(overlay);
  }
  let reindex = () => {};
  let paletteRef: { open(v: EditorView): void } | null = null;
  // Autosave dos nomes: `overlay` fica SEMPRE em dia (atualizado na hora pelo
  // painel); só a ESCRITA é coalescida (300 ms). schedule() resolve quando o disco
  // confirma (indicador "salvo ✓" verdadeiro); flush() antes de import/export/fechar.
  const overlayAutosave = createAutosave(async () => {
    try {
      await writeOverlay();
    } catch (e) {
      toaster.show("Não foi possível salvar os nomes. " + String(e), { kind: "error" });
      throw e;
    }
  }, 300);
  /** Vista Neumas (criada quando o catálogo carrega). Lê o overlay sempre de `overlay`:
   *  não guarda rascunho, então mudanças por fora (hover, paleta, importar) não se perdem. */
  let neumasView: NeumasView | null = null;
  /** Adota um overlay novo: índices na hora, gravação coalescida (autosave). */
  let commitOverlay: (next: Overlay) => Promise<void> = () => Promise.resolve();
  const currentFamily = (): Family => effectiveFamily(project, project.activeId);

  function familyLabel(f: Family): string { return f === "stgall" ? "St. Gall" : "Laon"; }
  function toggleFamily(): void {
    const f: Family = currentFamily() === "stgall" ? "laon" : "stgall";
    applyTree((p) => setChantFamily(p, p.activeId, f));
    reindex();
    toaster.show("Família do canto: " + familyLabel(f) + ".");
  }

  // Carrega db de neumas e reconfigura o compartment F2.
  try {
    const db = await loadNeumeDb();
    // Overlay é OPCIONAL: uma falha (ex.: permissão de fs ausente) não pode
    // impedir a injeção das extensões F2 (paleta/hover/completion/régua).
    try { overlay = await loadUserOverlay(); overlayBlocked = null; }
    catch (e) {
      console.warn("[notker] overlay de nomes indisponível (usando vazio):", e);
      overlayBlocked = e instanceof Error ? e.message : String(e);
      toaster.show("Os nomes de neumas salvos não puderam ser lidos. Novos nomes não serão gravados nesta sessão. " + overlayBlocked, { kind: "error" });
    }
    // Catálogo + nomes do usuário + sequências do usuário, recalculados a cada mudança
    // do overlay (busca, paleta, completion, hover e vista Neumas leem daqui).
    const glyphOf = glyphIndex(db.all());
    let effectiveCache = buildEffective(db.all(), overlay, glyphOf);
    let lookup = byNabcIndex(effectiveCache);
    const effective = (): EffectiveEntry[] => effectiveCache;
    effectiveRef = effective;
    let searchInst = new NeumeSearch(effectiveCache, currentFamily());
    const rebuildIndex = (): void => {
      effectiveCache = buildEffective(db.all(), overlay, glyphOf);
      lookup = byNabcIndex(effectiveCache);
      searchInst = new NeumeSearch(effectiveCache, currentFamily());
    };
    reindex = () => { rebuildIndex(); if (views.current() === "neumas") neumasView?.refresh(); };
    commitOverlay = (next) => { overlay = next; rebuildIndex(); return overlayAutosave.schedule(); };
    const rt = {
      getTree,
      search: () => searchInst,
      lookupByNabc: (nabc: string): EffectiveEntry[] => lookup(nabc),
      activeFamily: () => currentFamily(),
      openNames: (t: { id?: string; family: Family; nabc: string }) =>
        openNeumas(t.id ? { family: t.family, select: t.id, focus: "name" } : { family: t.family, newChain: t.nabc, focus: "name" }),
      onName: async (ids: string[], name: string) => {
        const n = name.trim();
        const targets = ids.map((id) => ({
          id,
          displayNames: effective().find((e) => e.id === id)?.displayNames ?? [],
        }));
        const r = addNameToEntries(overlay, targets, n);
        overlay = r.overlay;
        const changed = r.changed;
        if (!changed) { toaster.show("Esse nome já existe.", { kind: "warn" }); return; }
        reindex();
        try { await overlayAutosave.schedule(); toaster.show(`Nome “${n}” cadastrado.`); }
        catch { /* o autosave já mostrou o erro */ }
      },
    };
    const neume = neumeExtensions(rt);
    paletteRef = neume.palette;
    neumeExt = [...neume.extensions, ...gabcAssistExtensions(getTree)];
    view.dispatch({ effects: neumeCompartment.reconfigure(neumeExt) });
    // Estados de outros cantos criados antes do db carregar também recebem as extensões.
    chantStates.mapAll((s) => s.update({ effects: neumeCompartment.reconfigure(neumeExt) }).state);

    // Vista Neumas (tela de nomes). Desenho grande: glifo da fonte → motor do preview
    // (só nabc) → partes; medição num host pré-existente fora da tela.
    const drawer = createNeumeDrawer(glyphOf, createNabcOnlyRenderer(document.querySelector<HTMLElement>("#measure-host")!));
    neumasView = createNeumasView(document.querySelector<HTMLElement>("#neumas-view")!, {
      entries: effective,
      overlay: () => overlay,
      commit: (next) => commitOverlay(next),
      validate: (n) => validateNabc(nabcParser, n),
      draw: (f, n) => drawer.draw(f, n, 96),
      insert: (n) => {
        backToEdit();
        insertNabcAtCursor(view, getTree() as Parameters<typeof insertNabcAtCursor>[1], n);
        view.focus();
      },
      exit: () => backToEdit(),
      toast: (text, opts) => toaster.show(text, opts),
      now: () => new Date().toISOString(),
    });
  } catch (err) {
    console.error("[notker] falha ao carregar neume-db (F2):", err);
    toaster.show("O catálogo de neumas não carregou. " + String(err), { kind: "error" });
  }

  /** Substitui todo o conteúdo do editor (usado ao abrir arquivo). */
  function replaceDoc(text: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  // Preview ao vivo + divisor redimensionável. Fica DEPOIS do bloco F2 e dentro de
  // try/catch para que as assistências (hover/completion/paleta) carreguem sempre,
  // mesmo que o motor de preview (webview-only) falhe.
  const previewHost = document.querySelector<HTMLElement>("#preview")!;

  // PLAYBACK-OFF (2026-10-09): cursor da onda.
  // // Referência mutável para limpar o cursor da onda no stopPlayback.
  // let waveCursorClear: () => void = () => {};
  // Handles de UI atribuídos no fim do boot; os closures abaixo rodam depois.
  let toolbarHandle: ToolbarHandle | null = null;
  // PLAYBACK-OFF (2026-10-09): barra da onda.
  // let waveBar: WaveBarHandle | null = null;

  // ── Onda de interpretação (Tuotilo B2a) ─────────────────────────────────
  // PLAYBACK-OFF (2026-10-09): semente do playback.
  // // seed fixa para visual estável entre re-renders; playback usa Date.now()%9973
  // const WAVE_SEED = 12345;
  // Espaçamento com onda ativa (WAVE_LINE_SPACING_PX + WAVE_SPREAD): wave-lanes.ts.
  let wave: WaveOverlay = emptyWave("");

  // PLAYBACK-OFF (2026-10-09): faixas da onda (wave-lanes), arrasto e toasts de onda desatualizada.
  // // Estado do arrasto vertical de fator.
  // let dragState: { key: string; syl: number; note: number; startFactor: number; startClientY: number } | null = null;
  // // Contagem de notas por sílaba (interna) p/ a leitura "nota N de M" no rodapé.
  // let waveNotesPerSyl = new Map<number, number>();

  // const waveLanes = createWaveLanes(() => panel?.svgEl?.() ?? null, {
  //   onFactorDrag: (key, syl, note, startFactor, startClientY) => {
  //     if (playbackMode !== "interpretado") { toaster.show("A onda só é editável no modo interpretado.", { kind: "warn" }); return; }
  //     dragState = { key, syl, note, startFactor, startClientY };
  //   },
  //   onHover: (syl) => {
  //     const svg = panel?.svgEl?.(); if (!svg) return;
  //     if (syl === null) { clearHighlight(svg); return; }
  //     highlightSyllable(svg, syl); // syl já é o realSyllableIndex (renderWaveLanes passa o índice real)
  //   },
  // }, { readAnchors: () => panel?.noteAnchors?.() ?? [] });

  // // Rótulo do alongamento p/ a leitura ao vivo no rodapé (na estética: sem floats).
  // const fatorLabel = (f: number): string =>
  //   Math.abs(f - 1) < 0.01 ? "neumático puro" : `×${f.toFixed(2).replace(".", ",")}`;
  // const notaLabel = (d: NonNullable<typeof dragState>): string => {
  //   const total = waveNotesPerSyl.get(d.syl);
  //   return total && total > 1 ? `nota ${d.note + 1} de ${total}` : `nota ${d.note + 1}`;
  // };
  // window.addEventListener("pointermove", (ev) => {
  //   if (!dragState) return;
  //   const f = factorFromDrag(dragState.startFactor, dragState.startClientY, ev.clientY);
  //   const svg = panel?.svgEl?.(); if (svg) deformLiveSegment(svg, dragState.key, f);
  //   // Leitura ao vivo na barra da onda (perto do gesto); rodapé fica p/ status geral.
  //   waveBar?.setReading(`alongamento ${fatorLabel(f)} — ${notaLabel(dragState)}`);
  // });
  // window.addEventListener("pointerup", (ev) => {
  //   if (!dragState) return;
  //   const f = factorFromDrag(dragState.startFactor, dragState.startClientY, ev.clientY);
  //   wave = setWaveFactor(wave, dragState.syl, dragState.note, f);
  //   waveBar?.setReading(null);
  //   dragState = null;
  //   rebuildWave();
  //   scheduleTitle();
  // });
  // window.addEventListener("pointercancel", () => { dragState = null; waveBar?.setReading(null); });

  // // Liga a referência mutável usada em stopPlayback.
  // waveCursorClear = () => waveLanes.setCursor(null);

  // /** Recomputa a onda a partir do doc atual + overlay WaveOverlay e repassa para
  //  *  o controller de lanes integrado ao SVG da partitura. */
  // function rebuildWave(): void {
  //   waveBar?.setCount(Object.keys(wave.factors).length);
  //   toolbarHandle?.refresh(); // wave.reset só habilita com fatores editados
  //   const map = panel?.sourceMap?.() ?? [];
  //   const texto = view.state.doc.toString();
  //   const reals = map.filter((s) => s.syllableIndex >= 1);
  //   const syls = extractAll(texto, map);
  //   if (syls.length === 0) { waveLanes.refresh([]); return; }
  //   const tl = buildTimeline(syls);
  //   // base = durações neumáticas PURAS (sem applyWave); o fator vem do overlay
  //   const base = computeTimedNotes(tl, DEFAULT_PROFILE, WAVE_SEED, "interpretado");
  //   const notes: NoteIdent[] = base.notes.map((n) => ({
  //     syllableIndex: n.syllableIndex,                                                         // INTERNO — overlay/cursor/data-key
  //     realSyllableIndex: reals[n.syllableIndex]?.syllableIndex ?? (n.syllableIndex + 1),      // REAL (syllable-N)
  //     noteInSyllable: n.noteInSyllable,
  //     pitch: n.pitch, alt: n.alt,
  //     factor: wave.factors[waveKey(n.syllableIndex, n.noteInSyllable)] ?? 1,
  //     divisioAfter: n.pauseAfterMs > 0
  //       ? (tl.divisiones.find((d) => d.afterNoteIdx === n.idx)?.kind ?? null)
  //       : null,
  //   }));
  //   waveNotesPerSyl = new Map();
  //   for (const n of notes) waveNotesPerSyl.set(n.syllableIndex, (waveNotesPerSyl.get(n.syllableIndex) ?? 0) + 1);
  //   waveLanes.refresh(notes);
  // }

  // /** Verifica hash do canto e sinaliza onda desatualizada (D4). */
  // function syncWaveWithDoc(): void {
  //   const h = gabcBodyHash(view.state.doc.toString());
  //   // Primeira vez (hash vazio): adota o hash sem marcar como stale
  //   if (wave.gabcBodyHash === "") wave = { ...wave, gabcBodyHash: h };
  //   if (Object.keys(wave.factors).length > 0 && wave.gabcBodyHash !== h)
  //     toaster.show("O canto mudou depois da interpretação. Revise a onda.", { kind: "warn" });
  //   rebuildWave();
  // }

  let split: Split = { orientation: () => "horizontal", setOrientation: () => {}, toggle: () => {} };
  // panel é declarado fora do try para que playToggle (Tuotilo) acesse em runtime.
  let panel: ReturnType<typeof createPreviewPanel> | null = null;
  try {
    const engine = new NabcLibEngine();
    panel = createPreviewPanel(previewHost, engine, { debounceMs: 150 });
    installSync(view, panel);
    panel.update(view.state.doc.toString());
    // PLAYBACK-OFF (2026-10-09): faixas da onda na partitura.
    // // Re-injeta as wave lanes após cada render (sobrevive a debounce e resize).
    // panel.onRender(() => { if (waveLanes.enabled()) rebuildWave(); });
    // Encadeia no onDocChange (que já vale o sync/LSP didChange) sem substituí-lo.
    const prevOnDocChange = onDocChange;
    onDocChange = () => {
      prevOnDocChange();
      panel!.update(view.state.doc.toString());
      // PLAYBACK-OFF (2026-10-09): onda.
      // // Onda: re-sincroniza apenas se as lanes estiverem habilitadas.
      // if (waveLanes.enabled()) syncWaveWithDoc();
    };
    // Realce de sílaba segue o cursor.
    view.dom.addEventListener("keyup", () => syncFromCursor(view, panel!));
    view.dom.addEventListener("mouseup", () => syncFromCursor(view, panel!));
    const workspace = document.querySelector<HTMLElement>("#workspace")!;
    split = createSplit(workspace, app, previewHost, "horizontal");
  } catch (err) {
    console.error("[notker] preview ao vivo indisponível:", err);
  }

  // PLAYBACK-OFF (2026-10-09): player e AudioContext.
  // // Tuotilo — player semiológico. AudioContext criado no clique (= gesto do usuário).
  // // O panel pode ser null se o preview falhou — todos os caminhos degradam com toast.
  // const player = createPlayer(() => new AudioContext(), "voz");
  // let playbackMode: PlaybackMode = "interpretado";

  // /** Para o playback de forma consistente: silencia, restaura botão, limpa realce e status. */
  // function stopPlayback(): void {
  //   player.stop();
  //   toolbarHandle?.refresh();
  //   const svg = panel?.svgEl?.() ?? null;
  //   if (svg) clearHighlight(svg);
  //   waveCursorClear();
  // }

  const docListHost = document.querySelector<HTMLElement>("#doc-list")!;
  const dialogHost = document.querySelector<HTMLElement>("#dialog-host")!;
  const treePanel = createTreePanel(docListHost, {
    onSelect: (id) => switchToChant(id),
    onToggle: (id, collapsed) => applyTree((p) => setCollapsed(p, id, collapsed)),
    onRename: (id, title) => applyTree((p) => renameNode(p, id, title)),
    onMoveBy: (id, delta) => { applyTree((p) => moveSibling(p, id, delta)); treePanel.focusNode(id); },
    onMove: (id, parentId, index) => {
      applyTree((p) => {
        const moved = moveNode(p, id, parentId, index);
        return parentId && moved !== p ? setCollapsed(moved, parentId, false) : moved;
      });
      treePanel.focusNode(id);
    },
    onDuplicate: (id) => {
      let copyId = "";
      applyTree((p) => { const r = duplicateNode(p, id); if (!r) return p; copyId = r.id; return r.project; });
      if (copyId) treePanel.focusNode(copyId);
    },
    onRemove: (id) => void removeWithUndo(id),
    onSetFamily: (id, f) => {
      applyTree((p) => setChantFamily(p, id, f));
      if (id === project.activeId) reindex();
      toaster.show("Família do canto: " + familyLabel(f) + ".");
    },
    onNewChant: (parentId, index) => void newChantAt(parentId, index),
    onNewGroup: (parentId, index) => newGroupAt(parentId, index),
    onImport: () => void importGabcAsChant(),
  });

  function renderTree(): void { treePanel.render(project); updateTitle(); }
  /** Mostra no editor o canto ativo, com o EditorState DELE. Guarda antes o estado do
   *  canto que sai (inclusive se ele acabou de ser excluído: o Desfazer o devolve com
   *  histórico). O LSP recebe didChange completo; partitura e onda refazem. */
  function syncFromProject(): void {
    if (shownId) chantStates.remember(shownId, view.state, view.scrollSnapshot());
    // PLAYBACK-OFF (2026-10-09): não há player.
    // if (player.playing) stopPlayback();
    const chant = getActiveChant(project);
    const legend = view.state.field(legendVisible, false) ?? false;
    diagnostics = []; // eram do texto anterior; o LSP republica após o didChange
    view.setState(chantStates.get(chant.id, chant.content));
    forceLinting(view); // some com as marcas do texto anterior já
    shownId = chant.id;
    const snap = chantStates.scrollOf(chant.id);
    if (snap) view.dispatch({ effects: snap });
    else view.scrollDOM.scrollTop = 0; // primeira visita: não herda a rolagem do canto anterior
    // A régua da pauta é preferência de vista: atravessa a troca de canto.
    if ((view.state.field(legendVisible, false) ?? false) !== legend) view.dispatch({ effects: toggleLegend.of(legend) });
    wave = chant.interpretation ?? emptyWave(gabcBodyHash(chant.content));
    renderTree();
    reindex();
    onDocChange(); // setState não dispara updateListener: LSP + partitura + onda à mão
  }
  function captureEditorIntoProject(): void {
    if (!shownId) return;
    project = updateChant(project, shownId, chantCapture(view.state.doc.toString(), wave));
  }
  /** Aplica uma mudança no projeto. O editor é capturado ANTES; se o ativo deixou de ser
   *  o canto exibido, o editor passa a mostrar o novo ativo. */
  function applyTree(fn: (p: NotkerProject) => NotkerProject): void {
    captureEditorIntoProject();
    project = fn(project);
    if (project.activeId !== shownId) syncFromProject(); else renderTree();
  }
  function switchToChant(id: string): void {
    if (id === shownId) return;
    applyTree((p) => setActive(p, id));
  }
  /** Troca o projeto inteiro (novo/abrir): nada do editor antigo vai para o novo. */
  function loadProject(p: NotkerProject): void {
    captureEditorIntoProject(); // se falhar, o projeto anterior (com o texto atual) é restaurado
    const prev = project;
    const prevEpoch = projectEpoch;
    shownId = null;      // o texto no editor é do projeto antigo: não capturar
    chantStates.clear();
    projectEpoch++;
    toaster.dismiss();   // um "Desfazer" pendente era do projeto antigo
    try {
      project = p;
      // Baseline ANTES do sync (o renderTree dele atualiza o título): nunca pisca "Editado".
      // O sync pode normalizar o texto via capture, então re-marca depois.
      dirty.markSaved(project);
      syncFromProject();
      captureEditorIntoProject();
      dirty.markSaved(project); // recém-aberto/criado = sem alterações
      updateTitle();
    } catch (err) {
      console.error(err);
      project = prev;
      projectEpoch = prevEpoch;
      shownId = null;
      try { syncFromProject(); } catch (e2) { console.error(e2); }
      toaster.show("Não foi possível abrir o projeto. " + String(err), { kind: "error" });
    }
  }
  /** Pai ainda válido depois de um diálogo assíncrono; senão a raiz. */
  const liveParent = (parentId: string | null): string | null =>
    (parentId && findNode(project, parentId)?.kind === "group" ? parentId : null);
  // Novo canto (diálogo com nome/ofício/família) no lugar pedido; vira o ativo.
  // revealNode expande um grupo recolhido que seja o destino.
  async function newChantAt(parentId: string | null, index: number): Promise<void> {
    const r = await newDocumentDialog(dialogHost, { title: "Novo canto", family: effectiveFamily(project, project.activeId) });
    if (!r) return;
    const chant = newChant({ title: r.name ?? "Novo", content: gabcSkeleton(r.name, r.office), family: r.family });
    const target = liveParent(parentId);
    if (target !== parentId) index = Infinity; // o grupo sumiu: vai para o fim da raiz
    applyTree((p) => setActive(revealNode(insertNode(p, target, index, chant), chant.id), chant.id));
    view.focus();
  }
  // Novo grupo "Novo grupo" já em renomeação inline (spec §4.4); expande o destino recolhido.
  function newGroupAt(parentId: string | null, index: number): void {
    const grp = newGroup();
    const target = liveParent(parentId);
    if (target !== parentId) index = Infinity;
    applyTree((p) => revealNode(insertNode(p, target, index, grp), grp.id));
    treePanel.startRename(grp.id);
  }
  // Importa um .gabc solto como novo canto no fim da raiz e o ativa.
  async function importGabcAsChant(): Promise<void> {
    try {
      const f = await pickGabcFile();
      if (!f) return;
      const chant = newChant({ title: gabcName(f.content, f.name), content: f.content });
      applyTree((p) => setActive(insertNode(p, null, Infinity, chant), chant.id));
      view.focus();
    } catch (e) {
      toaster.show("Não foi possível importar o arquivo. " + String(e), { kind: "error" });
    }
  }
  /** Excluir: grupo com cantos pede confirmação (perigo à esquerda, Enter = Cancelar);
   *  todo excluir oferece Desfazer no toast (que não age se outro projeto foi aberto). */
  async function removeWithUndo(id: string): Promise<void> {
    const node = findNode(project, id);
    if (!node) return;
    if (node.kind === "group") {
      const n = countChants(node);
      if (n > 0) {
        const r = await openDialog(dialogHost, {
          title: n === 1
            ? `Excluir “${node.title}” e o canto dentro dele?`
            : `Excluir “${node.title}” e os ${n} cantos dentro dele?`,
          actions: [
            { id: "delete", label: "Excluir", kind: "danger" },
            { id: "cancel", label: "Cancelar", kind: "elevated" },
          ],
          defaultAction: "cancel",
        });
        if (r.action !== "delete") return;
      }
    }
    // O diálogo foi assíncrono: captura o editor agora para que removeNode veja o texto
    // atual (applyTree captura de novo, mas depois de removeNode ter calculado o resultado).
    captureEditorIntoProject();
    // removeNode só devolve null para id desconhecido (o último canto vira um
    // placeholder); não é "último canto".
    const r = removeNode(project, id);
    if (!r) return;
    const epoch = projectEpoch;
    applyTree(() => r.project);
    toaster.show(node.kind === "group" ? "Grupo excluído." : "Canto excluído.", {
      action: { label: "Desfazer", run: () => { if (epoch === projectEpoch) applyTree((p) => restoreRemoved(p, r)); } },
    });
  }
  renderTree();

  /** Salva (ou Salvar como). Devolve false se o usuário cancelou a escolha do caminho;
   *  LANÇA em erro de gravação (quem chama decide: toast ou diálogo de fechar). */
  let saving: Promise<boolean> | null = null; // gravação em andamento (fechar espera por ela)
  async function doSave(saveAs: boolean): Promise<boolean> {
    captureEditorIntoProject();
    const snap = project; // o que vai ao disco: edições durante o await não entram no "salvo"
    const epoch = projectEpoch;
    const run = (async (): Promise<boolean> => {
      const path = await saveProject(snap, { saveAs });
      if (!path) return false;
      // Outro projeto foi aberto/criado durante a gravação: não toca no projeto atual.
      if (epoch !== projectEpoch) return true;
      dirty.markSaved(snap);
      project = { ...project, path };
      updateTitle();
      toaster.show("Projeto salvo.");
      return true;
    })();
    saving = run;
    try { return await run; }
    finally { if (saving === run) saving = null; }
  }
  const saveCmd = (saveAs: boolean) => async (): Promise<void> => {
    try { await doSave(saveAs); }
    catch (err) { toaster.show("Salvar falhou. " + String(err), { kind: "error" }); console.error(err); }
  };

  const unsaved: UnsavedGuard = {
    isDirty: () => { captureEditorIntoProject(); return dirty.isDirty(project); },
    title: () => project.title,
    save: () => doSave(false),
    ask: (title, error) => askSaveChanges(dialogHost, title, error),
  };

  // Vistas (spec nomes-neumas §2.1): body[data-view] alterna hosts pré-existentes.
  const views = createViews(document.body, () => { toolbarHandle?.refresh(); });
  const inEdit = (): boolean => views.current() === "edicao";
  /** Volta à Edição com o cursor e a seleção do editor intactos (o EditorState não muda). */
  function backToEdit(): void { neumasView?.flush(); views.set("edicao"); view.focus(); }
  function openNeumas(o: OpenOpts = {}): void {
    if (!neumasView) { toaster.show("O catálogo de neumas não carregou.", { kind: "error" }); return; }
    views.set("neumas");
    neumasView.open({ family: o.family ?? currentFamily(), ...o });
  }
  /** "Nomear neuma…" (Ctrl+Shift+N): seleção num campo nabc, sílaba selecionada (clique na
   *  partitura) ou neuma sob o cursor → glifo/sequência existente ou sequência nova, com o
   *  foco em "Novo nome…". */
  function nameNeumeCmd(): void {
    const sel = view.state.selection.main;
    const chain = chainAtSelection(view.state.doc.toString(), sel.from, sel.to,
      getTree() as Parameters<typeof chainAtSelection>[3]);
    if (!chain) { toaster.show("Ponha o cursor num neuma (no nabc, depois do |) para nomeá-lo.", { kind: "warn" }); return; }
    const family = currentFamily();
    const t = resolveNameTarget(effectiveRef(), family, chain);
    openNeumas(t.kind === "existing" ? { family, select: t.id, focus: "name" } : { family, newChain: t.nabc, focus: "name" });
  }
  const countLabel = (c: { named: number; sequences: number }): string =>
    [c.named ? `${c.named} ${c.named === 1 ? "neuma com nome" : "neumas com nome"}` : "",
     c.sequences ? `${c.sequences} ${c.sequences === 1 ? "sequência" : "sequências"}` : ""].filter(Boolean).join(" e ");

  const commands = createRegistry();
  const h = {
    // Novo projeto via popup (família por botões-toggle, sem radio nativo que
    // travava o WebKitGTK). O nome vira o cabeçalho name: do canto inicial.
    // Primeiro decide as alterações do atual; depois o diálogo (sem o aviso antigo
    // de "alterações serão perdidas" — a pergunta já cuidou disso).
    newProjectCmd: async () => {
      if (!(await resolveUnsaved(unsaved))) return;
      const r = await newDocumentDialog(dialogHost, { title: "Novo projeto", okLabel: "Criar" });
      if (!r) return;
      loadProject(newProject({ family: r.family, name: r.name, office: r.office }));
      view.focus();
    },
    openFile: async () => {
      try {
        if (!(await resolveUnsaved(unsaved))) return;
        const p = await openProject();
        if (!p) return;
        loadProject(p);
      } catch (err) { toaster.show("Abrir falhou. " + String(err), { kind: "error" }); console.error(err); }
    },
    exportGabc: async () => {
      try {
        captureEditorIntoProject();
        const out = await exportCurrentGabc(project);
        if (out) toaster.show("Exportado.");
      } catch (err) { toaster.show("Exportar falhou. " + String(err), { kind: "error" }); console.error(err); }
    },
    exportAllGabcCmd: async () => {
      try {
        captureEditorIntoProject();
        const n = await exportAllGabc(project);
        if (n) toaster.show(n === 1 ? "1 canto exportado." : `${n} cantos exportados.`);
      } catch (err) { toaster.show("Exportar falhou. " + String(err), { kind: "error" }); console.error(err); }
    },
    format: async () => {
      try {
        const id = shownId;
        const f = await formatDocument(client, URI, view.state.doc);
        // O canto pode ter mudado durante o await: não escreve texto de um no outro.
        if (f != null && shownId === id) replaceDoc(f);
      } catch (err) {
        toaster.show("Formatar falhou. " + String(err), { kind: "error" });
        console.error("[notker] erro ao formatar:", err);
      }
    },
    exportOverlay: async () => {
      try {
        try { await overlayAutosave.flush(); } catch { /* o autosave já mostrou o erro */ }
        const c = overlayCounts(overlay);
        if (c.named + c.sequences === 0) { toaster.show("Nenhum nome cadastrado para exportar.", { kind: "warn" }); return; }
        await exportOverlay(overlay);
        toaster.show(`Exportados: ${countLabel(c)}.`);
      } catch (err) {
        toaster.show("Exportar nomes falhou. " + String(err), { kind: "error" });
        console.error("[notker] erro ao exportar overlay:", err);
      }
    },
    importOverlay: async () => {
      try {
        const imported = await importOverlay();
        if (!imported) return;
        const c = overlayCounts(imported);
        if (c.named + c.sequences === 0) {
          toaster.show("O arquivo não tem nomes para importar.", { kind: "warn" });
          return;
        }
        await overlayAutosave.flush();
        overlay = mergeOverlays(overlay, imported);
        reindex();
        await writeOverlay();
        toaster.show(`Importados: ${countLabel(c)}.`);
      } catch (err) {
        toaster.show("Importar nomes falhou. " + String(err), { kind: "error" });
        console.error("[notker] erro ao importar overlay:", err);
      }
    },
    toggleFamily: () => { toggleFamily(); },
    openSearch: () => {
      if (views.current() === "neumas") { neumasView?.focusSearch(); return; }
      if (!paletteRef) return;
      if (!document.querySelector(".neume-palette")) view.focus();
      paletteRef.open(view);
    },
    togglePreview: () => {
      previewHost.style.display = previewHost.style.display === "none" ? "" : "none";
    },
    toggleSplit: () => { split.toggle(); },
    toggleLegend: () => {
      view.dispatch({ effects: toggleLegend.of(!(view.state.field(legendVisible, false) ?? false)) });
    },
    // F4: mover o neuma sob o cursor (espelham os atalhos Alt+setas).
    moveUp: () => { runMove(view, () => getTree(), "up"); },
    moveDown: () => { runMove(view, () => getTree(), "down"); },
    moveLeft: () => { runMove(view, () => getTree(), "left"); },
    moveRight: () => { runMove(view, () => getTree(), "right"); },
    moveReset: () => { runMove(view, () => getTree(), "reset"); },
    // PLAYBACK-OFF (2026-10-09): handlers de Tocar/modo/onda.
    // // Tuotilo: alterna interpretado ↔ solfejo. No solfejo toda nota vale baseMs
    // // (leitura de solmização); sinais e legato só no interpretado.
    // modeToggle: () => {
    //   playbackMode = playbackMode === "interpretado" ? "solfejo" : "interpretado";
    //   toolbarHandle?.refresh();
    //   waveBar?.setSolfejo(playbackMode !== "interpretado");
    //   if (player.playing) stopPlayback();
    // },
    // // Tuotilo: alterna Tocar↔Parar no playback semiológico.
    // playToggle: () => {
    //   if (player.playing) {
    //     stopPlayback();
    //     return;
    //   }
    //   // Obtém mapa de sílabas do preview; sem preview → degrada com status
    //   const map = panel?.sourceMap?.();
    //   if (!map || map.length === 0) {
    //     toaster.show("Nada para tocar: a partitura ainda não foi desenhada.", { kind: "warn" });
    //     return;
    //   }
    //   const texto = view.state.doc.toString();
    //   // Contrato de índices: extractAll filtra sílabas reais (syllableIndex>=1) na
    //   // MESMA ordem de svgIndices; note.syllableIndex (0-based na timeline) é,
    //   // portanto, posição válida em svgIndices.
    //   const svgIndices = map.filter((s) => s.syllableIndex >= 1).map((s) => s.syllableIndex);
    //   const syls = extractAll(texto, map);
    //   if (syls.length === 0) {
    //     toaster.show("Nada para tocar neste canto.", { kind: "warn" });
    //     return;
    //   }
    //   const tl = buildTimeline(syls);
    //   const playback = computeTimedNotes(tl, DEFAULT_PROFILE, Date.now() % 9973, playbackMode);
    //   // Onda: aplicar fatores do overlay apenas no modo interpretado (D4)
    //   const shaped = playbackMode === "interpretado" ? applyWave(playback, wave) : playback;
    //   // Seleção não-vazia do mouse ⇒ toca só o trecho (spec B2a)
    //   const sel = view.state.selection.main;
    //   const range = syllableRangeOfSelection(map, sel.from, sel.to);
    //   const toPlay = range ? sliceFromSyllable(shaped, range[0]) : shaped;
    //   if (toPlay.notes.length === 0) {
    //     toaster.show("A seleção não tem notas.", { kind: "warn" });
    //     return;
    //   }
    //   const svg = panel?.svgEl?.() ?? null;
    //   toolbarHandle?.refresh();
    //   let lastSyl = -1;
    //   player.play(
    //     toPlay,
    //     (note) => {
    //       // Realce na partitura: por sílaba (sem mudar o guard existente)
    //       if (note.syllableIndex !== lastSyl) {
    //         lastSyl = note.syllableIndex;
    //         if (svg) highlightSyllable(svg, svgIndices[note.syllableIndex] ?? note.syllableIndex + 1);
    //       }
    //       // Cursor da onda: por NOTA (D5 — sem guard de sílaba)
    //       waveLanes.setCursor(waveKey(note.syllableIndex, note.noteInSyllable));
    //     },
    //     () => { stopPlayback(); },
    //   );
    //   toolbarHandle?.refresh(); // agora player.playing já é true
    // },
    // toggleWave: () => {
    //   const on = !waveLanes.enabled();
    //   waveLanes.setEnabled(on);
    //   // Abre/fecha o vão entre sistemas + espalha as notas na horizontal (melismas
    //   // densos). O re-render dispara onRender → rebuildWave, que (re)desenha as lanes
    //   // já no layout espaçado.
    //   panel?.setWaveSpacing(on ? WAVE_LINE_SPACING_PX : 0, on ? WAVE_SPREAD : 1);
    //   // Com a onda ativa a partitura vira superfície de TRABALHO: mais respiro
    //   // ao redor (padding do preview) acompanha o vão maior entre sistemas.
    //   previewHost.classList.toggle("wave-on", on);
    //   if (on) syncWaveWithDoc();
    //   waveBar?.setVisible(on);
    //   waveBar?.setSolfejo(playbackMode !== "interpretado");
    //   toolbarHandle?.refresh();
    // },
    // resetWave: () => {
    //   wave = emptyWave(gabcBodyHash(view.state.doc.toString()));
    //   rebuildWave();
    //   scheduleTitle();
    // },
  };

  commands.register([
    { id: "file.newProject", label: "Novo projeto…", run: h.newProjectCmd },
    { id: "file.open", label: "Abrir…", run: h.openFile, keys: ["Ctrl+O"] },
    { id: "file.save", label: "Salvar", run: saveCmd(false), keys: ["Ctrl+S"] },
    { id: "file.saveAs", label: "Salvar como…", run: saveCmd(true), keys: ["Ctrl+Shift+S"] },
    { id: "project.newChant", label: "Novo canto…", run: () => newChantAt(null, Infinity) },
    { id: "project.newGroup", label: "Novo grupo", run: () => newGroupAt(null, Infinity) },
    { id: "project.importGabc", label: "Importar .gabc…", run: importGabcAsChant },
    { id: "file.exportGabc", label: "Exportar .gabc do canto…", run: h.exportGabc },
    { id: "file.exportAllGabc", label: "Exportar todos os .gabc…", run: h.exportAllGabcCmd },
    { id: "names.export", label: "Exportar nomes…", run: h.exportOverlay, keys: ["Ctrl+Alt+E"] },
    { id: "names.import", label: "Importar nomes…", run: h.importOverlay, keys: ["Ctrl+Alt+I"] },
    // Comandos que agem no editor ficam desligados na vista Neumas (o editor está escondido).
    { id: "edit.undo", label: "Desfazer", icon: "undo-2", run: () => { undo(view); view.focus(); }, enabled: inEdit },
    { id: "edit.redo", label: "Refazer", icon: "redo-2", run: () => { redo(view); view.focus(); }, enabled: inEdit },
    { id: "edit.format", label: "Formatar", icon: "wand-sparkles", run: h.format, keys: ["Ctrl+Shift+F"], enabled: inEdit },
    { id: "neume.moveLeft", label: "Mover neuma para a esquerda", icon: "chevron-left", run: h.moveLeft, keys: ["Alt+ArrowLeft"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveDown", label: "Mover neuma para baixo", icon: "chevron-down", run: h.moveDown, keys: ["Alt+ArrowDown"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveUp", label: "Mover neuma para cima", icon: "chevron-up", run: h.moveUp, keys: ["Alt+ArrowUp"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveRight", label: "Mover neuma para a direita", icon: "chevron-right", run: h.moveRight, keys: ["Alt+ArrowRight"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveReset", label: "Resetar posição do neuma", icon: "rotate-ccw", run: h.moveReset, keys: ["Alt+0"], enabled: inEdit },
    { id: "neume.palette", label: "Buscar neuma…", icon: "search", run: h.openSearch, keys: ["F2", "Ctrl+K", "Ctrl+Space"] },
    // O painel lateral "Nomes" não é mais aberto pela UI: Ctrl+Alt+N abre a vista Neumas.
    { id: "view.edicao", label: "Edição", run: backToEdit, keys: ["Ctrl+Digit1"], checked: () => views.current() === "edicao" },
    { id: "view.neumas", label: "Neumas", run: () => openNeumas(), keys: ["Ctrl+Digit3", "Ctrl+Alt+N"], checked: () => views.current() === "neumas" },
    { id: "neume.name", label: "Nomear neuma…", icon: "tag", run: nameNeumeCmd, keys: ["Ctrl+Shift+N"], enabled: inEdit },
    { id: "neumas.search", label: "Buscar na tela de nomes", run: () => neumasView?.focusSearch(), keys: ["Ctrl+F"], enabled: () => views.current() === "neumas" },
    { id: "doc.toggleFamily", label: "Família do canto: St. Gall ⇄ Laon", run: h.toggleFamily, keys: ["Ctrl+Shift+G"] },
    { id: "view.preview", label: "Partitura", run: h.togglePreview, checked: () => previewHost.style.display !== "none" },
    { id: "view.split", label: "Partitura ao lado", icon: "columns-2", run: h.toggleSplit, checked: () => split.orientation() === "horizontal" },
    { id: "view.legend", label: "Régua da pauta", icon: "ruler", run: h.toggleLegend, keys: ["Ctrl+Alt+L"], checked: () => view.state.field(legendVisible, false) ?? false },
    // PLAYBACK-OFF (2026-10-09): comandos de áudio e da onda.
    // { id: "play.toggle", label: () => (player.playing ? "Parar" : "Tocar"), run: h.playToggle },
    // { id: "play.mode", label: () => (playbackMode === "interpretado" ? "Modo: interpretado" : "Modo: solfejo"), icon: "audio-waveform", run: h.modeToggle, checked: () => playbackMode === "solfejo" },
    // { id: "wave.toggle", label: "Onda de interpretação", icon: "chart-column", run: h.toggleWave, checked: () => waveLanes.enabled() },
    // { id: "wave.reset", label: "Resetar onda", icon: "rotate-ccw", run: h.resetWave, enabled: () => waveLanes.enabled() && Object.keys(wave.factors).length > 0 },
  ]);

  let themeChoice = loadTheme();
  const themeCmd = (choice: ThemeChoice, label: string) => ({
    id: `view.theme.${choice}`, label, run: () => { themeChoice = choice; setTheme(choice); },
    checked: () => themeChoice === choice,
  });
  // Provisórios (toasts) até o diálogo da Task 8.
  const showShortcuts = () => void openDialog(dialogHost, {
    title: "Atalhos de teclado",
    body: commands.ids().filter((id) => commands.shortcut(id)).map((id) => commands.label(id) + " — " + commands.shortcut(id)).join(" · "),
    actions: [{ id: "ok", label: "Fechar", kind: "filled" }],
  });
  const showAbout = () => void openDialog(dialogHost, {
    title: "Sobre o Notker",
    body: "Notker " + __APP_VERSION__ + " — editor de canto gregoriano. GPL-3.",
    actions: [{ id: "ok", label: "Fechar", kind: "filled" }],
  });
  commands.register([
    themeCmd("system", "Tema: sistema"),
    themeCmd("light", "Tema: Pergaminho"),
    themeCmd("dark", "Tema: Vigília"),
    { id: "help.shortcuts", label: "Atalhos de teclado…", run: showShortcuts },
    { id: "help.about", label: "Sobre o Notker…", run: showAbout },
  ]);

  // ── Menubar: menus montados a partir do registro único de comandos ──
  const menuItem = (id: string): MenuItem => {
    const def = commands.get(id);
    return {
      cmd: id,
      label: () => commands.label(id),
      shortcut: commands.shortcut(id),
      checked: def?.checked,
      enabled: def?.enabled,
    };
  };
  menubar = createMenubar(document.querySelector<HTMLElement>("#menubar")!, commands, [
    {
      label: "Arquivo",
      items: [
        menuItem("file.newProject"), menuItem("file.open"), menuItem("file.save"), menuItem("file.saveAs"),
        "---",
        menuItem("project.newChant"), menuItem("project.newGroup"), menuItem("project.importGabc"),
        "---",
        menuItem("file.exportGabc"), menuItem("file.exportAllGabc"),
        "---",
        menuItem("names.import"), menuItem("names.export"),
      ],
    },
    {
      label: "Editar",
      items: [
        { ...menuItem("edit.undo"), shortcut: "Ctrl+Z" },
        { ...menuItem("edit.redo"), shortcut: "Ctrl+Shift+Z" },
        "---",
        menuItem("neume.palette"), menuItem("neume.name"), menuItem("edit.format"),
        "---",
        menuItem("neume.moveLeft"), menuItem("neume.moveDown"), menuItem("neume.moveUp"),
        menuItem("neume.moveRight"), menuItem("neume.moveReset"),
      ],
    },
    {
      label: "Exibir",
      items: [
        menuItem("view.edicao"), menuItem("view.neumas"),
        "---",
        menuItem("view.preview"), menuItem("view.split"), menuItem("view.legend"),
        "---",
        menuItem("doc.toggleFamily"),
        "---",
        menuItem("view.theme.system"), menuItem("view.theme.light"), menuItem("view.theme.dark"),
      ],
    },
    // PLAYBACK-OFF (2026-10-09): menu Interpretação.
    // {
    //   label: "Interpretação",
    //   items: [
    //     menuItem("play.toggle"), menuItem("play.mode"),
    //     "---",
    //     menuItem("wave.toggle"), menuItem("wave.reset"),
    //   ],
    // },
    { label: "Ajuda", items: [menuItem("help.shortcuts"), menuItem("help.about")] },
  ]);
  menubar.setTitle(project.title);

  toolbarHandle = createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
    { tabs: ["view.edicao", "view.neumas"], label: "Vistas" },
    { group: ["edit.undo", "edit.redo"], view: "edicao" },
    { group: ["neume.moveLeft", "neume.moveDown", "neume.moveUp", "neume.moveRight", "neume.moveReset"], view: "edicao" },
    { group: ["edit.format", "neume.palette", "neume.name"], view: "edicao" },
    { group: ["view.split", "view.legend"], view: "edicao" },
    "spacer",
    // PLAYBACK-OFF (2026-10-09): modo, onda e Tocar na toolbar.
    // { group: ["play.mode", "wave.toggle", "wave.reset"] },
    // { primary: "play.toggle" },
  ]);

  // PLAYBACK-OFF (2026-10-09): barra da onda.
  // waveBar = createWaveBar(document.querySelector<HTMLElement>("#wave-bar-host")!, () => {
  //   void commands.run("wave.reset");
  // });

  installTooltips(document.querySelector<HTMLElement>("#tooltip-host")!);

  // Menu de contexto do editor SÓ dentro de um campo nabc (fora dele fica o menu nativo,
  // com copiar/colar). O clique direito leva o cursor ao ponto, salvo dentro da seleção.
  view.dom.addEventListener("contextmenu", (e) => {
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null || nabcFieldStart(view.state.doc.toString(), pos) === -1) return;
    e.preventDefault();
    const sel = view.state.selection.main;
    if (sel.empty || pos < sel.from || pos > sel.to) view.dispatch({ selection: { anchor: pos } });
    openContextMenu(app, e.clientX, e.clientY, [
      { label: "Nomear neuma…", shortcut: commands.shortcut("neume.name"), run: () => void commands.run("neume.name") },
      { label: "Buscar neuma…", shortcut: commands.shortcut("neume.palette"), run: () => void commands.run("neume.palette") },
    ], view.contentDOM);
  });

  // Atalhos no nível da JANELA (registro único), em fase de BOLHA: o CodeMirror
  // trata primeiro F2/Alt+setas quando o editor tem foco e marca o evento com
  // preventDefault; o registro ignora eventos já tratados (sem disparo duplo).
  window.addEventListener("keydown", (e) => { commands.handleKey(e); });

  // Boot pronto: o projeto inicial conta como "sem alterações".
  booted = true;
  captureEditorIntoProject();
  dirty.markSaved(project);
  updateTitle();

  // Fechar a janela: com alterações, pergunta; grava os nomes pendentes; NUNCA prende a
  // janela (falha inesperada na guarda → fecha). O wrapper do Tauri só chama destroy()
  // se o preventDefault não foi chamado.
  try {
    void getCurrentWindow().onCloseRequested(async (ev) => {
      let proceed = true;
      // Gravação em andamento: espera terminar (ok ou erro) antes de decidir; nunca prende a janela.
      if (saving) { try { await saving; } catch { /* a pergunta abaixo mostra o que sobrou */ } }
      try { proceed = await resolveUnsaved(unsaved); } catch (e) { console.error("[notker] fechar:", e); }
      if (!proceed) { ev.preventDefault(); return; }
      try { await overlayAutosave.flush(); } catch { /* o autosave já mostrou o erro */ }
    }).catch(() => { /* sem permissão/evento: segue sem guarda */ });
  } catch { /* fora do Tauri (testes/probe) */ }
}

boot().catch((err) => {
  const app = document.querySelector("#app");
  if (app) app.textContent = "Falha ao iniciar o Notker: " + String(err);
  console.error(err);
});
