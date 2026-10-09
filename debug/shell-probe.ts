/** shell-probe.ts — harness de diagnóstico do chrome Parchment (NÃO faz parte do app).
 *  Monta os módulos reais de UI sem Tauri. Query: ?theme=dark|light, ?menu=N,
 *  ?palette=1, ?toast=error, ?dump=1 (exibe o <pre id="dump" > com os contrastes). */
import "parchment-design/parchment.css";
import "parchment-design/components.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "../src/ui/notker.css";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../src/editor/editor";
import { highlightTheme } from "../src/editor/theme";
import { makeTreeSitterHighlighter } from "../src/editor/highlight-tree-sitter";
import grammarWasmUrl from "../src/assets/tree-sitter-gregorio.wasm?url";
import runtimeWasmUrl from "../src/assets/tree-sitter.wasm?url";
import { applyTheme } from "../src/app/theme";
import { createRegistry } from "../src/app/commands";
import { createMenubar, type MenuItem } from "../src/ui/menubar";
import { createToolbar } from "../src/ui/toolbar";
import { installTooltips } from "../src/ui/pd/tooltip";
import { createToaster } from "../src/ui/pd/toast";
import { createTreePanel } from "../src/project/tree-panel";
import { newProject, newChant, insertNode, setActive, flattenChants, newGroup } from "../src/project/tree";
import { NabcLibEngine } from "../src/preview/nabc-lib";
import { loadNeumeDb } from "../src/neume/db-load";
import { NeumeSearch } from "../src/neume/search";
import { mergeEntry } from "../src/neume/overlay";
import { neumeExtensions } from "../src/neume/index";
import { gabcAssistExtensions } from "../src/gabc/index";
import { Compartment } from "@codemirror/state";
import { emptyOverlay, addName, addSequence } from "../src/neume/overlay";
import { buildEffective, glyphIndex } from "../src/neume/effective";
import { validateNabc, type NabcParser } from "../src/neume/validate-nabc";
import { createNeumeDrawer } from "../src/neume/draw";
import { createNabcOnlyRenderer } from "../src/preview/nabc-only";
import { createNeumasView } from "../src/neumas/view";

const qs = new URLSearchParams(location.search);
const theme = qs.get("theme") === "dark" ? "dark" : "light";
applyTheme(theme);
const noop = () => {};

