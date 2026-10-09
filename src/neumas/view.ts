// src/neumas/view.ts — a vista "Neumas": compõe Catálogo + Bancada, guarda o estado da
// vista (família, filtro, busca, seleção, rascunho, compor) e traduz intenções em
// operações PURAS sobre o overlay (src/neume/overlay.ts), entregues a `deps.commit`.
// Nunca guarda rascunho do overlay: lê sempre `deps.overlay()` (sem dados velhos).
import type { EffectiveEntry, Family, Overlay } from "../neume/types";
import type { NabcValidity } from "../neume/validate-nabc";
import {
  addNameToEntries, addName, removeName, promoteName, setNote, setHidden,
  addSequence, removeSequence, restoreSequence, changeSequenceNabc, normalizeNabc,
} from "../neume/overlay";
import { findChain } from "../neume/effective";
import { catalogSections, type CatalogFilter } from "./catalog-model";
import { createCatalog } from "./catalog";
import { createBench, type BenchItem, type BenchStatus, type DrawFn } from "./bench";

export interface NeumasDeps {
  /** Entradas efetivas atuais (catálogo + sequências, inclusive ocultas). */
  entries(): EffectiveEntry[];
  overlay(): Overlay;
  /** Adota o overlay (memória + índices na hora) e agenda a gravação; resolve quando o disco confirma. */
  commit(next: Overlay): Promise<void>;
  validate(nabc: string): NabcValidity;
  draw: DrawFn;
  /** Insere a cadeia no editor (no cursor) e volta à Edição. */
  insert(nabc: string): void;
  /** Volta à Edição (Esc fora de campo). */
  exit(): void;
  toast(text: string, opts?: { kind?: "ok" | "warn" | "error"; action?: { label: string; run: () => void } }): void;
  /** ISO de agora (injetável nos testes). */
  now(): string;
}
export interface OpenOpts { family?: Family; select?: string; newChain?: string; focus?: "name" | "grid" }
export interface NeumasView {
  open(o?: OpenOpts): void;
  /** O overlay mudou por fora (importar, hover, paleta): redesenha. */
  refresh(): void;
  focusSearch(): void;
  family(): Family;
}

