// src/project/tree-panel.ts
/** Barra lateral "Cantos" como ÁRVORE (spec §4.3 + adendo §11): grupos recolhíveis e
 *  aninhados, cantos em serifa com a família na legenda, ativo em rubric-wash. Árvore
 *  ARIA PLANA (aria-level/posinset/setsize) com foco itinerante. Nenhum botão na linha:
 *  ações por menu de contexto, teclado e rodapé. Toda tecla tratada aqui recebe
 *  preventDefault — o registro da janela ignora eventos já tratados (F2 aqui renomeia,
 *  não abre a paleta; Alt+↑/↓ move o nó, não o neuma). */
import type { Family } from "../neume/types";
import { type NotkerProject, type TreeNode, type VisibleRow, visibleRows, findNode, locate, childrenOf, subtreeHas } from "./tree";
import { computeDrop, type Drop, type DropRow } from "./tree-dnd";
import { icon } from "../ui/pd/icons";
import { openContextMenu, closeContextMenu, type CtxEntry } from "../ui/pd/context-menu";

export interface TreePanelOpts {
  onSelect(id: string): void;
  onToggle(id: string, collapsed: boolean): void;
  onRename(id: string, title: string): void;
  onMoveBy(id: string, delta: -1 | 1): void;
  onMove(id: string, parentId: string | null, index: number): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
  onSetFamily(id: string, f: Family): void;
  onNewChant(parentId: string | null, index: number): void;
  onNewGroup(parentId: string | null, index: number): void;
  onImport(): void;
}
export interface TreePanel {
  render(p: NotkerProject): void;
  startRename(id: string): void;
  focusNode(id: string): void;
}

const FAMILY_LABEL: Record<Family, string> = { stgall: "St. Gall", laon: "Laon" };