const commands = createRegistry();
commands.register([
  { id: "file.newProject", label: "Novo projeto…", run: noop },
  { id: "file.open", label: "Abrir…", run: noop, keys: ["Ctrl+O"] },
  { id: "file.save", label: "Salvar", run: noop, keys: ["Ctrl+S"] },
  { id: "file.exportGabc", label: "Exportar .gabc do canto…", run: noop },
  { id: "file.exportAllGabc", label: "Exportar todos os .gabc…", run: noop },
  { id: "names.export", label: "Exportar nomes…", run: noop, keys: ["Ctrl+Alt+E"] },
  { id: "names.import", label: "Importar nomes…", run: noop, keys: ["Ctrl+Alt+I"] },
  { id: "edit.undo", label: "Desfazer", icon: "undo-2", run: noop },
  { id: "edit.redo", label: "Refazer", icon: "redo-2", run: noop },
  { id: "edit.format", label: "Formatar", icon: "wand-sparkles", run: noop, keys: ["Ctrl+Shift+F"] },
  { id: "neume.moveLeft", label: "Mover neuma para a esquerda", icon: "chevron-left", run: noop, keys: ["Alt+ArrowLeft"] },
  { id: "neume.moveDown", label: "Mover neuma para baixo", icon: "chevron-down", run: noop, keys: ["Alt+ArrowDown"] },
  { id: "neume.moveUp", label: "Mover neuma para cima", icon: "chevron-up", run: noop, keys: ["Alt+ArrowUp"] },
  { id: "neume.moveRight", label: "Mover neuma para a direita", icon: "chevron-right", run: noop, keys: ["Alt+ArrowRight"] },
  { id: "neume.moveReset", label: "Resetar posição do neuma", icon: "rotate-ccw", run: noop, keys: ["Alt+0"] },
  { id: "neume.palette", label: "Buscar neuma…", icon: "search", run: noop, keys: ["F2", "Ctrl+K", "Ctrl+Space"] },
  { id: "view.edicao", label: "Edição", run: noop, keys: ["Ctrl+Digit1"], checked: () => qs.get("view") !== "neumas" },
  { id: "view.neumas", label: "Neumas", run: noop, keys: ["Ctrl+Digit3", "Ctrl+Alt+N"], checked: () => qs.get("view") === "neumas" },
  { id: "neume.name", label: "Nomear neuma…", icon: "tag", run: noop, keys: ["Ctrl+Shift+N"] },
  { id: "doc.toggleFamily", label: "Família do canto: St. Gall ⇄ Laon", run: noop, keys: ["Ctrl+Shift+G"] },
  { id: "view.preview", label: "Partitura", run: noop, checked: () => true },
  { id: "view.split", label: "Partitura ao lado", icon: "columns-2", run: noop, checked: () => true },
  { id: "view.legend", label: "Régua da pauta", icon: "ruler", run: noop, keys: ["Ctrl+Alt+L"], checked: () => false },
  { id: "play.toggle", label: "Tocar", run: noop },
  { id: "play.mode", label: "Modo: interpretado", icon: "audio-waveform", run: noop, checked: () => false },
  { id: "wave.toggle", label: "Onda de interpretação", icon: "chart-column", run: noop, checked: () => false },
  { id: "wave.reset", label: "Resetar onda", icon: "rotate-ccw", run: noop, enabled: () => false },
  { id: "view.theme.system", label: "Tema: sistema", run: noop, checked: () => false },
  { id: "view.theme.light", label: "Tema: Pergaminho", run: noop, checked: () => theme === "light" },
  { id: "view.theme.dark", label: "Tema: Vigília", run: noop, checked: () => theme === "dark" },
  { id: "help.shortcuts", label: "Atalhos de teclado…", run: noop },
  { id: "help.about", label: "Sobre o Notker…", run: noop },
]);

const menuItem = (id: string): MenuItem => {
  const def = commands.get(id);
  return { cmd: id, label: () => commands.label(id), shortcut: commands.shortcut(id), checked: def?.checked, enabled: def?.enabled };
};
const menubar = createMenubar(document.querySelector<HTMLElement>("#menubar")!, commands, [
  { label: "Arquivo", items: [menuItem("file.newProject"), menuItem("file.open"), menuItem("file.save"), "---", menuItem("file.exportGabc"), menuItem("file.exportAllGabc"), "---", menuItem("names.import"), menuItem("names.export")] },
  { label: "Editar", items: [{ ...menuItem("edit.undo"), shortcut: "Ctrl+Z" }, { ...menuItem("edit.redo"), shortcut: "Ctrl+Shift+Z" }, "---", menuItem("neume.palette"), menuItem("edit.format"), "---", menuItem("neume.moveLeft"), menuItem("neume.moveDown"), menuItem("neume.moveUp"), menuItem("neume.moveRight"), menuItem("neume.moveReset")] },
  { label: "Exibir", items: [menuItem("view.preview"), menuItem("view.split"), menuItem("view.legend"), "---", menuItem("view.edicao"), menuItem("view.neumas"), "---", menuItem("doc.toggleFamily"), "---", menuItem("view.theme.system"), menuItem("view.theme.light"), menuItem("view.theme.dark")] },
  { label: "Ajuda", items: [menuItem("help.shortcuts"), menuItem("help.about")] },
]);
menubar.setTitle("Kyrie — Missa de teste", !!qs.get("edited"));