const isField = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function createNeumasView(host: HTMLElement, deps: NeumasDeps): NeumasView {
  host.replaceChildren();
  let family: Family = "stgall";
  let filter: CatalogFilter = "todos";
  let query = "";
  let selectedId: string | null = null;
  /** Rascunho de sequência nova (não gravada). */
  let draft: { nabc: string } | null = null;
  /** Texto do campo nabc ao editar uma sequência do usuário (null = igual à gravada). */
  let editChain: string | null = null;
  let composing = false;
  let saveState: BenchStatus["saveState"] = "";

  const catalog = createCatalog(host, {
    onQuery: (q) => { query = q; render(); },
    onFamily: (f) => { if (f !== family) { family = f; selectedId = null; draft = null; composing = false; editChain = null; render(); } },
    onFilter: (f) => { filter = f; render(); },
    onSelect: (id) => select(id),
    onActivate: (id) => { if (composing && (draft || selectedIsUserSeq())) appendToChain(id); else select(id); },
    onNewSequence: () => newSequence(""),
    onSearchEscape: () => { if (!catalog.focusGrid()) bench.focusName(); },
  });
  const bench = createBench(host, {
    onChainInput: (n) => { if (draft) draft.nabc = n; else editChain = n; renderBench(); },
    onChainCommit: (n, how) => commitChain(n, how),
    onAddName: (n) => void addUserName(n),
    onRemoveName: (n) => { if (selectedId) save(removeName(deps.overlay(), selectedId, n)); },
    onPromoteName: (n) => { if (selectedId) save(promoteName(deps.overlay(), selectedId, n)); },
    onNote: (n) => { if (selectedId) save(setNote(deps.overlay(), selectedId, n)); },
    onInsert: () => insertCurrent(),
    onToggleHidden: () => {
      const e = selectedEntry();
      if (e) save(setHidden(deps.overlay(), e.id, !e.hidden));
    },
    onDelete: () => deleteSelected(),
    onCreateFrom: () => { const e = selectedEntry(); if (e) newSequence(e.nabc); },
    onGoTo: (id) => { draft = null; editChain = null; composing = false; select(id); },
    onToggleCompose: () => { composing = !composing; render(); },
    onFieldEscape: () => { if (!catalog.focusGrid()) catalog.focusSearch(); },
  }, deps.draw);

  // ── estado derivado ──
  const entryById = (id: string | null): EffectiveEntry | undefined =>
    (id ? deps.entries().find((e) => e.id === id) : undefined);
  const selectedEntry = (): EffectiveEntry | undefined => entryById(selectedId);
  const selectedIsUserSeq = (): boolean => !!selectedEntry()?.userSequence;
  const currentChain = (): string => {
    if (draft) return draft.nabc;
    const e = selectedEntry();
    if (!e) return "";
    return e.userSequence && editChain !== null ? editChain : e.nabc;
  };
  function chainStatus(): Pick<BenchStatus, "validity" | "duplicate"> {
    const e = selectedEntry();
    const editing = !!draft || !!e?.userSequence;
    const chain = currentChain();
    if (!editing) return { validity: "valid", duplicate: null };
    const validity = deps.validate(chain);
    const hit = validity === "invalid" || validity === "empty" ? undefined : findChain(deps.entries(), family, chain);
    const duplicate = hit && hit.id !== selectedId ? { id: hit.id, label: hit.displayNames[0] ?? hit.nabc } : null;
    return { validity, duplicate };
  }

  /** Redesenha tudo (grade + bancada). A grade tem centenas de cartões: digitar na
   *  cadeia só redesenha a bancada, e setas só remarcam a seleção. */
  function render(): void {
    const all = deps.entries();
    if (selectedId && !all.some((e) => e.id === selectedId)) { selectedId = null; editChain = null; }
    const sections = catalogSections(all, family, filter, query, { pin: selectedId });
    catalog.render(sections, { family, filter, query, selectedId, composing });
    renderBench();
  }
  function renderBench(): void {
    const e = selectedEntry();
    const item: BenchItem | null = draft ? { kind: "draft", family } : e ? { kind: "entry", entry: e } : null;
    bench.render(item, { chain: currentChain(), ...chainStatus(), composing, saveState });
  }

  // ── gravação ──
  function save(next: Overlay): Promise<void> {
    if (next === deps.overlay()) return Promise.resolve();
    saveState = "salvando…";
    const p = deps.commit(next);
    render();
    return p.then(
      () => { saveState = "salvo ✓"; render(); },
      () => { saveState = "erro ao salvar"; render(); }, // o toast de erro vem de quem grava
    );
  }

  // ── ações ──
  function select(id: string): void {
    const wasComposing = composing || !!draft;
    draft = null; editChain = null; composing = false;
    selectedId = id;
    const e = entryById(id);
    if (e && e.family !== family) { family = e.family; render(); return; }
    if (!wasComposing && catalog.markSelected(id)) renderBench(); else render();
  }
  function newSequence(prefill: string): void {
    selectedId = null; editChain = null;
    draft = { nabc: normalizeNabc(prefill) };
    composing = prefill === "";
    render();
    bench.focusChain();
  }
  function appendToChain(id: string): void {
    const add = entryById(id)?.nabc;
    if (!add) return;
    const cur = currentChain();
    const next = cur ? `${cur}!${add}` : add;
    if (draft) { draft.nabc = next; render(); return; }
    editChain = next;
    commitChain(next, "enter");
  }
  /** Cria a sequência do rascunho (se válida e nova). Devolve o id, ou null. */
  function createFromDraft(): Promise<string | null> {
    if (!draft) return Promise.resolve(null);
    const st = chainStatus();
    if (st.validity === "empty") { deps.toast("Digite a cadeia nabc da sequência.", { kind: "warn" }); return Promise.resolve(null); }
    if (st.validity === "invalid") { deps.toast("Cadeia nabc inválida — corrija antes de salvar.", { kind: "warn" }); return Promise.resolve(null); }
    if (st.duplicate) { deps.toast(`Já existe: ${st.duplicate.label}.`, { kind: "warn" }); return Promise.resolve(null); }
    const r = addSequence(deps.overlay(), family, draft.nabc, deps.now());
    draft = null; composing = false; selectedId = r.id;
    return save(r.overlay).then(() => r.id);
  }
  function commitChain(raw: string, how: "enter" | "blur"): void {
    if (draft) {
      draft.nabc = raw;
      if (how === "enter") void createFromDraft().then((id) => { if (id) bench.focusName(); });
      return;
    }
    const e = selectedEntry();
    if (!e?.userSequence) return;
    editChain = raw;
    const n = normalizeNabc(raw);
    if (n === e.nabc) { editChain = null; render(); return; }
    const st = chainStatus();
    if (st.validity !== "valid" && st.validity !== "unknown") { render(); return; }
    if (st.duplicate) { render(); return; }
    const r = changeSequenceNabc(deps.overlay(), e.id, n);
    if (r.collision) { render(); return; }
    selectedId = r.id;
    editChain = null;
    void save(r.overlay);
  }
  async function addUserName(name: string): Promise<void> {
    if (draft) {
      const st = chainStatus();
      if (st.duplicate && (st.validity === "valid" || st.validity === "unknown")) {
        // Os nomes vão para o item que já existe; nunca duas sequências com a mesma cadeia.
        const target = entryById(st.duplicate.id)!;
        draft = null; composing = false;
        selectedId = target.id;
        const r = addNameToEntries(deps.overlay(), [{ id: target.id, displayNames: target.displayNames }], name);
        if (!r.changed) { render(); deps.toast("Esse nome já existe.", { kind: "warn" }); return; }
        await save(r.overlay);
        deps.toast(`Nome “${name}” adicionado a “${st.duplicate.label}”, que já existia.`);
        catalog.focusGrid();
        return;
      }
      const id = await createFromDraft();
      if (!id) return;
      await save(addName(deps.overlay(), id, name));
      catalog.focusGrid();
      return;
    }
    const e = selectedEntry();
    if (!e) return;
    const r = addNameToEntries(deps.overlay(), [{ id: e.id, displayNames: e.displayNames }], name);
    if (!r.changed) { deps.toast("Esse nome já existe.", { kind: "warn" }); return; }
    void save(r.overlay);
    catalog.focusGrid();
  }
  function insertCurrent(): void {
    const chain = normalizeNabc(currentChain());
    if (!chain) return;
    if (draft || selectedIsUserSeq()) {
      const v = deps.validate(chain);
      if (v === "invalid") { deps.toast("Cadeia nabc inválida — corrija antes de inserir.", { kind: "warn" }); return; }
    }
    deps.insert(chain);
  }
  function deleteSelected(): void {
    const e = selectedEntry();
    if (!e?.userSequence) return;
    const cards = [...host.querySelectorAll<HTMLElement>(".neumas-card")].map((c) => c.dataset.id!);
    const i = cards.indexOf(e.id);
    const r = removeSequence(deps.overlay(), e.id);
    if (!r.removed) return;
    const removed = r.removed;
    selectedId = cards[i + 1] ?? cards[i - 1] ?? null;
    if (selectedId === e.id) selectedId = null;
    void save(r.overlay);
    catalog.focusGrid();
    deps.toast("Sequência excluída.", {
      action: { label: "Desfazer", run: () => { selectedId = e.id; void save(restoreSequence(deps.overlay(), e.id, removed)); } },
    });
  }

  // ── teclado da vista (fora de campos) ──
  host.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (composing) { composing = false; render(); return; }
      deps.exit();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "n") { e.preventDefault(); if (!bench.focusName()) catalog.focusSearch(); }
    else if (k === "s") { e.preventDefault(); newSequence(""); }
    else if (k === "/") { e.preventDefault(); catalog.focusSearch(); }
    else if (k === "i") { e.preventDefault(); insertCurrent(); }
  });

  render();

  return {
    open(o = {}) {
      if (o.family) family = o.family;
      if (o.newChain !== undefined) {
        query = ""; filter = "todos";
        newSequence(o.newChain);
        composing = false;
        render();
      } else if (o.select) {
        const e = entryById(o.select);
        if (e) {
          // o item precisa aparecer: limpa busca/filtro que o escondessem
          query = ""; filter = "todos";
          select(o.select);
        } else render();
      } else render();
      if (o.focus === "name") { if (!bench.focusName()) catalog.focusGrid(); }
      else if (o.newChain === undefined && !catalog.focusGrid()) catalog.focusSearch();
    },
    refresh: () => render(),
    focusSearch: () => catalog.focusSearch(),
    family: () => family,
  };
}
