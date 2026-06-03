// src/overlay-ui/panel.ts
// "Scriptorium dos nomes" — registro lateral onde o usuário-escriba glosa cada
// neuma com sua própria nomenclatura. Estética herdada de tokens.css (creme/tinta/
// rubricação): o nome de referência fica em tinta; as glosas do usuário são
// RUBRICAS (vermelhas), como as anotações escribais. Edição inline real: adicionar,
// remover, promover a padrão, ocultar — sobre um rascunho clonado do overlay atual,
// persistido por substituição no Salvar (não-destrutivo via Importar/merge à parte).
import type { EffectiveEntry, Overlay, OverlayEntry } from "../neume/types";
import { glyphSvgEl } from "../neume/render";
import { promoteToDefault } from "./conflict";
import { removeName, cloneOverlay } from "../neume/overlay";
import { NeumeSearch } from "../neume/search";

/** Sem filtro, limita as linhas renderizadas (1189 entradas): peça uma busca. */
const RENDER_CAP = 150;

export interface OverlayPanelOpts {
  entries: () => EffectiveEntry[];
  onSave: (o: Overlay) => void;
  /** Overlay atual do usuário, para editar/remover (rascunho parte dele). */
  initial?: () => Overlay;
  onClose?: () => void;
  /** Exporta o RASCUNHO atual (o que está na tela), não o overlay salvo — assim
   *  "Exportar" reflete o que o usuário vê, mesmo sem ter clicado Salvar antes. */
  onExport?: (draft: Overlay) => void;
  onImport?: () => void;
}
export interface OverlayPanel {
  open(): void; close(): void;
  /** Re-lê o overlay atual (via `initial`) para o rascunho e re-renderiza.
   *  Usado após importar, para a lista refletir os nomes recém-carregados. */
  refresh(): void;
  addName(id: string, name: string): void;
  setHidden(id: string, hidden: boolean): void;
  promote(id: string, name: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createOverlayPanel(host: HTMLElement, opts: OverlayPanelOpts): OverlayPanel {
  let draft: Overlay = opts.initial
    ? cloneOverlay(opts.initial())
    : { schema: 1, kind: "notker-neume-overlay", entries: {} };
  let filterQuery = "";
  let editingId: string | null = null;
  let dirty = false;

  const ensure = (id: string): OverlayEntry => (draft.entries[id] ??= {});
  const userNames = (id: string): string[] => draft.entries[id]?.names ?? [];
  const isHidden = (id: string): boolean => draft.entries[id]?.hidden ?? false;

  function filtered(): EffectiveEntry[] {
    const all = opts.entries();
    if (!filterQuery.trim()) return all;
    return new NeumeSearch(all).query(filterQuery);
  }

  function addNameTo(id: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    const e = ensure(id);
    e.names = Array.from(new Set([...(e.names ?? []), n]));
    dirty = true;
    editingId = null;
    render();
  }
  function removeNameFrom(id: string, name: string): void {
    draft = removeName(draft, id, name);
    dirty = true;
    render();
  }
  function setHiddenTo(id: string, hidden: boolean): void {
    ensure(id).hidden = hidden;
    dirty = true;
    render();
  }
  function promoteName(id: string, name: string): void {
    draft = promoteToDefault(draft, id, name);
    dirty = true;
    render();
  }

  // ── construção de uma linha ──────────────────────────────────────────────
  function rowEl(e: EffectiveEntry): HTMLElement {
    const row = el("div", "overlay-row");
    if (isHidden(e.id)) row.classList.add("overlay-row-hidden");

    const fig = el("div", "overlay-fig");
    fig.appendChild(glyphSvgEl(e.svg, 30));
    row.appendChild(fig);

    const main = el("div", "overlay-row-main");

    // Nome de referência (tinta) + obelo de proveniência.
    const nameLine = el("div", "overlay-nameline");
    const name = el("span", "overlay-name", e.name);
    if (e.provenance?.length) {
      name.title = e.provenance[0].source;
      const dagger = el("span", "overlay-prov", "†");
      dagger.title = `${e.provenance[0].source} · ${e.provenance[0].via}`;
      name.appendChild(dagger);
    }
    nameLine.appendChild(name);
    if (e.synthetic) nameLine.appendChild(el("span", "overlay-synthetic-badge", "seq"));
    main.appendChild(nameLine);

    // Glosas do usuário (rubricas) — removíveis, promovíveis.
    const names = userNames(e.id);
    if (names.length) {
      const glosses = el("div", "overlay-glosses");
      names.forEach((nm, i) => {
        const chip = el("span", "overlay-gloss");
        if (i === 0) chip.classList.add("overlay-gloss-default");
        chip.appendChild(el("span", "overlay-gloss-text", nm));
        if (i > 0) {
          const star = el("button", "overlay-promote", "★");
          star.title = "Tornar o nome padrão";
          star.addEventListener("click", () => promoteName(e.id, nm));
          chip.appendChild(star);
        }
        const x = el("button", "overlay-gloss-remove", "×");
        x.title = "Remover este nome";
        x.addEventListener("click", () => removeNameFrom(e.id, nm));
        chip.appendChild(x);
        glosses.appendChild(chip);
      });
      main.appendChild(glosses);
    }

    // Editor inline (revelado pelo ✚).
    if (editingId === e.id) {
      const wrap = el("div", "overlay-add-wrap");
      const input = el("input", "overlay-add");
      input.type = "text";
      input.placeholder = "sugerir nomenclatura…";
      const commit = () => addNameTo(e.id, input.value);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); }
        else if (ev.key === "Escape") { editingId = null; render(); }
      });
      const add = el("button", "overlay-add-btn", "Adicionar");
      add.addEventListener("click", commit);
      wrap.appendChild(input);
      wrap.appendChild(add);
      main.appendChild(wrap);
      queueMicrotask(() => input.focus());
    }
    row.appendChild(main);

    // Coluna de ações.
    const side = el("div", "overlay-row-side");
    const addToggle = el("button", "overlay-add-toggle", editingId === e.id ? "✕" : "✚");
    addToggle.title = editingId === e.id ? "Cancelar" : "Adicionar nome";
    addToggle.addEventListener("click", () => {
      editingId = editingId === e.id ? null : e.id;
      render();
    });
    side.appendChild(addToggle);
    const hide = el("button", "overlay-hide", isHidden(e.id) ? "◎" : "◉");
    hide.title = isHidden(e.id) ? "Mostrar na busca" : "Ocultar da busca";
    hide.addEventListener("click", () => setHiddenTo(e.id, !isHidden(e.id)));
    side.appendChild(hide);
    row.appendChild(side);

    return row;
  }

  function render(): void {
    const searchHadFocus =
      host.querySelector(".overlay-search") === document.activeElement;
    host.innerHTML = "";

    const root = el("div", "overlay-panel");

    // Cabeçalho.
    const header = el("div", "overlay-header");
    const titleWrap = el("div", "overlay-titlewrap");
    titleWrap.appendChild(el("span", "overlay-title", "Nomes de neumas"));
    titleWrap.appendChild(el("span", "overlay-sub", "scriptorium · glosas do escriba"));
    header.appendChild(titleWrap);
    if (opts.onClose) {
      const close = el("button", "overlay-close", "×");
      close.title = "Fechar";
      close.addEventListener("click", () => opts.onClose!());
      header.appendChild(close);
    }
    root.appendChild(header);

    // Busca.
    const search = el("input", "overlay-search");
    search.type = "text";
    search.placeholder = "Filtrar por nome ou código…";
    search.value = filterQuery;
    search.addEventListener("input", (ev) => {
      filterQuery = (ev.target as HTMLInputElement).value;
      editingId = null;
      render();
    });
    root.appendChild(search);

    // Ações de coleção (importar/exportar).
    if (opts.onImport || opts.onExport) {
      const actions = el("div", "overlay-actions");
      if (opts.onImport) {
        const b = el("button", "overlay-import", "Importar");
        b.addEventListener("click", () => opts.onImport!());
        actions.appendChild(b);
      }
      if (opts.onExport) {
        const b = el("button", "overlay-export", "Exportar");
        b.addEventListener("click", () => opts.onExport!(draft));
        actions.appendChild(b);
      }
      root.appendChild(actions);
    }

    // Lista.
    const list = el("div", "overlay-list");
    const rows = filtered();
    if (rows.length === 0) {
      list.appendChild(el("div", "overlay-empty", "Nenhum neuma encontrado."));
    } else {
      for (const e of rows.slice(0, RENDER_CAP)) list.appendChild(rowEl(e));
      if (rows.length > RENDER_CAP) {
        list.appendChild(
          el("div", "overlay-more", `mostrando ${RENDER_CAP} de ${rows.length} — refine a busca`),
        );
      }
    }
    root.appendChild(list);

    // Rodapé.
    const foot = el("div", "overlay-foot");
    const count = el("span", "overlay-count", `${rows.length} neuma${rows.length === 1 ? "" : "s"}`);
    foot.appendChild(count);
    const save = el("button", "overlay-save", dirty ? "Salvar •" : "Salvar");
    save.addEventListener("click", () => { opts.onSave(draft); dirty = false; render(); });
    foot.appendChild(save);
    root.appendChild(foot);

    host.appendChild(root);

    if (searchHadFocus) {
      const si = host.querySelector<HTMLInputElement>(".overlay-search");
      if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    }
  }

  return {
    open: () => render(),
    close: () => { host.innerHTML = ""; },
    refresh: () => {
      // Após importar, o overlay mudou em disco/memória: re-clona o rascunho.
      if (opts.initial) draft = cloneOverlay(opts.initial());
      render();
    },
    addName: (id, name) => addNameTo(id, name),
    setHidden: (id, hidden) => setHiddenTo(id, hidden),
    promote: (id, name) => promoteName(id, name),
  };
}