createToolbar(document.querySelector<HTMLElement>("#toolbar")!, commands, [
  { tabs: ["view.edicao", "view.neumas"], label: "Vistas" },
  { group: ["edit.undo", "edit.redo"], view: "edicao" },
  { group: ["neume.moveLeft", "neume.moveDown", "neume.moveUp", "neume.moveRight", "neume.moveReset"], view: "edicao" },
  { group: ["edit.format", "neume.palette", "neume.name"], view: "edicao" },
  { group: ["view.split", "view.legend"], view: "edicao" },
]);
installTooltips(document.querySelector<HTMLElement>("#tooltip-host")!);
const toaster = createToaster(document.querySelector<HTMLElement>("#toast-host")!);

let project = newProject({ family: "stgall", name: "Kyrie" });
const natal = newGroup("Natal");
project = insertNode(project, null, Infinity, natal);
project = insertNode(project, natal.id, Infinity, newChant({ title: "Puer natus", content: "name: Puer natus;\n%%\n(c4) Pu(g)er(h)(::)" }));
project = insertNode(project, natal.id, Infinity, newChant({ title: "Dies sanctificatus (Laon)", content: "name: Dies;\n%%\n(c4) Di(f)es(g)(::)", family: "laon" }));
const oitava = newGroup("Oitava");
project = insertNode(project, natal.id, Infinity, oitava);
project = insertNode(project, oitava.id, 0, newChant({ title: "Factus est", content: "name: Factus est;\n%%\n(c4) Fac(f)tus(g) est(h)(::)" }));
project = setActive(project, flattenChants(project)[0].id);
const treePanel = createTreePanel(document.querySelector<HTMLElement>("#doc-list")!, {
  onSelect: noop, onToggle: noop, onRename: noop, onMoveBy: noop, onMove: noop, onDuplicate: noop,
  onRemove: noop, onSetFamily: noop, onNewChant: noop, onNewGroup: noop, onImport: noop,
});
treePanel.render(project);