export function createTreePanel(host: HTMLElement, opts: TreePanelOpts): TreePanel {
  let project: NotkerProject | null = null;
  let rows: VisibleRow[] = [];
  let els: HTMLElement[] = [];
  let focusKey: string | null = null;
  /** Encerra (sem gravar) o renomear inline aberto, se houver. */
  let cancelRename: (() => void) | null = null;

  const list = document.createElement("div");
  list.className = "notker-sidebar__list notker-tree";
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", "Cantos do projeto");
  host.replaceChildren(list, buildFoot());

  // ── Arrastar e soltar: Pointer Events próprios (a API HTML5 de DnD é instável no
  //    WebKitGTK). Sem preventDefault no pointerdown (o clique e o foco seguem normais). ──
  const indicator = document.createElement("div");
  indicator.className = "notker-tree__drop";
  indicator.hidden = true;
  host.appendChild(indicator);
  let drag: { id: string; x: number; y: number; active: boolean; drop: Drop | null } | null = null;
  let suppressClick = false;

  const rowById = (id: string): HTMLElement | undefined => els.find((el) => el.dataset.id === id);
  const rowOf = (t: EventTarget | null): HTMLElement | null =>
    (t instanceof Element ? t.closest<HTMLElement>(".notker-row") : null);
  const nodeOf = (row: HTMLElement): TreeNode | undefined =>
    (project && row.dataset.id ? findNode(project, row.dataset.id) : undefined);

  /** A linha do nó, ou a do ancestral visível mais próximo (grupo recolhido). */
  function visibleFor(id: string): HTMLElement | undefined {
    let cur: string | null = id;
    while (cur !== null && project) {
      const el = rowById(cur);
      if (el) return el;
      cur = locate(project, cur)?.parentId ?? null;
    }
    return undefined;
  }

  function buildRow(r: VisibleRow, p: NotkerProject): HTMLElement {
    const n = r.node;
    const row = document.createElement("div");
    row.className = n.kind === "group" ? "notker-row notker-row--group" : "notker-row";
    row.setAttribute("role", "treeitem");
    row.dataset.id = n.id;
    row.setAttribute("aria-level", String(r.depth + 1));
    row.setAttribute("aria-setsize", String(r.setSize));
    row.setAttribute("aria-posinset", String(r.index + 1));
    row.style.paddingLeft = `${10 + r.depth * 16}px`;
    row.tabIndex = -1;
    const chev = document.createElement("span");
    chev.className = "notker-tree__chevron";
    chev.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "notker-row__text";
    const name = document.createElement("span");
    name.className = "notker-row__name";
    name.textContent = n.title;
    text.appendChild(name);
    if (n.kind === "group") {
      row.setAttribute("aria-expanded", String(!n.collapsed));
      chev.appendChild(icon(n.collapsed ? "chevron-right" : "chevron-down"));
    } else {
      row.setAttribute("aria-selected", String(n.id === p.activeId));
      const meta = document.createElement("span");
      meta.className = "notker-row__meta";
      meta.textContent = FAMILY_LABEL[n.family ?? p.family];
      text.appendChild(meta);
    }
    row.append(chev, text);
    return row;
  }

  function render(p: NotkerProject): void {
    // Encerra o renomear aberto ANTES de remover o campo: o blur disparado pela remoção
    // não pode chamar onRename no meio do render.
    cancelRename?.();
    project = p;
    // Lê o foco ANTES de fechar o menu: fechar devolve o foco à linha que o abriu.
    const ae = document.activeElement;
    const focusId = ae instanceof HTMLElement && list.contains(ae) ? rowOf(ae)?.dataset.id : undefined;
    closeContextMenu();
    rows = visibleRows(p);
    els = rows.map((r) => buildRow(r, p));
    list.replaceChildren(...els);
    const tab = (focusKey ? visibleFor(focusKey) : undefined) ?? visibleFor(p.activeId) ?? els[0];
    if (tab) tab.tabIndex = 0;
    if (focusId) ((visibleFor(focusId) ?? tab) as HTMLElement | undefined)?.focus();
  }

  function buildFoot(): HTMLElement {
    const foot = document.createElement("div");
    foot.className = "notker-sidebar__foot";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "sc-btn sc-btn--elevated notker-split__main";
    add.append(icon("plus"), document.createTextNode("Novo canto"));
    add.addEventListener("click", () => opts.onNewChant(null, Infinity));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "sc-btn sc-btn--elevated sc-btn--icon notker-split__more";
    more.setAttribute("aria-label", "Mais opções");
    more.dataset.tip = "Mais opções";
    more.appendChild(icon("chevron-up"));
    more.addEventListener("click", () => {
      const r = more.getBoundingClientRect();
      openContextMenu(host, r.left, r.top - 8, [
        { label: "Novo canto", run: () => opts.onNewChant(null, Infinity) },
        { label: "Novo grupo", run: () => opts.onNewGroup(null, Infinity) },
        { label: "Importar .gabc…", run: () => opts.onImport() },
      ], more, { openUp: true });
    });
    foot.append(add, more);
    return foot;
  }

  /** "Aqui": num grupo, último filho dele; num canto, logo depois dele no mesmo pai. */
  function hereOf(n: TreeNode): { parentId: string | null; index: number } {
    if (n.kind === "group") return { parentId: n.id, index: n.children.length };
    const loc = locate(project!, n.id)!;
    return { parentId: loc.parentId, index: loc.index + 1 };
  }

  function openMenu(row: HTMLElement, n: TreeNode, x: number, y: number): void {
    const p = project!;
    const loc = locate(p, n.id)!;
    const siblings = childrenOf(p, loc.parentId)!;
    const here = hereOf(n);
    const items: CtxEntry[] = [
      { label: "Renomear", shortcut: "F2", run: () => startRename(n.id) },
      { label: "Duplicar", shortcut: "Ctrl+D", run: () => opts.onDuplicate(n.id) },
    ];
    if (n.kind === "chant") {
      const fam = n.family ?? p.family;
      items.push("---",
        { label: "Família: St. Gall", checked: fam === "stgall", run: () => opts.onSetFamily(n.id, "stgall") },
        { label: "Família: Laon", checked: fam === "laon", run: () => opts.onSetFamily(n.id, "laon") });
    }
    items.push("---",
      { label: "Novo canto aqui", run: () => opts.onNewChant(here.parentId, here.index) },
      { label: "Novo grupo aqui", run: () => opts.onNewGroup(here.parentId, here.index) });
    const moves: CtxEntry[] = [];
    if (loc.index > 0) moves.push({ label: "Mover para cima", shortcut: "Alt+↑", run: () => opts.onMoveBy(n.id, -1) });
    if (loc.index < siblings.length - 1) moves.push({ label: "Mover para baixo", shortcut: "Alt+↓", run: () => opts.onMoveBy(n.id, 1) });
    if (moves.length) items.push("---", ...moves);
    items.push("---", {
      label: n.kind === "group" ? "Excluir grupo" : "Excluir canto", shortcut: "Del", danger: true,
      run: () => opts.onRemove(n.id),
    });
    openContextMenu(host, x, y, items, row);
  }

  function startRename(id: string): void {
    cancelRename?.();
    const row = rowById(id);
    const n = project ? findNode(project, id) : undefined;
    const name = row?.querySelector<HTMLElement>(".notker-row__name");
    if (!row || !n || !name) return;
    const input = document.createElement("input");
    input.className = "sc-input notker-tree__rename";
    input.value = n.title;
    input.setAttribute("aria-label", n.kind === "group" ? "Nome do grupo" : "Nome do canto");
    name.replaceWith(input);
    let done = false;
    const finish = (commit: boolean): void => {
      if (done) return;
      done = true;
      cancelRename = null;
      const v = input.value.trim();
      const hadFocus = document.activeElement === input;
      input.replaceWith(name);
      if (hadFocus) row.focus();
      if (commit && v && v !== n.title) opts.onRename(id, v);
    };
    cancelRename = () => finish(false);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // o campo é dono das suas teclas (nada vaza para a árvore/janela)
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", (e) => e.stopPropagation());
    input.focus();
    input.select();
  }

  function focusNode(id: string): void { visibleFor(id)?.focus(); }

  function geometry(): DropRow[] {
    return rows.map((r, i) => {
      const b = els[i].getBoundingClientRect();
      const n = r.node;
      return {
        id: n.id, kind: n.kind, parentId: r.parentId, index: r.index, top: b.top, height: b.height,
        expanded: n.kind === "group" && !n.collapsed, childCount: n.kind === "group" ? n.children.length : 0,
      };
    });
  }
  function showDrop(d: Drop | null): void {
    els.forEach((el) => el.classList.remove("is-drop-inside"));
    indicator.hidden = true;
    const row = d ? rowById(d.rowId) : undefined;
    if (!d || !row) return;
    if (d.where === "inside") { row.classList.add("is-drop-inside"); return; }
    const hb = host.getBoundingClientRect();
    const rb = row.getBoundingClientRect();
    const level = Number(row.getAttribute("aria-level")) || 1;
    const depth = d.where === "end" ? 0 : d.parentId === d.rowId ? level : level - 1;
    indicator.style.top = `${(d.where === "before" ? rb.top : rb.bottom) - hb.top - 1}px`;
    indicator.style.left = `${10 + depth * 16}px`;
    indicator.hidden = false;
  }
  function endDrag(commit: boolean): void {
    const d = drag;
    drag = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
    document.removeEventListener("keydown", onDragKey, true);
    document.body.classList.remove("notker-dragging");
    els.forEach((el) => el.classList.remove("is-dragging"));
    showDrop(null);
    if (!d || !d.active) return;
    suppressClick = true; // o click que o navegador manda depois do pointerup
    setTimeout(() => { suppressClick = false; }, 0);
    if (commit && d.drop) opts.onMove(d.id, d.drop.parentId, d.drop.index);
  }
  function onDragMove(e: MouseEvent): void {
    if (!drag || !project) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4) return;
      drag.active = true;
      closeContextMenu();
      document.body.classList.add("notker-dragging");
      rowById(drag.id)?.classList.add("is-dragging");
    }
    const lb = list.getBoundingClientRect();
    if (e.clientY < lb.top + 24) list.scrollTop -= 8;
    else if (e.clientY > lb.bottom - 24) list.scrollTop += 8;
    const node = findNode(project, drag.id);
    drag.drop = node ? computeDrop(geometry(), e.clientY, (pid) => pid !== null && subtreeHas(node, pid)) : null;
    showDrop(drag.drop);
  }
  function onDragUp(): void { endDrag(true); }
  function onDragCancel(): void { endDrag(false); }
  function onDragKey(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    endDrag(false);
  }
  list.addEventListener("pointerdown", (e: MouseEvent) => {
    if (e.button !== 0 || !project || drag || e.target instanceof HTMLInputElement) return;
    const row = rowOf(e.target);
    if (!row?.dataset.id) return;
    drag = { id: row.dataset.id, x: e.clientX, y: e.clientY, active: false, drop: null };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
    document.addEventListener("keydown", onDragKey, true);
  });

  list.addEventListener("focusin", (e) => {
    const row = rowOf(e.target);
    if (!row?.dataset.id) return;
    focusKey = row.dataset.id;
    for (const el of els) el.tabIndex = el === row ? 0 : -1;
  });

  list.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const row = rowOf(e.target);
    const n = row ? nodeOf(row) : undefined;
    if (!n) return;
    if (n.kind === "group") opts.onToggle(n.id, !n.collapsed);
    else opts.onSelect(n.id);
  });

  list.addEventListener("contextmenu", (e) => {
    const row = rowOf(e.target);
    const n = row ? nodeOf(row) : undefined;
    if (!row || !n) return;
    e.preventDefault();
    row.focus();
    // Tecla de menu dispara contextmenu sem coordenadas: abre sob a linha.
    if (e.clientX === 0 && e.clientY === 0) {
      const b = row.getBoundingClientRect();
      openMenu(row, n, b.left + 16, b.bottom);
    } else openMenu(row, n, e.clientX, e.clientY);
  });

  list.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return; // campo de renomear
    const row = rowOf(e.target);
    const i = row ? els.indexOf(row) : -1;
    if (!row || i < 0 || !project) return;
    const r = rows[i];
    const n = r.node;
    const k = e.key;
    let handled = true;
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) opts.onMoveBy(n.id, k === "ArrowUp" ? -1 : 1);
    else if (e.altKey && k.startsWith("Arrow")) { /* Alt+←/→: consumido (é do editor) */ }
    else if (e.ctrlKey || e.metaKey) {
      if (k.toLowerCase() === "d" && !e.shiftKey && !e.altKey) opts.onDuplicate(n.id);
      else handled = false;
    }
    else if (k === "ArrowDown" || k === "ArrowUp") els[Math.max(0, Math.min(els.length - 1, i + (k === "ArrowDown" ? 1 : -1)))].focus();
    else if (k === "Home") els[0].focus();
    else if (k === "End") els[els.length - 1].focus();
    else if (k === "ArrowRight") {
      if (n.kind === "group") {
        if (n.collapsed) opts.onToggle(n.id, false);
        else if (rows[i + 1]?.parentId === n.id) els[i + 1].focus();
      }
    } else if (k === "ArrowLeft") {
      if (n.kind === "group" && !n.collapsed) opts.onToggle(n.id, true);
      else if (r.parentId) rowById(r.parentId)?.focus();
    } else if (k === "Enter" || k === " ") {
      if (e.isComposing) return;
      if (n.kind === "chant") opts.onSelect(n.id); else opts.onToggle(n.id, !n.collapsed);
    } else if (k === "F2") startRename(n.id);
    else if (k === "Delete") opts.onRemove(n.id);
    else if (k === "ContextMenu" || (k === "F10" && e.shiftKey)) {
      const b = row.getBoundingClientRect();
      openMenu(row, n, b.left + 16, b.bottom);
    } else handled = false;
    if (handled) e.preventDefault();
  });

  return { render, startRename, focusNode };
}
