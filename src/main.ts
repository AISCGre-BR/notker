import "parchment-design/parchment.css";
import "parchment-design/components.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./ui/notker.css";
import { applyTheme, loadTheme } from "./app/theme";
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
import { mergeEntry, addName, mergeOverlays, cloneOverlay } from "./neume/overlay";
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
import { createMenubar } from "./ui/menubar";
import { createWaveBar, type WaveBarHandle } from "./ui/wave-bar";
import { newDocumentDialog } from "./ui/new-dialog";
import { NabcLibEngine } from "./preview/nabc-lib";
import { createPreviewPanel } from "./preview/panel";
import { installSync, syncFromCursor } from "./preview/sync";
import { highlightSyllable, clearHighlight } from "./preview/highlight";
import { createPlayer } from "./tuotilo/player";
import { extractAll } from "./tuotilo/signs";
import { buildTimeline } from "./tuotilo/timeline";
import { computeTimedNotes, sliceFromSyllable, type PlaybackMode } from "./tuotilo/duration";
import { syllableRangeOfSelection } from "./preview/source-map";
import { DEFAULT_PROFILE } from "./tuotilo/profile";
import { createOverlayPanel, type OverlayPanel } from "./overlay-ui/panel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSplit, type Split } from "./ui/split";
import { toggleLegend, legendVisible } from "./gabc/staff-legend";
import { openProject, saveProject, exportCurrentGabc, exportAllGabc } from "./files/project-io";
import {
  type NotkerProject, newProject, getActiveDoc, effectiveFamily,
  withActiveContent, setActive, setDocFamily, addDoc, removeDoc,
} from "./project/model";
import { createDocList } from "./project/doc-list";
import { createWaveLanes, factorFromDrag, deformLiveSegment, WAVE_SPREAD, WAVE_LINE_SPACING_PX, type NoteIdent } from "./preview/wave-lanes";
import type { WaveOverlay } from "./tuotilo/wave";
import { emptyWave, setWaveFactor, applyWave, gabcBodyHash, waveKey } from "./tuotilo/wave";

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
  applyTheme(loadTheme());
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
  // Autosave dos nomes: `overlay` fica SEMPRE em dia (atualizado na hora pelo
  // painel); só a ESCRITA é coalescida (300 ms). schedule() resolve quando o disco
  // confirma (indicador "salvo ✓" verdadeiro); flush() antes de import/export/fechar.
  const overlayAutosave = createAutosave(async () => {
    try {
      await saveUserOverlay(overlay);
      reindex();
      setStatus("nomes salvos ✓");
    } catch (e) {
      setStatus("erro ao salvar nomes: " + String(e));
      throw e;
    }
  }, 300);
  // Painel de nomes aberto (se houver): re-sincroniza quando o overlay muda POR FORA
  // dele (hover "adicionar nome", importar) — senão o próximo autosave do rascunho
  // antigo apagaria a mudança.
  let overlayPanel: OverlayPanel | null = null;
  // Fechar a janela com escrita pendente: grava antes (try/finally — fecha mesmo se falhar).
  try {
    void getCurrentWindow().onCloseRequested(async () => {
      try { await overlayAutosave.flush(); } catch { /* status já exibido */ }
    }).catch(() => { /* sem permissão/evento: segue sem flush */ });
  } catch { /* fora do Tauri (testes/probe) */ }
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
        try { await overlayAutosave.flush(); } catch { /* status já exibido */ }
        overlay = addName(overlay, id, name);
        reindex();
        overlayPanel?.refresh();
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

  // Referência mutável para limpar o cursor da onda no stopPlayback.
  let waveCursorClear: () => void = () => {};
  // Handles de UI atribuídos no fim do boot; os closures abaixo rodam depois.
  let toolbarHandle: ToolbarHandle | null = null;
  let waveBar: WaveBarHandle | null = null;

  // ── Onda de interpretação (Tuotilo B2a) ─────────────────────────────────
  // seed fixa para visual estável entre re-renders; playback usa Date.now()%9973
  const WAVE_SEED = 12345;
  // Espaçamento com onda ativa (WAVE_LINE_SPACING_PX + WAVE_SPREAD): wave-lanes.ts.
  let wave: WaveOverlay = emptyWave("");

  // Estado do arrasto vertical de fator.
  let dragState: { key: string; syl: number; note: number; startFactor: number; startClientY: number } | null = null;
  // Contagem de notas por sílaba (interna) p/ a leitura "nota N de M" no rodapé.
  let waveNotesPerSyl = new Map<number, number>();

  const waveLanes = createWaveLanes(() => panel?.svgEl?.() ?? null, {
    onFactorDrag: (key, syl, note, startFactor, startClientY) => {
      if (playbackMode !== "interpretado") { setStatus("onda: edição só no modo interpretado"); return; }
      dragState = { key, syl, note, startFactor, startClientY };
    },
    onHover: (syl) => {
      const svg = panel?.svgEl?.(); if (!svg) return;
      if (syl === null) { clearHighlight(svg); return; }
      highlightSyllable(svg, syl); // syl já é o realSyllableIndex (renderWaveLanes passa o índice real)
    },
  }, { readAnchors: () => panel?.noteAnchors?.() ?? [] });

  // Rótulo do alongamento p/ a leitura ao vivo no rodapé (na estética: sem floats).
  const fatorLabel = (f: number): string =>
    Math.abs(f - 1) < 0.01 ? "neumático puro" : `×${f.toFixed(2).replace(".", ",")}`;
  const notaLabel = (d: NonNullable<typeof dragState>): string => {
    const total = waveNotesPerSyl.get(d.syl);
    return total && total > 1 ? `nota ${d.note + 1} de ${total}` : `nota ${d.note + 1}`;
  };
  window.addEventListener("pointermove", (ev) => {
    if (!dragState) return;
    const f = factorFromDrag(dragState.startFactor, dragState.startClientY, ev.clientY);
    const svg = panel?.svgEl?.(); if (svg) deformLiveSegment(svg, dragState.key, f);
    // Leitura ao vivo na barra da onda (perto do gesto); rodapé fica p/ status geral.
    waveBar?.setReading(`alongamento ${fatorLabel(f)} — ${notaLabel(dragState)}`);
  });
  window.addEventListener("pointerup", (ev) => {
    if (!dragState) return;
    const f = factorFromDrag(dragState.startFactor, dragState.startClientY, ev.clientY);
    wave = setWaveFactor(wave, dragState.syl, dragState.note, f);
    waveBar?.setReading(null);
    dragState = null;
    rebuildWave();
  });
  window.addEventListener("pointercancel", () => { dragState = null; waveBar?.setReading(null); });

  // Liga a referência mutável usada em stopPlayback.
  waveCursorClear = () => waveLanes.setCursor(null);

  /** Recomputa a onda a partir do doc atual + overlay WaveOverlay e repassa para
   *  o controller de lanes integrado ao SVG da partitura. */
  function rebuildWave(): void {
    waveBar?.setCount(Object.keys(wave.factors).length);
    const map = panel?.sourceMap?.() ?? [];
    const texto = view.state.doc.toString();
    const reals = map.filter((s) => s.syllableIndex >= 1);
    const syls = extractAll(texto, map);
    if (syls.length === 0) { waveLanes.refresh([]); return; }
    const tl = buildTimeline(syls);
    // base = durações neumáticas PURAS (sem applyWave); o fator vem do overlay
    const base = computeTimedNotes(tl, DEFAULT_PROFILE, WAVE_SEED, "interpretado");
    const notes: NoteIdent[] = base.notes.map((n) => ({
      syllableIndex: n.syllableIndex,                                                         // INTERNO — overlay/cursor/data-key
      realSyllableIndex: reals[n.syllableIndex]?.syllableIndex ?? (n.syllableIndex + 1),      // REAL (syllable-N)
      noteInSyllable: n.noteInSyllable,
      pitch: n.pitch, alt: n.alt,
      factor: wave.factors[waveKey(n.syllableIndex, n.noteInSyllable)] ?? 1,
      divisioAfter: n.pauseAfterMs > 0
        ? (tl.divisiones.find((d) => d.afterNoteIdx === n.idx)?.kind ?? null)
        : null,
    }));
    waveNotesPerSyl = new Map();
    for (const n of notes) waveNotesPerSyl.set(n.syllableIndex, (waveNotesPerSyl.get(n.syllableIndex) ?? 0) + 1);
    waveLanes.refresh(notes);
  }

  /** Verifica hash do canto e sinaliza onda desatualizada (D4). */
  function syncWaveWithDoc(): void {
    const h = gabcBodyHash(view.state.doc.toString());
    // Primeira vez (hash vazio): adota o hash sem marcar como stale
    if (wave.gabcBodyHash === "") wave = { ...wave, gabcBodyHash: h };
    if (Object.keys(wave.factors).length > 0 && wave.gabcBodyHash !== h)
      setStatus("interpretação desatualizada — o canto foi editado");
    rebuildWave();
  }

  let split: Split = { orientation: () => "horizontal", setOrientation: () => {}, toggle: () => {} };
  // panel é declarado fora do try para que playToggle (Tuotilo) acesse em runtime.
  let panel: ReturnType<typeof createPreviewPanel> | null = null;
  try {
    const engine = new NabcLibEngine();
    panel = createPreviewPanel(previewHost, engine, { debounceMs: 150 });
    installSync(view, panel);
    panel.update(view.state.doc.toString());
    // Re-injeta as wave lanes após cada render (sobrevive a debounce e resize).
    panel.onRender(() => { if (waveLanes.enabled()) rebuildWave(); });
    // Encadeia no onDocChange (que já vale o sync/LSP didChange) sem substituí-lo.
    const prevOnDocChange = onDocChange;
    onDocChange = () => {
      prevOnDocChange();
      panel!.update(view.state.doc.toString());
      // Onda: re-sincroniza apenas se as lanes estiverem habilitadas.
      if (waveLanes.enabled()) syncWaveWithDoc();
    };
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
  const player = createPlayer(() => new AudioContext(), "voz");
  let playbackMode: PlaybackMode = "interpretado";

  /** Para o playback de forma consistente: silencia, restaura botão, limpa realce e status. */
  function stopPlayback(reason?: string): void {
    player.stop();
    toolbarHandle?.setLabel("play.toggle", "Tocar");
    toolbarHandle?.setPressed("play.toggle", false);
    const svg = panel?.svgEl?.() ?? null;
    if (svg) clearHighlight(svg);
    waveCursorClear();
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
    // Onda: restaura a interpretação persistida, ou cria vazia para o novo canto
    wave = getActiveDoc(project).interpretation ?? emptyWave(gabcBodyHash(getActiveDoc(project).content));
    if (waveLanes.enabled()) syncWaveWithDoc();
  }
  function captureEditorIntoProject(): void {
    project = withActiveContent(project, view.state.doc.toString());
    const docs = project.docs.map((d) =>
      d.id === project.activeId
        ? { ...d, interpretation: Object.keys(wave.factors).length > 0 ? wave : undefined }
        : d,
    );
    project = { ...project, docs };
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

  const commands = createRegistry();
  const h = {
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
        await overlayAutosave.flush();
        overlay = mergeOverlays(overlay, imported);
        await saveUserOverlay(overlay);
        reindex();
        overlayPanel?.refresh();
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
      const closePanel = () => { host.style.display = "none"; host.innerHTML = ""; overlayPanel = null; };
      // Toggle: se já está aberto, fecha.
      if (host.style.display === "block") { closePanel(); return; }
      host.style.display = "block";
      const op = createOverlayPanel(host, {
        entries: effectiveRef,
        initial: () => overlay,
        onChange: (o) => {
          overlay = cloneOverlay(o); // em dia JÁ (clone: sem aliasing com o rascunho)
          return overlayAutosave.schedule();
        },
        onExport: async () => {
          // `overlay` já reflete a tela; grava o pendente antes de exportar.
          try { await overlayAutosave.flush(); } catch { /* status já exibido */ }
          const n = Object.values(overlay.entries).filter((e) => e.names?.length).length;
          await exportOverlay(overlay);
          setStatus(n ? `nomes exportados: ${n} entrada(s)` : "exportar: nenhum nome cadastrado — arquivo vazio");
        },
        onImport: async () => {
          await commands.run("names.import"); // flush + merge + refresh do painel lá dentro
        },
        onClose: closePanel,
      });
      overlayPanel = op;
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
    // Tuotilo: alterna interpretado ↔ solfejo. No solfejo toda nota vale baseMs
    // (leitura de solmização); sinais e legato só no interpretado.
    modeToggle: () => {
      playbackMode = playbackMode === "interpretado" ? "solfejo" : "interpretado";
      toolbarHandle?.setLabel("play.mode", playbackMode === "interpretado" ? "Interpretado" : "Solfejo");
      waveBar?.setSolfejo(playbackMode !== "interpretado");
      if (player.playing) stopPlayback("playback: parado (troca de modo)");
      setStatus("modo de playback: " + playbackMode);
    },
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
      // Contrato de índices: extractAll filtra sílabas reais (syllableIndex>=1) na
      // MESMA ordem de svgIndices; note.syllableIndex (0-based na timeline) é,
      // portanto, posição válida em svgIndices.
      const svgIndices = map.filter((s) => s.syllableIndex >= 1).map((s) => s.syllableIndex);
      const syls = extractAll(texto, map);
      if (syls.length === 0) {
        setStatus("playback: nenhuma sílaba encontrada");
        return;
      }
      const tl = buildTimeline(syls);
      const playback = computeTimedNotes(tl, DEFAULT_PROFILE, Date.now() % 9973, playbackMode);
      // Onda: aplicar fatores do overlay apenas no modo interpretado (D4)
      const shaped = playbackMode === "interpretado" ? applyWave(playback, wave) : playback;
      // Seleção não-vazia do mouse ⇒ toca só o trecho (spec B2a)
      const sel = view.state.selection.main;
      const range = syllableRangeOfSelection(map, sel.from, sel.to);
      const toPlay = range ? sliceFromSyllable(shaped, range[0]) : shaped;
      if (toPlay.notes.length === 0) {
        setStatus("playback: seleção sem notas");
        return;
      }
      const svg = panel?.svgEl?.() ?? null;
      toolbarHandle?.setLabel("play.toggle", "Parar");
      toolbarHandle?.setPressed("play.toggle", true);
      setStatus(range ? "playback: da seleção ao fim…" : "playback: tocando…");
      let lastSyl = -1;
      player.play(
        toPlay,
        (note) => {
          // Realce na partitura: por sílaba (sem mudar o guard existente)
          if (note.syllableIndex !== lastSyl) {
            lastSyl = note.syllableIndex;
            if (svg) highlightSyllable(svg, svgIndices[note.syllableIndex] ?? note.syllableIndex + 1);
          }
          // Cursor da onda: por NOTA (D5 — sem guard de sílaba)
          waveLanes.setCursor(waveKey(note.syllableIndex, note.noteInSyllable));
        },
        () => { stopPlayback("playback: fim"); },
      );
    },
    toggleWave: () => {
      const on = !waveLanes.enabled();
      waveLanes.setEnabled(on);
      // Abre/fecha o vão entre sistemas + espalha as notas na horizontal (melismas
      // densos). O re-render dispara onRender → rebuildWave, que (re)desenha as lanes
      // já no layout espaçado.
      panel?.setWaveSpacing(on ? WAVE_LINE_SPACING_PX : 0, on ? WAVE_SPREAD : 1);
      // Com a onda ativa a partitura vira superfície de TRABALHO: mais respiro
      // ao redor (padding do preview) acompanha o vão maior entre sistemas.
      previewHost.classList.toggle("wave-on", on);
      if (on) syncWaveWithDoc();
      waveBar?.setVisible(on);
      waveBar?.setSolfejo(playbackMode !== "interpretado");
      toolbarHandle?.setPressed("wave.toggle", on);
      setStatus(on ? "onda: visível" : "onda: oculta");
    },
    resetWave: () => {
      wave = emptyWave(gabcBodyHash(view.state.doc.toString()));
      rebuildWave();
      setStatus("onda: restaurada ao neumático");
    },
  };

  commands.register([
    { id: "file.newProject", label: "Novo projeto…", run: h.newProjectCmd },
    { id: "file.open", label: "Abrir…", run: h.openFile, keys: ["Ctrl+O"] },
    { id: "file.save", label: "Salvar", run: h.saveFile, keys: ["Ctrl+S"] },
    { id: "file.exportGabc", label: "Exportar .gabc do canto…", run: h.exportGabc },
    { id: "file.exportAllGabc", label: "Exportar todos os .gabc…", run: h.exportAllGabcCmd },
    { id: "names.export", label: "Exportar nomes…", run: h.exportOverlay, keys: ["Ctrl+Alt+E"] },
    { id: "names.import", label: "Importar nomes…", run: h.importOverlay, keys: ["Ctrl+Alt+I"] },
    { id: "edit.undo", label: "Desfazer", icon: "undo-2", run: () => { undo(view); view.focus(); } },
    { id: "edit.redo", label: "Refazer", icon: "redo-2", run: () => { redo(view); view.focus(); } },
    { id: "edit.format", label: "Formatar", icon: "wand-sparkles", run: h.format, keys: ["Ctrl+Shift+F"] },
    { id: "neume.moveLeft", label: "Mover neuma para a esquerda", icon: "chevron-left", run: h.moveLeft, keys: ["Alt+ArrowLeft"], allowRepeat: true },
    { id: "neume.moveDown", label: "Mover neuma para baixo", icon: "chevron-down", run: h.moveDown, keys: ["Alt+ArrowDown"], allowRepeat: true },
    { id: "neume.moveUp", label: "Mover neuma para cima", icon: "chevron-up", run: h.moveUp, keys: ["Alt+ArrowUp"], allowRepeat: true },
    { id: "neume.moveRight", label: "Mover neuma para a direita", icon: "chevron-right", run: h.moveRight, keys: ["Alt+ArrowRight"], allowRepeat: true },
    { id: "neume.moveReset", label: "Resetar posição do neuma", icon: "rotate-ccw", run: h.moveReset, keys: ["Alt+0"] },
    // Provisório até a Task 9 (paleta própria).
    { id: "neume.palette", label: "Buscar neuma…", icon: "search", run: h.openSearch, keys: ["F2", "Ctrl+K"] },
    { id: "names.panel", label: "Nomes dos neumas…", icon: "tag", run: h.openOverlayPanel, keys: ["Ctrl+Alt+N"] },
    { id: "doc.toggleFamily", label: "Família do canto: St. Gall ⇄ Laon", run: h.toggleFamily, keys: ["Ctrl+Shift+G"] },
    { id: "view.preview", label: "Partitura", run: h.togglePreview, checked: () => previewHost.style.display !== "none" },
    { id: "view.split", label: "Partitura ao lado", icon: "columns-2", run: h.toggleSplit, checked: () => split.orientation() === "horizontal" },
    { id: "view.legend", label: "Régua da pauta", icon: "ruler", run: h.toggleLegend, keys: ["Ctrl+Alt+L"], checked: () => view.state.field(legendVisible) },
    { id: "play.toggle", label: () => (player.playing ? "Parar" : "Tocar"), run: h.playToggle },
    { id: "play.mode", label: () => (playbackMode === "interpretado" ? "Modo: interpretado" : "Modo: solfejo"), run: h.modeToggle },
    { id: "wave.toggle", label: "Onda de interpretação", icon: "chart-column", run: h.toggleWave, checked: () => waveLanes.enabled() },
    { id: "wave.reset", label: "Resetar onda", icon: "rotate-ccw", run: h.resetWave, enabled: () => waveLanes.enabled() },
  ]);

  // ── Spec B: menubar (comandos completos) + toolbar contextual (frequentes) ──
  // Rótulos/checks dos menus são funções — reavaliados a cada abertura.
  createMenubar(document.querySelector<HTMLElement>("#menubar")!, commands, [
    {
      label: "Arquivo",
      items: [
        { cmd: "file.newProject", label: "Novo projeto…" },
        { cmd: "file.open", label: "Abrir…", shortcut: "Ctrl+O" },
        { cmd: "file.save", label: "Salvar", shortcut: "Ctrl+S" },
        "---",
        { cmd: "file.exportGabc", label: "Exportar .gabc" },
        { cmd: "file.exportAllGabc", label: "Exportar todos os .gabc" },
      ],
    },
    {
      label: "Editar",
      items: [
        { cmd: "edit.format", label: "Formatar", shortcut: "Ctrl+Shift+F" },
        "---",
        { cmd: "neume.moveLeft", label: "Mover neuma para a esquerda", shortcut: "Alt+←" },
        { cmd: "neume.moveDown", label: "Mover neuma para baixo", shortcut: "Alt+↓" },
        { cmd: "neume.moveUp", label: "Mover neuma para cima", shortcut: "Alt+↑" },
        { cmd: "neume.moveRight", label: "Mover neuma para a direita", shortcut: "Alt+→" },
        { cmd: "neume.moveReset", label: "Resetar posição do neuma", shortcut: "Alt+0" },
      ],
    },
    {
      label: "Exibir",
      items: [
        { cmd: "view.preview", label: "Partitura", checked: () => previewHost.style.display !== "none" },
        { cmd: "view.split", label: "Lado a lado", checked: () => split.orientation() === "horizontal" },
        { cmd: "view.legend", label: "Régua da pauta", shortcut: "Ctrl+Alt+L", checked: () => view.state.field(legendVisible) },
        "---",
        { cmd: "neume.palette", label: "Buscar neumas…", shortcut: "F2" },
        { cmd: "names.panel", label: "Nomes dos neumas…", shortcut: "Ctrl+Alt+N" },
        "---",
        { cmd: "doc.toggleFamily", label: "Família: St. Gall ⇄ Laon", shortcut: "Ctrl+Shift+G" },
      ],
    },
    {
      label: "Interpretação",
      items: [
        { cmd: "play.toggle", label: () => (player.playing ? "Parar" : "Tocar") },
        { cmd: "play.mode", label: () => (playbackMode === "interpretado" ? "Modo: interpretado" : "Modo: solfejo") },
        "---",
        { cmd: "wave.toggle", label: "Onda de interpretação", checked: () => waveLanes.enabled() },
        { cmd: "wave.reset", label: "Resetar onda", enabled: () => waveLanes.enabled() },
      ],
    },
  ]);

  toolbarHandle = createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
    { id: "play.toggle", label: "Tocar", title: "playback semiológico (Tuotilo)", primary: true },
    { id: "play.mode", label: "Interpretado", title: "modo de playback — interpretado/solfejo" },
    { id: "wave.toggle", label: "Onda", title: "mostrar/ocultar a onda de interpretação" },
    "|",
    { id: "neume.moveLeft", label: "◀", title: "Alt+← — mover neuma para a esquerda" },
    { id: "neume.moveDown", label: "▼", title: "Alt+↓ — mover neuma para baixo" },
    { id: "neume.moveUp", label: "▲", title: "Alt+↑ — mover neuma para cima" },
    { id: "neume.moveRight", label: "▶", title: "Alt+→ — mover neuma para a direita" },
    { id: "neume.moveReset", label: "⟳", title: "Alt+0 — resetar posição do neuma" },
    "|",
    { id: "neume.palette", label: "Buscar", title: "F2" },
    { id: "names.panel", label: "Nomes", title: "Ctrl+Alt+N — nomes de neumas (scriptorium)" },
  ]);

  // Estado inicial dos toggles da toolbar (a11y: aria-pressed desde o boot).
  toolbarHandle.setPressed("wave.toggle", false);

  waveBar = createWaveBar(document.querySelector<HTMLElement>("#wave-bar-host")!, () => {
    void commands.run("wave.reset");
  });

  // Atalhos no nível da JANELA (registro único), em fase de BOLHA: o CodeMirror
  // trata primeiro F2/Alt+setas quando o editor tem foco e marca o evento com
  // preventDefault; o registro ignora eventos já tratados (sem disparo duplo).
  window.addEventListener("keydown", (e) => { commands.handleKey(e); });
}

boot().catch((err) => {
  const app = document.querySelector("#app");
  if (app) app.textContent = "Falha ao iniciar o Notker: " + String(err);
  setStatus("BOOT ERRO: " + String(err));
  console.error(err);
});