const hex = (n: number) => n.toString(16).padStart(2, "0");
async function main(): Promise<void> {
  const text = await fetch("/samples/02-kyrie.gabc").then((r) => r.text());
  const extra: Parameters<typeof createEditor>[2] = [highlightTheme];
  let getTree: () => import("web-tree-sitter").Tree | null = () => null;
  let nabcParser: NabcParser | null = null;
  try {
    const ts = await makeTreeSitterHighlighter(runtimeWasmUrl, grammarWasmUrl);
    extra.push(ts.extension);
    getTree = ts.getTree;
    nabcParser = { parse: ts.parse };
  } catch (e) { console.error("highlighter", e); }
  const comp = new Compartment();
  extra.push(comp.of([]));
  const view = createEditor(document.querySelector<HTMLElement>("#app")!, text, extra);

  const db = await loadNeumeDb();
  const family = "stgall" as const;
  const eff = () => db.all().map((e) => mergeEntry(e, undefined));
  const search = new NeumeSearch(eff(), family);
  const neume = neumeExtensions({
    getTree, search: () => search, lookupByNabc: (n) => db.all().filter((e) => e.nabc === n).map((e) => mergeEntry(e, undefined)),
    activeFamily: () => family, onName: noop,
  });
  view.dispatch({ effects: comp.reconfigure([...neume.extensions, ...gabcAssistExtensions(getTree)]) });

  const preview = document.querySelector<HTMLElement>("#preview")!;
  const r = await new NabcLibEngine().render(text, { widthPx: 560 });
  preview.innerHTML = r.svg;

  // Seleção + autocompletar para ver as superfícies do CM.
  view.dispatch({ selection: { anchor: 40, head: 90 } });
  view.focus();

  // ── Contraste (WCAG) ──────────────────────────────────────────────────────
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): [number, number, number, number] => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    // getImageData devolve cor NÃO pré-multiplicada
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (f: number[], b: number[]) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
  function bgOf(el: Element): number[] {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
    let acc = [255, 255, 255];
    for (const e of chain.reverse()) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) acc = over(c, acc);
    }
    return acc;
  }
  const lum = (c: number[]) => {
    const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const rows: string[] = [];
  let fails = 0;
  function check(name: string, el: Element | null, fg?: string, bgEl?: Element) {
    if (!el) { rows.push(`MISSING  ${name}`); fails++; return; }
    const bg = bgOf(bgEl ?? el);
    const fgc = rgba(fg ?? getComputedStyle(el).color);
    const fgo = over(fgc, bg);
    const r = ratio(fgo, bg);
    const ok = r >= 4.5;
    if (!ok) fails++;
    rows.push(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${name}  fg=#${fgo.map((v) => hex(Math.round(v))).join("")} bg=#${bg.map((v) => hex(Math.round(v))).join("")}`);
  }
  const q = (s: string) => document.querySelector(s);
  // sintético para classes que só existem com interação
  const synth = document.createElement("div");
  synth.className = "neume-tooltip";
  synth.style.cssText = "position:absolute;left:-999px;top:0";
  synth.innerHTML = '<div class="neume-tip-row"><span class="neume-tip-name">Pes</span><span class="neume-tip-fam">St. Gall</span></div>';
  document.body.appendChild(synth);
  const tops = document.querySelectorAll(".sc-menubar__top");
  check("menubar: rótulo (1º)", tops[0]);
  check("menubar: título", q(".sc-menubar__title"));
  const rowsEls = document.querySelectorAll('.notker-row:not(.notker-row--group):not([aria-selected="true"])');
  check("lista: nome (normal)", rowsEls[0]?.querySelector(".notker-row__name") ?? null);
  check("lista: meta (normal)", rowsEls[0]?.querySelector(".notker-row__meta") ?? null);
  const act = document.querySelector('.notker-row[aria-selected="true"]');
  check("lista: nome (ativa)", act?.querySelector(".notker-row__name") ?? null);
  check("lista: meta (ativa)", act?.querySelector(".notker-row__meta") ?? null);
  check("árvore: cabeçalho de grupo", q(".notker-row--group .notker-row__name"));
  if (qs.get("rename")) { treePanel.startRename(flattenChants(project)[1].id); check("árvore: campo de renomear", q(".notker-tree__rename")); }
  check("menubar: — Editado", q(".sc-menubar__state"));
  check("tooltip neuma: nome", synth.querySelector(".neume-tip-name"));
  check(".neume-tip-fam", synth.querySelector(".neume-tip-fam"));
  const toolBtn = q(".sc-toolbar .sc-seg button");
  check("toolbar: ícone", toolBtn);
  check("toolbar: aba de vista (selecionada)", q('.notker-views [aria-selected="true"]'));
  check("toolbar: aba de vista (outra)", q('.notker-views [aria-selected="false"]'));
  // menu aberto (item de menu) — abre 3º menu temporariamente
  tops[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const item = document.querySelector('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]');
  check("menu: item", item);
  const kb = document.querySelector(".sc-menu__kbd:not(:empty)");
  if (kb) check("menu: atalho", kb);
  const pair = (name: string, fg: string, bg: string) => {
    const e = document.createElement("span");
    e.textContent = "x"; e.style.cssText = `position:absolute;left:-999px;color:var(${fg});background:var(${bg})`;
    document.body.appendChild(e); check(name, e); e.remove();
  };
  pair("par: on-rubric / rubric (item de menu hover, linha selecionada, Tocar)", "--on-rubric", "--rubric");
  pair("par: ink-muted / parchment (barra lateral meta)", "--ink-muted", "--parchment");
  pair("par: ink-muted / surface (códigos, gutter)", "--ink-muted", "--surface");
  pair("par: ink / surface-high (menu, tooltip)", "--ink", "--surface-high");
  pair("par: ink-muted / surface-high (kbd do menu)", "--ink-muted", "--surface-high");
  pair("par: rubric / surface (✓, ênfases)", "--rubric", "--surface");
  const disabled = document.querySelector('[role="menu"] [aria-disabled="true"], [role="menu"] [disabled]');
  if (disabled) rows.push(`info disabled item (não exigido): ${getComputedStyle(disabled).color}`);
  tops[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // palette row (sintético)
  const pal = document.createElement("div");
  pal.className = "neume-palette sc-menu"; pal.style.cssText = "position:absolute;left:-999px;top:0";
  pal.innerHTML = '<div class="neume-palette-list"><div class="neume-row"><span class="neume-row-name">Pes</span><span class="neume-row-code">pe</span></div></div>';
  document.body.appendChild(pal);
  check(".neume-row-code", pal.querySelector(".neume-row-code"));
  check(".neume-row-name", pal.querySelector(".neume-row-name"));
  const surf = q("#app .cm-editor") ?? document.body;
  for (const t of ["header-key", "header-val", "note", "alteration", "rhythmic", "nabc", "neume-shape"]) {
    const probeEl = document.createElement("span");
    probeEl.className = "tok-" + t; probeEl.textContent = "x";
    q(".cm-content")?.appendChild(probeEl);
    check(`--tok-${t} sobre editor`, probeEl, undefined, surf);
    probeEl.remove();
  }
  check("editor: texto", q(".cm-line"), undefined, surf);
  check("gutter: número", q(".cm-lineNumbers .cm-gutterElement:nth-child(2)"));
  pal.remove(); synth.remove();
  const menuN = qs.get("menu");
  if (menuN) {
    const tops = document.querySelectorAll<HTMLElement>(".sc-menubar__top");
    tops[Number(menuN) - 1]?.click();
  }
  if (qs.get("palette")) {
    neume.palette.open(view);
    const input = document.querySelector<HTMLInputElement>(".neume-palette input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  }
  if (qs.get("toast") === "error") toaster.show("Salvar falhou. Permissão negada.", { kind: "error" });
  if (qs.get("toast") === "ok") toaster.show("Projeto salvo.");
  if (qs.get("tip")) {
    const b = document.querySelector<HTMLElement>('.sc-toolbar button[data-cmd="neume.palette"]')!;
    b.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
  }
  if (qs.get("ctx")) {
    const row = document.querySelector<HTMLElement>(".notker-row")!;
    const b = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: b.left + 30, clientY: b.top + 10 }));
  }

  if (qs.get("treectx")) {
    const r = document.querySelectorAll<HTMLElement>(".notker-row:not(.notker-row--group)")[1];
    const b = r.getBoundingClientRect();
    r.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: b.left + 30, clientY: b.top + 10 }));
  }
  if (qs.get("drop")) {
    const all = document.querySelectorAll<HTMLElement>(".notker-row");
    const from = all[all.length - 1].getBoundingClientRect();
    const to = all[1].getBoundingClientRect();
    all[all.length - 1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: from.left + 20, clientY: from.top + 5 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: to.left + 20, clientY: to.top + 2 }));
  }
  if (qs.get("cm")) {
    const { setDiagnostics } = await import("@codemirror/lint");
    view.dispatch(setDiagnostics(view.state, [{ from: 5, to: 9, severity: "error", message: "Erro de exemplo: sílaba sem notas." }, { from: 12, to: 16, severity: "warning", message: "Aviso de exemplo." }]));
    const t = document.createElement("div");
    t.className = "cm-tooltip cm-tooltip-lint";
    t.style.cssText = "position:fixed;left:330px;top:300px;z-index:50";
    t.innerHTML = '<ul class="cm-tooltip-lint"></ul><div class="cm-diagnostic cm-diagnostic-error">Erro de exemplo: sílaba sem notas.</div><div class="cm-diagnostic cm-diagnostic-warning">Aviso de exemplo.</div>';
    view.dom.appendChild(t);
    const { startCompletion } = await import("@codemirror/autocomplete");
    const at = view.state.doc.toString().indexOf("E|//") + 2;
    view.dispatch({ selection: { anchor: at } });
    view.focus();
    startCompletion(view);
    await new Promise((r) => setTimeout(r, 400));
    const sheet = view.dom.querySelector(".cm-tooltip-autocomplete li");
    rows.push(`cm: autocomplete ${sheet ? "aberto" : "não abriu"}`);
  }
  // ── Vista Neumas: ?view=neumas [&sel=<id>] [&draft=<cadeia>] [&focus=name] [&q=<busca>] ──
  if (qs.get("view") === "neumas") {
    document.body.dataset.view = "neumas";
    let ov = emptyOverlay();
    ov = addName(ov, "stgall:pe", "podatus");
    const s1 = addSequence(ov, "stgall", "vi!pe", "2026-10-09T10:00:00.000Z");
    ov = addName(s1.overlay, s1.id, "virga e pes");
    const s2 = addSequence(ov, "stgall", "pe!vi!cl!to", "2026-10-09T11:00:00.000Z");
    ov = addName(s2.overlay, s2.id, "subida longa");
    const glyphOf = glyphIndex(db.all());
    const drawer = createNeumeDrawer(glyphOf, createNabcOnlyRenderer(document.querySelector<HTMLElement>("#measure-host")!));
    const nv = createNeumasView(document.querySelector<HTMLElement>("#neumas-view")!, {
      entries: () => buildEffective(db.all(), ov, glyphOf),
      overlay: () => ov,
      commit: async (o) => { ov = o; },
      validate: (n) => validateNabc(nabcParser, n),
      draw: (f, n) => drawer.draw(f, n, 96),
      insert: noop, exit: noop,
      toast: (t, o) => toaster.show(t, o),
      now: () => new Date().toISOString(),
    });
    const draft = qs.get("draft");
    if (draft !== null) nv.open({ family: "stgall", newChain: draft });
    else nv.open({ family: "stgall", select: qs.get("sel") ?? s1.id, focus: qs.get("focus") === "name" ? "name" : "grid" });
    const query = qs.get("q");
    if (query) {
      nv.focusSearch();
      const si = document.querySelector<HTMLInputElement>(".neumas-search")!;
      si.value = query; si.dispatchEvent(new Event("input"));
    }
    await new Promise((r) => setTimeout(r, 800)); // desenho pelo motor (assíncrono)
    check("neumas: nome do cartão", q('.neumas-card:not([aria-selected="true"]) .neumas-card__name:not(.is-mine)'));
    check("neumas: nome meu (rubrica)", q('.neumas-card:not([aria-selected="true"]) .neumas-card__name.is-mine'));
    check("neumas: código do cartão", q('.neumas-card:not([aria-selected="true"]) .neumas-card__code'));
    check("neumas: cartão selecionado", q('.neumas-card[aria-selected="true"] .neumas-card__name'));
    check("neumas: título de seção", q(".neumas-section__title"));
    check("neumas: ficha de filtro", q(".neumas-filter:not(.sc-chip--active)"));
    check("neumas: rótulo da bancada", q(".neumas-label"));
    check("neumas: cadeia nabc", q(".neumas-chain__input"));
    if (q(".neumas-validity:not(:empty)")) check("neumas: validade", q(".neumas-validity:not(:empty)"));
    rows.push(`neumas: cartões=${document.querySelectorAll(".neumas-card").length} desenho=${q(".neumas-figure svg, .neumas-figure .neume-drawing-wrap--code") ? "ok" : "vazio"}`);
  }
  const h = (sel: string) => Math.round((document.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? -1);
  rows.push(`geom: menubar=${h(".sc-menubar")}px toolbar=${h(".sc-toolbar")}px ícone=${Math.round(document.querySelector(".sc-toolbar svg")?.getBoundingClientRect().width ?? -1)}px filled=${document.querySelectorAll(".sc-btn--filled").length} folha=${getComputedStyle(document.querySelector("#preview svg") ?? document.body).backgroundColor}`);
  rows.push(`FALHAS: ${fails}`);
  const dump = document.getElementById("dump")!;
  dump.textContent = rows.join("\n");
  if (qs.get("dump")) { dump.style.cssText = "display:block;position:fixed;inset:40px;z-index:9999;background:#fff;color:#000;font:12px monospace;padding:12px;overflow:auto"; }
  console.log(rows.join("\n"));
  document.title = "PROBE_DONE";
}
main().catch((e) => { document.title = "PROBE_ERROR " + String(e); console.error(e); });
