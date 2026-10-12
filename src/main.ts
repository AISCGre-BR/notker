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
import { createRegistry, gateCommands, installPrintGuard } from "./app/commands";
import { undo, redo } from "@codemirror/commands";
import { createToolbar, type ToolbarHandle } from "./ui/toolbar";
import { installTooltips } from "./ui/pd/tooltip";
import { createMenubar, type MenuItem, type SubmenuEntry } from "./ui/menubar";
import { createDirtyTracker } from "./app/dirty";
import { createViews } from "./app/views";
import { chantCapture } from "./app/chant-capture";
import { debounce } from "./preview/debounce";
// PLAYBACK-OFF (2026-10-09): barra da onda.
// import { createWaveBar, type WaveBarHandle } from "./ui/wave-bar";
import { newDocumentDialog } from "./ui/new-dialog";
import { openDialog } from "./ui/pd/dialog";
import { askSaveChanges, resolveUnsaved, type UnsavedGuard } from "./app/session";
import { setScreen, type Screen } from "./app/screen";
import { createWelcome } from "./app/welcome";
import { mountNewProjectGuide, projectFromDraft, hasDraft, type GuideHandle } from "./app/new-project-guide";
import { runCloseSequence } from "./app/close-sequence";
import { initLocale, t, tn, type MessageKey } from "./i18n";
import { createThumbTracker } from "./app/thumb-tracker";
import { loadExampleProject } from "./project/example";
import {
  createRecentStore, pushRecent, setRecentThumb, removeRecent, buildRecentMeta, recentTitle, parentFolder,
  type RecentEntry,
} from "./app/recent";
import { appDataSlot, existingPaths, rotateSlot, RECENT_FILE, RECOVERY_FILE, RECOVERY_PREV_FILE } from "./app/appdata-io";
import { createRecoveryWriter, parseSnapshot, projectFromSnapshot, type RecoverySnapshot } from "./app/recovery";
import { scoreThumbnail } from "./app/thumbnail";
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
import { pasteMarksWatcher, pastedRange, applyStrip, marksIn, type Range } from "./gabc/strip-apply";
import { openStripDialog, type StripScope } from "./gabc/strip-dialog";
import { detectMarks, type MarkKinds } from "./gabc/strip-marks";
import { toggleLegend, legendVisible, setLegendLetters } from "./gabc/staff-legend";
import { clefsBySyllable } from "./gabc/staff-letters";
import { drawStaffLetters, clearStaffLetters } from "./preview/staff-letters";
import { openProject, openProjectAt, saveProject, exportCurrentGabc, exportAllGabc, pickGabcFile } from "./files/project-io";
import {
  type NotkerProject, newProject, getActiveChant, effectiveFamily, updateChant, setActive,
  setChantFamily, insertNode, removeNode, restoreRemoved, moveSibling, newChant, gabcName, gabcSkeleton,
  findNode, countChants, newGroup, renameNode, setCollapsed, revealNode, moveNode, duplicateNode, flattenChants,
} from "./project/tree";
import { createTreePanel } from "./project/tree-panel";
import { hasMusic, exportableGroup, selectPieces, scopeTitle } from "./pdf/scope";
import { exportPdfDialog, type PdfOptions } from "./pdf/export-dialog";
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
  initLocale();
  const LANDMARKS: [string, MessageKey][] = [
    ["#doc-list", "landmark.chants"], ["#neumas-view", "landmark.neumes"],
    ["#welcome-host", "landmark.home"], ["#guide-host", "landmark.newProject"],
  ];
  for (const [sel, key] of LANDMARKS) document.querySelector(sel)?.setAttribute("aria-label", t(key));
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
    // Colou gabc com episemas/puncta mora: oferece removê-los (toast com ação).
    pasteMarksWatcher(() => offerStrip(t("strip.offer.pasted"), "pasted")),
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

  let project: NotkerProject = newProject({ family: "stgall", name: t("project.defaultChant") });
  const view = new EditorView({ parent: app, state: chantStates.get(project.activeId, getActiveChant(project).content) });
  /** Canto cujo texto está no editor agora: o capture escreve SEMPRE nele. */
  let shownId: string | null = project.activeId;
  /** Muda a cada projeto carregado: um "Desfazer" antigo não age no projeto novo. */
  let projectEpoch = 0;
  const dirty = createDirtyTracker();
  /** Só depois do boot o título reage (captureEditorIntoProject lê `wave`, criada adiante). */
  let booted = false;
  /** Tela atual (src/app/screen.ts): tela inicial, guia de novo projeto ou mesa. */
  let screen: Screen = "welcome";
  /** Há um projeto do usuário carregado (pode estar escondido atrás do guia). */
  let projectOpen = false;
  let menubar: ReturnType<typeof createMenubar> | undefined;
  /** Título na menubar com "— Editado" quando o projeto difere do último salvo/aberto. */
  function updateTitle(): void {
    if (!booted) return;
    if (screen === "welcome") { menubar?.setTitle("Notker"); return; }
    if (screen === "guide") { menubar?.setTitle(t("landmark.newProject")); return; }
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

  if (highlightFailed) toaster.show(t("app.highlightFailed"), { kind: "warn" });

  // effectiveRef: entradas efetivas atuais, hoistado para fora do bloco F2 (usado por "Nomear neuma…").
  let effectiveRef: () => EffectiveEntry[] = () => [];

  // Variáveis de overlay, reindex e família ativa — hoistadas para o handler de teclado.
  let overlay: Overlay = emptyOverlay();
  /** O arquivo de nomes existe mas não pôde ser lido (corrompido, versão mais nova, sem
   *  permissão): NADA é gravado nesta sessão, para não sobrescrevê-lo com um overlay vazio. */
  let overlayBlocked: string | null = t("names.notLoaded"); // guarda começa FECHADA
  async function writeOverlay(): Promise<void> {
    if (overlayBlocked) throw new Error(t("names.blocked", { reason: overlayBlocked }));
    await saveUserOverlay(overlay);
  }
  let reindex = () => {};
  let paletteRef: { open(v: EditorView): void } | null = null;
  // Autosave dos nomes: `overlay` fica SEMPRE em dia (atualizado na hora por
  // `commitOverlay`: vista Neumas, hover); só a ESCRITA é coalescida (300 ms). schedule() resolve quando o disco
  // confirma (indicador "salvo ✓" verdadeiro); flush() antes de import/export/fechar.
  const overlayAutosave = createAutosave(async () => {
    try {
      await writeOverlay();
    } catch (e) {
      toaster.show(t("names.saveFailed", { error: String(e) }), { kind: "error" });
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
    panel?.update(view.state.doc.toString()); // a partitura troca a fonte dos neumas
    toaster.show(t("family.changed", { family: familyLabel(f) }));
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
      toaster.show(t("names.loadFailed", { error: overlayBlocked }), { kind: "error" });
    }
    // Catálogo + nomes do usuário + sequências do usuário, recalculados a cada mudança
    // do overlay (busca, paleta, completion, hover e vista Neumas leem daqui).
    const glyphOf = glyphIndex(db.all());
    let effectiveCache = buildEffective(db.all(), overlay, glyphOf);
    let lookup = byNabcIndex(effectiveCache);
    const effective = (): EffectiveEntry[] => effectiveCache;
    effectiveRef = effective;
    let searchInst = new NeumeSearch(effectiveCache);
    const rebuildIndex = (): void => {
      effectiveCache = buildEffective(db.all(), overlay, glyphOf);
      lookup = byNabcIndex(effectiveCache);
      searchInst = new NeumeSearch(effectiveCache);
    };
    reindex = () => { rebuildIndex(); if (views.current() === "neumas") neumasView?.refresh(); };
    commitOverlay = (next) => { overlay = next; rebuildIndex(); return overlayAutosave.schedule(); };
    const rt = {
      getTree,
      search: () => searchInst,
      lookupByNabc: (nabc: string): EffectiveEntry[] => lookup(nabc),
      activeFamily: () => currentFamily(),
      openNames: (target: { id?: string; family: Family; nabc: string }) =>
        openNeumas(target.id ? { family: target.family, select: target.id, focus: "name" } : { family: target.family, newChain: target.nabc, focus: "name" }),
      onName: async (ids: string[], name: string) => {
        const n = name.trim();
        const targets = ids.map((id) => ({
          id,
          displayNames: effective().find((e) => e.id === id)?.displayNames ?? [],
        }));
        const r = addNameToEntries(overlay, targets, n);
        if (!r.changed) { toaster.show(t("names.exists"), { kind: "warn" }); return; }
        const saved = commitOverlay(r.overlay); // ponto único: overlay + índices + autosave
        try { await saved; toaster.show(t("names.added", { name: n })); }
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
    toaster.show(t("catalog.loadFailed", { error: String(err) }), { kind: "error" });
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

  // ── Onda de interpretação (Tuotilo B2a) — UI desligada (PLAYBACK-OFF); o estado `wave` segue vivo ─────────────────────────────────
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
  // panel é declarado fora do try (PLAYBACK-OFF: o playToggle, comentado, o usava em runtime).
  let panel: ReturnType<typeof createPreviewPanel> | null = null;
  // Letras na pauta (Task 4): preferência de vista da sessão, desligada por padrão. Só a
  // partitura da MESA (este painel) as recebe — PDF e miniatura renderizam pelo motor direto.
  let staffLettersOn = false;
  function refreshStaffLetters(): void {
    const svg = panel?.svgEl() ?? null;
    if (!staffLettersOn) { clearStaffLetters(svg); return; }
    const clefs = clefsBySyllable(view.state.doc.toString());
    drawStaffLetters(svg, (first) => (first == null ? null : clefs[Math.min(first, clefs.length - 1)]));
  }
  function toggleStaffLetters(): void {
    staffLettersOn = !staffLettersOn;
    previewHost.classList.toggle("staff-letters-on", staffLettersOn);
    refreshStaffLetters();
    // O gutter muda o padding do #preview → re-render na nova largura útil (o panel lê o
    // padding real); o onRender redesenha as letras no SVG novo.
    panel?.update(view.state.doc.toString());
    view.dispatch({}); // o painel da régua reflete o estado no botão
  }
  setLegendLetters({ on: () => staffLettersOn, toggle: toggleStaffLetters });
  try {
    const engine = new NabcLibEngine();
    panel = createPreviewPanel(previewHost, engine, { debounceMs: 150, family: currentFamily });
    installSync(view, panel);
    panel.update(view.state.doc.toString());
    // Letras na pauta: o SVG é trocado a cada render (innerHTML) → redesenha depois de cada um.
    panel.onRender(refreshStaffLetters);
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
      if (id === project.activeId) { reindex(); panel?.update(view.state.doc.toString()); }
      toaster.show(t("family.changed", { family: familyLabel(f) }));
    },
    onNewChant: (parentId, index) => void newChantAt(parentId, index),
    onNewGroup: (parentId, index) => newGroupAt(parentId, index),
    onImport: () => void importGabcAsChant(),
  });

  function renderTree(): void { treePanel.render(project); updateTitle(); }
  /** Mostra no editor o canto ativo, com o EditorState DELE. Guarda antes o estado do
   *  canto que sai (inclusive se ele acabou de ser excluído: o Desfazer o devolve com
   *  histórico). O LSP recebe didChange completo; a partitura refaz (onda: PLAYBACK-OFF). */
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
    onDocChange(); // setState não dispara updateListener: LSP + partitura à mão (onda: PLAYBACK-OFF)
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
  function loadProject(p: NotkerProject): boolean {
    captureEditorIntoProject(); // se falhar, o projeto anterior (com o texto atual) é restaurado
    const prev = project;
    const prevEpoch = projectEpoch;
    const prevBaseline = dirty.baseline(); // e o "— Editado" dele volta igual (resíduo 1b-1)
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
      return true;
    } catch (err) {
      console.error(err);
      project = prev;
      projectEpoch = prevEpoch;
      shownId = null;
      try { syncFromProject(); } catch (e2) { console.error(e2); }
      // O markSaved(p) lá em cima trocou a linha de base: o anterior volta com a DELE
      // (senão aparece "— Editado" sem ter mudado, ou perde o aviso e a pergunta de salvar).
      dirty.restoreBaseline(prevBaseline);
      updateTitle();
      toaster.show(t("project.openFailed", { error: String(err) }), { kind: "error" });
      return false;
    }
  }
  /** Pai ainda válido depois de um diálogo assíncrono; senão a raiz. */
  const liveParent = (parentId: string | null): string | null =>
    (parentId && findNode(project, parentId)?.kind === "group" ? parentId : null);
  // Novo canto (diálogo com nome/ofício/família) no lugar pedido; vira o ativo.
  // revealNode expande um grupo recolhido que seja o destino.
  async function newChantAt(parentId: string | null, index: number): Promise<void> {
    const r = await newDocumentDialog(dialogHost, { title: t("newChant.title"), family: effectiveFamily(project, project.activeId) });
    if (!r) return;
    const chant = newChant({ title: r.name ?? t("project.defaultChant"), content: gabcSkeleton(r.name, r.office), family: r.family });
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
      const c = detectMarks(f.content);
      if (c.vertical + c.horizontal + c.mora > 0) offerStrip(t("strip.offer.imported"), "imported");
    } catch (e) {
      toaster.show(t("file.importFailed", { error: String(e) }), { kind: "error" });
    }
  }
  /** Remover episemas e puncta mora: escolha anterior da sessão e oferta em toast. Nada age se o
   *  canto exibido ou o projeto mudou desde a oferta. */
  let lastStrip: MarkKinds | undefined;
  function offerStrip(msg: string, scope: StripScope): void {
    const id = shownId, epoch = projectEpoch;
    toaster.show(msg, { action: { label: t("strip.action"), run: () => { if (id === shownId && epoch === projectEpoch) void runStrip(scope); } } });
  }
  async function runStrip(scope: StripScope): Promise<void> {
    const id = shownId, epoch = projectEpoch;
    const sel = view.state.selection.main;
    const area = (): Range | undefined => scope === "pasted" ? view.state.field(pastedRange, false) ?? undefined
      : scope === "selection" ? { from: sel.from, to: sel.to } : undefined;
    if (scope === "pasted" && !area()) { toaster.show(t("strip.gone"), { kind: "warn" }); return; }
    const counts = marksIn(view.state, area());
    if (counts.vertical + counts.horizontal + counts.mora === 0) { toaster.show(t("strip.none")); return; }
    const kinds = await openStripDialog(dialogHost, counts, lastStrip, scope);
    if (!kinds || id !== shownId || epoch !== projectEpoch) return;
    if (scope === "pasted" && !area()) { toaster.show(t("strip.gone"), { kind: "warn" }); return; }
    lastStrip = kinds;
    const n = applyStrip(view, kinds, area());
    toaster.show(n === 0 ? t("strip.nothing") : tn("strip.removed", n));
    view.focus();
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
          title: tn("tree.deleteGroupConfirm", n, { title: node.title }),
          actions: [
            { id: "delete", label: t("common.delete"), kind: "danger" },
            { id: "cancel", label: t("common.cancel"), kind: "elevated" },
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
    toaster.show(node.kind === "group" ? t("tree.groupDeleted") : t("tree.chantDeleted"), {
      action: { label: t("common.undo"), run: () => { if (epoch === projectEpoch) applyTree((p) => restoreRemoved(p, r)); } },
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
      toaster.show(t("project.saved"));
      void recovery.clear();              // salvo: o retrato desta sessão não serve mais
      void rememberRecent(project, "save"); // entra/sobe nos recentes, com miniatura nova
      return true;
    })();
    saving = run;
    try { return await run; }
    finally { if (saving === run) saving = null; }
  }
  const saveCmd = (saveAs: boolean) => async (): Promise<void> => {
    try { await doSave(saveAs); }
    catch (err) { toaster.show(t("project.saveFailed", { error: String(err) }), { kind: "error" }); console.error(err); }
  };

  const unsaved: UnsavedGuard = {
    isDirty: () => {
      if (!projectOpen) return false; // tela inicial: nada a perder
      captureEditorIntoProject();
      return dirty.isDirty(project);
    },
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
    if (!neumasView) { toaster.show(t("catalog.notLoaded"), { kind: "error" }); return; }
    views.set("neumas");
    neumasView.open({ ...o, family: o.family ?? currentFamily() });
  }
  /** "Nomear neuma…" (Ctrl+Shift+N): seleção num campo nabc, sílaba selecionada (clique na
   *  partitura) ou neuma sob o cursor → glifo/sequência existente ou sequência nova, com o
   *  foco em "Novo nome…". */
  function nameNeumeCmd(): void {
    const sel = view.state.selection.main;
    const chain = chainAtSelection(view.state.doc.toString(), sel.from, sel.to,
      getTree() as Parameters<typeof chainAtSelection>[3]);
    if (!chain) { toaster.show(t("names.cursorHint"), { kind: "warn" }); return; }
    const family = currentFamily();
    const target = resolveNameTarget(effectiveRef(), family, chain);
    openNeumas(target.kind === "existing" ? { family, select: target.id, focus: "name" } : { family, newChain: target.nabc, focus: "name" });
  }
  const countLabel = (c: { named: number; sequences: number }): string => {
    const parts = [c.named ? tn("names.count.named", c.named) : "", c.sequences ? tn("names.count.sequences", c.sequences) : ""].filter(Boolean);
    return parts.length === 2 ? t("common.and", { a: parts[0], b: parts[1] }) : parts[0] ?? "";
  };

  // ── Telas (1b-2): tela inicial, guia de novo projeto e mesa ─────────────────
  // (PLAYBACK-OFF: não há player a parar ao sair da mesa.)
  const welcomeHost = document.querySelector<HTMLElement>("#welcome-host")!;
  const guideHost = document.querySelector<HTMLElement>("#guide-host")!;
  let guide: GuideHandle | null = null;
  function showScreen(s: Screen): void {
    screen = s;
    setScreen(s);
    if (s === "project") view.requestMeasure(); // o editor estava em display:none
    toolbarHandle?.refresh();
    updateTitle();
  }
  /** Vista Edição sem roubar o foco: grava antes o pendente da vista Neumas (nota em
   *  debounce, nome digitado). Um projeto sempre abre (e a mesa sempre fecha) na Edição. */
  function toEditView(): void {
    if (views.current() === "edicao") return;
    neumasView?.flush();
    views.set("edicao");
  }
  /** Foco de volta à mesa na vista em que ela está. */
  function focusDesk(): void {
    if (views.current() === "neumas") neumasView?.focusSearch(); else view.focus();
  }
  function closeGuide(): void { guide?.destroy(); guide = null; }
  /** Mostra um projeto (aberto, criado, exemplo, recuperado) na mesa. false = não abriu
   *  (o loadProject já avisou e restaurou o anterior): a tela não muda. */
  function enterProject(p: NotkerProject): boolean {
    if (!loadProject(p)) return false;
    closeGuide();
    toEditView();
    projectOpen = true;
    showScreen("project");
    view.focus();
    return true;
  }
  // ── Recentes e recuperação de sessão (spec §4.6) ───────────────────────────
  const recentStore = createRecentStore(appDataSlot(RECENT_FILE), existingPaths);
  const recoverySlot = appDataSlot(RECOVERY_FILE);
  const recoveryPrevSlot = appDataSlot(RECOVERY_PREV_FILE);
  let recents: RecentEntry[] = [];
  /** Retrato de uma sessão anterior que não foi salva (aviso na tela inicial). */
  let pendingRecovery: RecoverySnapshot | null = null;
  /** Um segundo retrato mais antigo (empurrado para `session.prev.json` quando esta sessão
   *  gravou o primeiro dela sem que o anterior tivesse sido resolvido). */
  let pendingPrev: RecoverySnapshot | null = null;
  const thumbs = createThumbTracker();
  const recovery = createRecoveryWriter({
    slot: recoverySlot,
    current: () => {
      if (!projectOpen) return null;
      captureEditorIntoProject();
      return dirty.isDirty(project) ? project : null;
    },
    // Vaga única: o retrato pendente de outra sessão vai para `.prev` antes do 1º desta.
    foreign: {
      has: () => pendingRecovery !== null,
      rotate: async () => {
        await rotateSlot(RECOVERY_FILE, RECOVERY_PREV_FILE);
        pendingPrev = pendingRecovery; // só depois de renomear: falha = nada muda
        pendingRecovery = null;
      },
    },
  });
  function renderWelcome(): void {
    const recoveries: { id: string; title: string }[] = [];
    if (pendingRecovery) recoveries.push({ id: "current", title: pendingRecovery.title });
    if (pendingPrev) recoveries.push({ id: "prev", title: pendingPrev.title });
    welcome.render({ recents, recoveries });
  }
  async function setRecents(list: RecentEntry[]): Promise<void> {
    recents = list;
    try { await recentStore.save(list); } catch (e) { console.warn("[notker] recentes não gravados:", e); }
    if (screen === "welcome") renderWelcome();
  }
  const hasThumb = (path: string | undefined): boolean =>
    !!path && !!recents.find((e) => e.path === path)?.meta?.thumb;
  /** Entra (ou sobe) nos recentes — só .notker com caminho. Miniatura do 1º canto: ao
   *  salvar, ou ao abrir quando ainda não há. Falha na miniatura = cartão sem imagem. */
  async function rememberRecent(p: NotkerProject, when: "open" | "save"): Promise<void> {
    const path = p.path;
    if (!path) return;
    await setRecents(pushRecent(recents, { path, meta: buildRecentMeta(p, new Date()) }));
    const first = flattenChants(p)[0];
    if (!first) return;
    // Abrir: só se ainda não há miniatura. Salvar: só se o 1º canto mudou desde a última.
    const content = first.content;
    const family = effectiveFamily(p, first.id);
    if (hasThumb(path) && (when === "open" || !thumbs.changed(path, content, family))) return;
    // Nunca prende quem chamou: img.decode pode ficar pendente para sempre (timeout de 8 s).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let thumb: string | undefined;
    try {
      thumb = await Promise.race([
        scoreThumbnail(content, { family }).catch(() => undefined),
        new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), 8000); }),
      ]);
    } finally { clearTimeout(timer); }
    if (thumb) {
      thumbs.remember(path, content, family);
      await setRecents(setRecentThumb(recents, path, thumb));
    }
  }
  /** Sair do projeto atual (abrir/criar/fechar): pergunta se há alterações; seguindo, o
   *  retrato de recuperação desta sessão deixa de valer. */
  async function leaveProject(): Promise<boolean> {
    if (!(await resolveUnsaved(unsaved))) return false;
    await recovery.clear();
    return true;
  }
  async function openRecent(path: string): Promise<void> {
    const isGone = (): Promise<boolean> => existingPaths([path]).then((r) => r[0] === false).catch(() => false);
    const dropGone = async (): Promise<void> => {
      await setRecents(removeRecent(recents, path));
      toaster.show(t("recent.gone"), { kind: "warn" });
    };
    try {
      // Sumiu? Avisa e tira só este recente, sem perguntar "Salvar alterações?".
      if (await isGone()) { await dropGone(); return; }
      if (!(await leaveProject())) return;
      if (enterProject(await openProjectAt(path))) void rememberRecent(project, "open");
    } catch (err) {
      if (await isGone()) await dropGone();
      else {
        toaster.show(t("open.failed", { error: String(err) }), { kind: "error" });
        console.error(err);
      }
    }
  }
  async function recoverSession(id: string): Promise<void> {
    const fromPrev = id === "prev";
    const snap = fromPrev ? pendingPrev : pendingRecovery;
    if (!snap || !(await resolveUnsaved(unsaved))) return;
    let p: NotkerProject;
    try { p = projectFromSnapshot(snap); }
    catch (err) { toaster.show(t("recovery.recoverFailed", { error: String(err) }), { kind: "error" }); return; }
    if (!enterProject(p)) return;
    dirty.markDirty();   // abre como projeto editado (spec §4.6)
    updateTitle();
    if (!fromPrev) {
      pendingRecovery = null;
      recovery.adopt();  // salvar/descartar/fechar agora apagam este retrato
      return;
    }
    // Do `.prev`: o trabalho passa para a vaga atual (gravado já, não daqui a 30 s) e só
    // então o arquivo `.prev` sai — a menos que a gravação tenha empurrado outro retrato para ele.
    pendingPrev = null;
    await recovery.tick();
    if (recovery.owns() && pendingPrev === null) {
      try { await recoveryPrevSlot.remove(); } catch (e) { console.warn("[notker] recuperação:", e); }
    } else if (!recovery.owns() && pendingPrev === null) {
      // não gravou: o retrato continua valendo — mas só se a rotação não pôs outro no `.prev`
      // (senão a memória trocaria o pendente certo por este, e o disco teria o outro)
      pendingPrev = snap;
    }
  }
  async function discardRecovery(id: string): Promise<void> {
    const fromPrev = id === "prev";
    const snap = fromPrev ? pendingPrev : pendingRecovery;
    if (!snap) return;
    const r = await openDialog(dialogHost, {
      title: t("recovery.discard.title", { title: snap.title }),
      body: t("recovery.discard.body"),
      actions: [
        { id: "discard", label: t("common.discard"), kind: "danger" },
        { id: "keep", label: t("common.keep"), kind: "filled" },
      ],
      defaultAction: "keep",
    });
    if (r.action !== "discard") return;
    if ((fromPrev ? pendingPrev : pendingRecovery) !== snap) return; // mudou durante a pergunta
    try { await (fromPrev ? recoveryPrevSlot : recoverySlot).remove(); }
    catch (e) { console.warn("[notker] recuperação:", e); toaster.show(t("recovery.discardFailed", { error: String(e) }), { kind: "error" }); return; }
    if (fromPrev) pendingPrev = null; else pendingRecovery = null;
    renderWelcome();
  }
  /** Itens de Arquivo ▸ Abrir recente (montados a cada abertura do menu). */
  const recentMenu = (): (SubmenuEntry | "---")[] => (recents.length === 0
    ? [{ label: t("menu.noRecent"), run: () => {}, enabled: false }]
    : [
      ...recents.map((e): SubmenuEntry => ({ label: recentTitle(e), caption: parentFolder(e.path), run: () => { void openRecent(e.path); } })),
      "---",
      { label: t("cmd.file.clearRecents"), run: () => { void commands.run("file.clearRecents"); } },
    ]);
  function showWelcome(): void {
    closeGuide();
    renderWelcome();
    showScreen("welcome");
    welcome.focus();
  }
  const confirmDiscardGuide = async (): Promise<boolean> => (await openDialog(dialogHost, {
    title: t("guide.discard.title"),
    body: t("guide.discard.body"),
    actions: [
      { id: "discard", label: t("common.discard"), kind: "danger" },
      { id: "keep", label: t("guide.discard.keep"), kind: "filled" },
    ],
  })).action === "discard";
  /** Guia de novo projeto. Cancelar volta para onde estava (projeto intacto ou tela inicial). */
  function openGuide(): void {
    const back: Screen = screen === "guide" ? (projectOpen ? "project" : "welcome") : screen;
    closeGuide();
    guide = mountNewProjectGuide(guideHost, {
      pickGabc: async () => {
        try { return await pickGabcFile(); }
        catch (e) { toaster.show(t("file.importFailed", { error: String(e) }), { kind: "error" }); return null; }
      },
      confirmDiscard: confirmDiscardGuide,
      onCancel: () => {
        closeGuide();
        if (back === "project" && projectOpen) { showScreen("project"); focusDesk(); }
        else showWelcome();
      },
      onCreate: (draft) => {
        if (!enterProject(projectFromDraft(draft))) return;
        // Projeto novo, sem caminho e com conteúdo: NÃO está salvo (aparece "— Editado",
        // fechar pergunta e o retrato de recuperação passa a ser gravado).
        dirty.markDirty();
        updateTitle();
      },
    });
    showScreen("guide");
    guide.focus();
  }
  /** Arquivo ▸ Fechar projeto: pergunta se há alterações e volta à tela inicial. */
  async function closeProjectCmd(): Promise<void> {
    if (!projectOpen) return;
    if (!(await leaveProject())) return;
    toEditView(); // nota pendente da vista Neumas gravada; a mesa volta (depois) na Edição
    if (!loadProject(newProject({ family: "stgall", name: t("project.defaultChant") }))) return; // solta o projeto da memória; falhou = continua com o atual
    projectOpen = false;
    showWelcome();
  }

  const commands = createRegistry();
  /** Exportar PDF: uma exportação por vez; as escolhas do diálogo valem até fechar o app. */
  let exportingPdf = false;
  let lastPdfOptions: PdfOptions | undefined;
  /** Algum canto com notas (o do editor lido do editor, ainda não capturado). */
  const canExportPdf = (): boolean =>
    flattenChants(project).some((c) => hasMusic(c.id === shownId ? view.state.doc.toString() : c.content));
  const h = {
    // Novo projeto: primeiro decide as alterações do atual; depois o guia em passos
    // (adendo §11). Já no guia, só devolve o foco a ele.
    newProjectCmd: async () => {
      if (screen === "guide") { guide?.focus(); return; }
      if (!(await leaveProject())) return;
      openGuide();
    },
    openFile: async () => {
      try {
        if (!(await leaveProject())) return;
        const p = await openProject();
        if (!p) return;
        if (enterProject(p)) void rememberRecent(project, "open");
      } catch (err) { toaster.show(t("open.failed", { error: String(err) }), { kind: "error" }); console.error(err); }
    },
    openExample: async () => {
      if (!(await leaveProject())) return;
      enterProject(loadExampleProject());
    },
    exportGabc: async () => {
      try {
        captureEditorIntoProject();
        const out = await exportCurrentGabc(project);
        if (out) toaster.show(t("export.done"));
      } catch (err) { toaster.show(t("export.failed", { error: String(err) }), { kind: "error" }); console.error(err); }
    },
    exportAllGabcCmd: async () => {
      try {
        captureEditorIntoProject();
        const n = await exportAllGabc(project);
        if (n) toaster.show(tn("export.chants", n));
      } catch (err) { toaster.show(t("export.failed", { error: String(err) }), { kind: "error" }); console.error(err); }
    },
    // Arquivo ▸ Exportar PDF… (sub-projeto 3): diálogo → salvar como → desenhar → gravar.
    exportPdf: async () => {
      if (exportingPdf) { toaster.show(t("pdf.busy"), { kind: "warn" }); return; }
      try {
        captureEditorIntoProject();
        const group = exportableGroup(project, treePanel.focusedId());
        const opts = await exportPdfDialog(dialogHost, {
          chantHasMusic: hasMusic(getActiveChant(project).content), group, last: lastPdfOptions,
        });
        if (!opts) return;
        lastPdfOptions = opts;
        captureEditorIntoProject();
        const groupId = group?.id ?? null;
        const pieces = selectPieces(project, opts.scope, groupId);
        exportingPdf = true;
        const [{ exportPdf }, { pdfBrowserDeps }] = await Promise.all([import("./pdf/export-pdf"), import("./pdf/browser")]);
        const deps = pdfBrowserDeps(document.querySelector<HTMLElement>("#measure-host")!, {
          onProgress: (i, n) => toaster.show(n > 1 ? t("pdf.progressN", { i, n }) : t("pdf.progress")),
        });
        const r = await exportPdf(deps, pieces, scopeTitle(project, opts.scope, groupId), opts);
        if (!r) return;
        const file = r.path.split(/[\\/]/).pop() ?? r.path;
        if (r.failed.length) toaster.show(t("pdf.donePartial", { file, failed: r.failed.join(", ") }), { kind: "warn" });
        else toaster.show(t("pdf.done", { file }));
      } catch (err) {
        toaster.show(t("pdf.failed", { error: err instanceof Error ? err.message : String(err) }), { kind: "error" });
        console.error(err);
      } finally {
        exportingPdf = false;
      }
    },
    format: async () => {
      try {
        const id = shownId;
        const f = await formatDocument(client, URI, view.state.doc);
        // O canto pode ter mudado durante o await: não escreve texto de um no outro.
        if (f != null && shownId === id) replaceDoc(f);
      } catch (err) {
        toaster.show(t("format.failed", { error: String(err) }), { kind: "error" });
        console.error("[notker] erro ao formatar:", err);
      }
    },
    exportOverlay: async () => {
      try {
        try { await overlayAutosave.flush(); } catch { /* o autosave já mostrou o erro */ }
        const c = overlayCounts(overlay);
        if (c.named + c.sequences === 0) { toaster.show(t("names.noneToExport"), { kind: "warn" }); return; }
        await exportOverlay(overlay);
        toaster.show(t("names.exported", { what: countLabel(c) }));
      } catch (err) {
        toaster.show(t("names.exportFailed", { error: String(err) }), { kind: "error" });
        console.error("[notker] erro ao exportar overlay:", err);
      }
    },
    importOverlay: async () => {
      try {
        const imported = await importOverlay();
        if (!imported) return;
        const c = overlayCounts(imported);
        if (c.named + c.sequences === 0) {
          toaster.show(t("names.fileEmpty"), { kind: "warn" });
          return;
        }
        await overlayAutosave.flush();
        const previous = overlay;
        overlay = mergeOverlays(overlay, imported);
        reindex();
        try { await writeOverlay(); }
        catch (e) {
          // Escrita bloqueada/falhou: não mostrar nomes que não foram gravados.
          overlay = previous;
          reindex();
          throw e;
        }
        toaster.show(t("names.imported", { what: countLabel(c) }));
      } catch (err) {
        toaster.show(t("names.importFailed", { error: String(err) }), { kind: "error" });
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
    { id: "file.newProject", label: t("cmd.file.newProject"), run: h.newProjectCmd, keys: ["Ctrl+N"] },
    { id: "file.open", label: t("cmd.file.open"), run: h.openFile, keys: ["Ctrl+O"] },
    { id: "file.save", label: t("cmd.file.save"), run: saveCmd(false), keys: ["Ctrl+S"] },
    { id: "file.saveAs", label: t("cmd.file.saveAs"), run: saveCmd(true), keys: ["Ctrl+Shift+S"] },
    { id: "file.openExample", label: t("cmd.file.openExample"), run: h.openExample },
    { id: "file.clearRecents", label: t("cmd.file.clearRecents"), run: () => setRecents([]) },
    { id: "file.close", label: t("cmd.file.close"), run: closeProjectCmd, keys: ["Ctrl+W"] },
    { id: "project.newChant", label: t("cmd.project.newChant"), run: () => newChantAt(null, Infinity) },
    { id: "project.newGroup", label: t("cmd.project.newGroup"), run: () => newGroupAt(null, Infinity) },
    { id: "project.importGabc", label: t("cmd.project.importGabc"), run: importGabcAsChant },
    { id: "file.exportGabc", label: t("cmd.file.exportGabc"), run: h.exportGabc },
    { id: "file.exportAllGabc", label: t("cmd.file.exportAllGabc"), run: h.exportAllGabcCmd },
    { id: "file.exportPdf", label: t("cmd.file.exportPdf"), run: h.exportPdf, keys: ["Ctrl+P"], enabled: canExportPdf },
    { id: "names.export", label: t("cmd.names.export"), run: h.exportOverlay, keys: ["Ctrl+Alt+E"] },
    { id: "names.import", label: t("cmd.names.import"), run: h.importOverlay, keys: ["Ctrl+Alt+I"] },
    // Comandos que agem no editor ficam desligados na vista Neumas (o editor está escondido).
    { id: "edit.undo", label: t("cmd.edit.undo"), icon: "undo-2", run: () => { undo(view); view.focus(); }, enabled: inEdit },
    { id: "edit.redo", label: t("cmd.edit.redo"), icon: "redo-2", run: () => { redo(view); view.focus(); }, enabled: inEdit },
    { id: "edit.format", label: t("cmd.edit.format"), icon: "wand-sparkles", run: h.format, keys: ["Ctrl+Shift+F"], enabled: inEdit },
    { id: "edit.stripMarks", label: t("cmd.edit.stripMarks"), run: () => runStrip(view.state.selection.main.empty ? "chant" : "selection"), enabled: inEdit },
    { id: "neume.moveLeft", label: t("cmd.neume.moveLeft"), icon: "chevron-left", run: h.moveLeft, keys: ["Alt+ArrowLeft"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveDown", label: t("cmd.neume.moveDown"), icon: "chevron-down", run: h.moveDown, keys: ["Alt+ArrowDown"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveUp", label: t("cmd.neume.moveUp"), icon: "chevron-up", run: h.moveUp, keys: ["Alt+ArrowUp"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveRight", label: t("cmd.neume.moveRight"), icon: "chevron-right", run: h.moveRight, keys: ["Alt+ArrowRight"], allowRepeat: true, enabled: inEdit },
    { id: "neume.moveReset", label: t("cmd.neume.moveReset"), icon: "rotate-ccw", run: h.moveReset, keys: ["Alt+0"], enabled: inEdit },
    { id: "neume.palette", label: t("cmd.neume.palette"), icon: "search", run: h.openSearch, keys: ["F2", "Ctrl+K", "Ctrl+Space"] },
    // O painel lateral "Nomes" não é mais aberto pela UI: Ctrl+Alt+N abre a vista Neumas.
    { id: "view.edicao", label: t("cmd.view.edicao"), run: backToEdit, keys: ["Ctrl+Digit1"], checked: () => views.current() === "edicao" },
    { id: "view.neumas", label: t("cmd.view.neumas"), run: () => openNeumas(), keys: ["Ctrl+Digit3", "Ctrl+Alt+N"], checked: () => views.current() === "neumas" },
    { id: "neume.name", label: t("cmd.neume.name"), icon: "tag", run: nameNeumeCmd, keys: ["Ctrl+Shift+N"], enabled: inEdit },
    { id: "neumas.search", label: t("cmd.neumas.search"), run: () => neumasView?.focusSearch(), keys: ["Ctrl+F"], enabled: () => views.current() === "neumas" },
    { id: "doc.toggleFamily", label: t("cmd.doc.toggleFamily"), run: h.toggleFamily, keys: ["Ctrl+Shift+G"] },
    { id: "view.preview", label: t("cmd.view.preview"), run: h.togglePreview, checked: () => previewHost.style.display !== "none" },
    { id: "view.split", label: t("cmd.view.split"), icon: "columns-2", run: h.toggleSplit, checked: () => split.orientation() === "horizontal" },
    { id: "view.legend", label: t("cmd.view.legend"), icon: "ruler", run: h.toggleLegend, keys: ["Ctrl+Alt+L"], checked: () => view.state.field(legendVisible, false) ?? false },
    { id: "view.staffLetters", label: t("cmd.view.staffLetters"), run: toggleStaffLetters, checked: () => staffLettersOn },
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
    title: t("dialog.shortcuts.title"),
    body: commands.ids().filter((id) => commands.shortcut(id)).map((id) => commands.label(id) + " — " + commands.shortcut(id)).join(" · "),
    actions: [{ id: "ok", label: t("common.close"), kind: "filled" }],
  });
  const showAbout = () => void openDialog(dialogHost, {
    title: t("dialog.about.title"),
    body: t("dialog.about.body", { version: __APP_VERSION__ }),
    actions: [{ id: "ok", label: t("common.close"), kind: "filled" }],
  });
  commands.register([
    themeCmd("system", t("cmd.view.theme.system")),
    themeCmd("light", t("cmd.view.theme.light")),
    themeCmd("dark", t("cmd.view.theme.dark")),
    { id: "help.shortcuts", label: t("cmd.help.shortcuts"), run: showShortcuts },
    { id: "help.about", label: t("cmd.help.about"), run: showAbout },
  ]);

  // Fora da mesa (tela inicial/guia) só valem Novo projeto, Abrir, Nomes (importar/
  // exportar), tema e ajuda. Vistas (Edição/Neumas) só existem dentro da mesa. Compõe com
  // o `enabled: inEdit` dos comandos do editor. ANTES de montar menubar e toolbar: elas
  // leem o enabled() do def na montagem. (PLAYBACK-OFF: play.*/wave.* não existem;
  // gateCommands lança para id desconhecido.)
  gateCommands(commands, [
    "file.save", "file.saveAs", "file.close", "project.newChant", "project.newGroup", "project.importGabc",
    "file.exportGabc", "file.exportAllGabc", "file.exportPdf", "edit.undo", "edit.redo", "edit.format", "edit.stripMarks",
    "neume.moveLeft", "neume.moveDown", "neume.moveUp", "neume.moveRight", "neume.moveReset",
    "neume.palette", "neume.name", "neumas.search", "view.edicao", "view.neumas",
    "doc.toggleFamily", "view.preview", "view.split", "view.legend", "view.staffLetters",
  ], () => screen === "project");

  const welcome = createWelcome(welcomeHost, {
    onNew: () => { void commands.run("file.newProject"); },
    onOpen: () => { void commands.run("file.open"); },
    onOpenExample: () => { void commands.run("file.openExample"); },
    onOpenRecent: (path) => { void openRecent(path); },
    onRecover: (id) => { void recoverSession(id); },
    onDiscardRecovery: (id) => { void discardRecovery(id); },
  });

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
      label: t("menu.file"),
      items: [
        menuItem("file.newProject"), menuItem("file.open"),
        { label: t("menu.openRecent"), submenu: recentMenu },
        menuItem("file.save"), menuItem("file.saveAs"),
        "---",
        menuItem("project.newChant"), menuItem("project.newGroup"), menuItem("project.importGabc"),
        "---",
        menuItem("file.exportGabc"), menuItem("file.exportAllGabc"), menuItem("file.exportPdf"),
        "---",
        menuItem("names.import"), menuItem("names.export"),
        "---",
        menuItem("file.close"),
      ],
    },
    {
      label: t("menu.edit"),
      items: [
        { ...menuItem("edit.undo"), shortcut: "Ctrl+Z" },
        { ...menuItem("edit.redo"), shortcut: "Ctrl+Shift+Z" },
        "---",
        menuItem("neume.palette"), menuItem("neume.name"), menuItem("edit.format"), menuItem("edit.stripMarks"),
        "---",
        menuItem("neume.moveLeft"), menuItem("neume.moveDown"), menuItem("neume.moveUp"),
        menuItem("neume.moveRight"), menuItem("neume.moveReset"),
      ],
    },
    {
      label: t("menu.view"),
      items: [
        menuItem("view.edicao"), menuItem("view.neumas"),
        "---",
        menuItem("view.preview"), menuItem("view.split"), menuItem("view.legend"), menuItem("view.staffLetters"),
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
    { label: t("menu.help"), items: [menuItem("help.shortcuts"), menuItem("file.openExample"), "---", menuItem("help.about")] },
  ]);
  menubar.setTitle(project.title);

  toolbarHandle = createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
    { tabs: ["view.edicao", "view.neumas"], label: t("toolbar.views") },
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
      { label: commands.label("neume.name"), shortcut: commands.shortcut("neume.name"), run: () => void commands.run("neume.name") },
      { label: commands.label("neume.palette"), shortcut: commands.shortcut("neume.palette"), run: () => void commands.run("neume.palette") },
    ], view.contentDOM);
  });

  // Atalhos no nível da JANELA (registro único), em fase de BOLHA: o CodeMirror
  // trata primeiro F2/Alt+setas quando o editor tem foco e marca o evento com
  // preventDefault; o registro ignora eventos já tratados (sem disparo duplo).
  installPrintGuard(window); // Ctrl+P nunca imprime, mesmo com campos que engolem a tecla
  window.addEventListener("keydown", (e) => { commands.handleKey(e); });

  // Boot pronto: o projeto inicial conta como "sem alterações".
  booted = true;
  captureEditorIntoProject();
  dirty.markSaved(project);
  // Recentes (some o que não existe mais) e o retrato de uma sessão que caiu.
  try { recents = await recentStore.load(); } catch { recents = []; }
  try { pendingRecovery = parseSnapshot(await recoverySlot.read()); } catch { pendingRecovery = null; }
  try { pendingPrev = parseSnapshot(await recoveryPrevSlot.read()); } catch { pendingPrev = null; }
  showWelcome(); // sem projeto aberto: tela inicial
  recovery.start();

  // Fechar a janela: com alterações, pergunta; grava os nomes pendentes; NUNCA prende a
  // janela (falha inesperada na guarda → fecha). O wrapper do Tauri só chama destroy()
  // se o preventDefault não foi chamado.
  try {
    void getCurrentWindow().onCloseRequested(async (ev) => {
      // Nunca rejeita (o wrapper do Tauri só fecha se o handler não lançar): cada passo
      // da sequência tem o seu try/catch e, no pior caso, a janela fecha.
      try {
        const { prevent } = await runCloseSequence({
          awaitSaving: async () => { if (saving) { try { await saving; } catch { /* a pergunta abaixo mostra o que sobrou */ } } },
          // Guia com algo digitado: pergunta antes de fechar (o rascunho não tem outra rede).
          confirmGuide: screen === "guide" && guide && hasDraft(guide.draft()) ? confirmDiscardGuide : undefined,
          resolveUnsaved: () => resolveUnsaved(unsaved),
          flushView: () => neumasView?.flush(), // nota em debounce / nome digitado entram no autosave
          flushNames: () => overlayAutosave.flush(), // erro: o autosave já o mostrou
          stopRecovery: () => recovery.stop(),
          clearRecovery: () => recovery.clear(),
        });
        if (prevent) ev.preventDefault();
      } catch (e) { console.error("[notker] fechar:", e); }
    }).catch(() => { /* sem permissão/evento: segue sem guarda */ });
  } catch { /* fora do Tauri (testes/probe) */ }
}

boot().catch((err) => {
  document.body.dataset.screen = "project"; // a mensagem fica no #app, que a tela inicial esconde
  const app = document.querySelector("#app");
  if (app) app.textContent = t("app.bootFailed", { error: String(err) });
  console.error(err);
});
