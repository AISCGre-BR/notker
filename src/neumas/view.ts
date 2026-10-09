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
import { catalogSections, SECTION_CAP, type CatalogFilter, type SectionId } from "./catalog-model";
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
  /** Saída da vista: grava o que estiver pendente (nota em debounce) e descarta o rascunho. Chamar antes de trocar de vista. */
  flush(): void;
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
  /** Teto de cartões por seção; ausente = SECTION_CAP. Volta ao padrão ao mudar família, filtro ou busca. */
  let caps: Partial<Record<SectionId, number>> = {};
  let saveState: BenchStatus["saveState"] = "";
  /** A vista está na tela (open → exit/flush). Só então o foco perdido é devolvido. */
  let opened = false;

  const catalog = createCatalog(host, {
    onQuery: (q) => { query = q; caps = {}; render(); },
    onFamily: (f) => { if (f !== family) { resetForFamily(f); render(); } },
    onFilter: (f) => { filter = f; caps = {}; render(); },
    onSelect: (id) => select(id),
    onActivate: (id) => { if (composing && (draft || selectedIsUserSeq())) appendToChain(id); else select(id); },
    onNewSequence: () => newSequence(""),
    onMore: (id, all) => { caps[id] = all ? Infinity : (caps[id] ?? SECTION_CAP) + SECTION_CAP; render(); },
    onSearchEscape: () => { if (!catalog.focusGrid()) bench.focusName(); },
  });
  const bench = createBench(host, {
    onChainInput: (n) => { if (draft) draft.nabc = n; else editChain = n; renderBench(); },
    onChainCommit: (n, how) => commitChain(n, how),
    onAddName: (n) => addUserName(n),
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
    onSaveDraft: () => { bench.flushNote(); void createFromDraft().then((id) => { if (id) bench.focusName(); }); },
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

  /** Descarta o rascunho; avisa se havia cadeia digitada (sem Desfazer). */
  function discardDraft(): void {
    if (draft && normalizeNabc(draft.nabc)) deps.toast("Rascunho descartado.", { kind: "warn" });
    draft = null; editChain = null; composing = false;
  }
  /** Troca de família: nota gravada, seleção e rascunho não atravessam. */
  function resetForFamily(f: Family): void {
    bench.flushNote();
    discardDraft();
    family = f; selectedId = null; caps = {};
  }
  /** Foco perdido (item removido do DOM → body): volta ao cartão lógico, para que as
   *  teclas N/S/I/Esc da vista continuem valendo. */
  function restoreFocus(): void {
    if (!opened) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return;
    if (!catalog.focusGrid()) catalog.focusSearch();
  }
  const cardIds = (): string[] => [...host.querySelectorAll<HTMLElement>(".neumas-card")].map((c) => c.dataset.id!);

  /** Redesenha tudo (grade + bancada). A grade tem centenas de cartões: digitar na
   *  cadeia só redesenha a bancada, e setas só remarcam a seleção. */
  function render(): void {
    const all = deps.entries();
    if (selectedId && !all.some((e) => e.id === selectedId)) { selectedId = null; editChain = null; }
    const sections = catalogSections(all, family, filter, query, { pin: selectedId, caps });
    catalog.render(sections, { family, filter, query, selectedId, composing });
    renderBench();
    restoreFocus();
  }
  function renderBench(): void {
    const e = selectedEntry();
    const item: BenchItem | null = draft ? { kind: "draft", family } : e ? { kind: "entry", entry: e } : null;
    bench.render(item, { chain: currentChain(), ...chainStatus(), composing, saveState });
    restoreFocus();
  }

  // ── gravação ──
  function save(next: Overlay): Promise<void> {
    if (next === deps.overlay()) return Promise.resolve();
    saveState = "salvando…";
    const p = deps.commit(next);
    render();
    return p.then(
      // Só o estado de gravação mudou: refaz a bancada, não a grade (centenas de cartões).
      () => { saveState = "salvo ✓"; renderBench(); },
      () => { saveState = "erro ao salvar"; renderBench(); }, // o toast de erro vem de quem grava
    );
  }

  // ── ações ──
  function select(id: string): void {
    bench.flushNote();
    const wasComposing = composing || !!draft;
    discardDraft();
    selectedId = id;
    const e = entryById(id);
    if (e && e.family !== family) { family = e.family; render(); catalog.reveal(id); return; }
    if (!wasComposing && catalog.markSelected(id)) renderBench(); else render();
    catalog.reveal(id);
  }
  function newSequence(prefill: string): void {
    bench.flushNote();
    discardDraft();
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
    bench.flushNote();
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
    bench.flushNote();
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
  async function addUserName(name: string): Promise<boolean> {
    bench.flushNote();
    if (draft) {
      const st = chainStatus();
      if (st.duplicate && (st.validity === "valid" || st.validity === "unknown")) {
        // Os nomes vão para o item que já existe; nunca duas sequências com a mesma cadeia.
        const target = entryById(st.duplicate.id)!;
        draft = null; composing = false;
        selectedId = target.id;
        const r = addNameToEntries(deps.overlay(), [{ id: target.id, displayNames: target.displayNames }], name);
        if (!r.changed) { render(); deps.toast("Esse nome já existe.", { kind: "warn" }); return false; }
        await save(r.overlay);
        deps.toast(`Nome “${name}” adicionado a “${st.duplicate.label}”, que já existia.`);
        catalog.focusGrid();
        return true;
      }
      const id = await createFromDraft();
      if (!id) return false; // não criou (cadeia vazia/inválida/repetida): o nome digitado fica
      await save(addName(deps.overlay(), id, name));
      catalog.focusGrid();
      return true;
    }
    const e = selectedEntry();
    if (!e) return false;
    const r = addNameToEntries(deps.overlay(), [{ id: e.id, displayNames: e.displayNames }], name);
    if (!r.changed) { deps.toast("Esse nome já existe.", { kind: "warn" }); return false; }
    const before = cardIds();
    void save(r.overlay);
    // Filtro "Sem nome": o item sai da grade ao ser nomeado; o foco vai ao vizinho.
    if (!cardIds().includes(e.id)) {
      const i = before.indexOf(e.id);
      const nid = before[i + 1] ?? before[i - 1];
      if (nid && nid !== e.id) select(nid);
    }
    catalog.focusGrid();
    return true;
  }
  function insertCurrent(): void {
    const chain = normalizeNabc(currentChain());
    if (!chain) return;
    if (draft || selectedIsUserSeq()) {
      const v = deps.validate(chain);
      if (v === "invalid") { deps.toast("Cadeia nabc inválida — corrija antes de inserir.", { kind: "warn" }); return; }
    }
    bench.flushNote();
    draft = null; editChain = null; composing = false; // inserida: o rascunho cumpriu o papel
    deps.insert(chain);
  }
  function deleteSelected(): void {
    bench.flushNote();
    const e = selectedEntry();
    if (!e?.userSequence) return;
    const cards = cardIds();
    const i = cards.indexOf(e.id);
    const r = removeSequence(deps.overlay(), e.id);
    if (!r.removed) return;
    const removed = r.removed;
    selectedId = cards[i + 1] ?? cards[i - 1] ?? null;
    if (selectedId === e.id) selectedId = null;
    void save(r.overlay);
    catalog.focusGrid();
    deps.toast("Sequência excluída.", {
      action: {
        label: "Desfazer",
        run: () => {
          discardDraft();
          selectedId = e.id;
          void save(restoreSequence(deps.overlay(), e.id, removed));
          if (opened) catalog.focusGrid();
        },
      },
    });
  }

  /** Saída da vista: grava a nota, descarta o rascunho (avisando) e para de devolver foco. */
  function leave(): void {
    bench.flushNote();
    discardDraft();
    opened = false;
  }
  // Clique em área vazia da vista: o foco iria ao body e as teclas da vista parariam.
  host.addEventListener("click", () => { restoreFocus(); });

  // ── teclado da vista (fora de campos) ──
  host.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (composing) { composing = false; render(); return; }
      leave();
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
      opened = true;
      if (o.family && o.family !== family) resetForFamily(o.family);
      if (o.newChain !== undefined) {
        query = ""; filter = "todos"; caps = {};
        newSequence(o.newChain);
        composing = false;
        render();
      } else if (o.select) {
        const e = entryById(o.select);
        if (e) {
          // o item precisa aparecer: limpa busca/filtro que o escondessem
          query = ""; filter = "todos"; caps = {};
          select(o.select);
        } else render();
      } else render();
      if (o.focus === "name") { if (!bench.focusName()) catalog.focusGrid(); }
      else if (o.newChain === undefined && !catalog.focusGrid()) catalog.focusSearch();
    },
    refresh: () => render(),
    focusSearch: () => catalog.focusSearch(),
    family: () => family,
    flush: () => leave(),
  };
}
