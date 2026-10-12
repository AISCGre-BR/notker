// src/neumas/catalog.ts — cartão "Catálogo" da vista Neumas: busca, família (segmentado),
// filtros em fichas e a grade de cartões em seções. Só DOM + eventos: o estado vem de fora
// (render) e as intenções saem por callbacks. Textos do usuário sempre por textContent.
import { t, tn } from "../i18n";
import type { EffectiveEntry, Family } from "../neume/types";
import { neumeThumb } from "../neume/render";
import { FILTERS, verticalNeighbor, type CatalogFilter, type CatalogSection, type SectionId } from "./catalog-model";

export interface CatalogCallbacks {
  onQuery(q: string): void;
  onFamily(f: Family): void;
  onFilter(f: CatalogFilter): void;
  /** Setas/Home/End: muda a seleção. */
  onSelect(id: string): void;
  /** Clique ou Enter num cartão (selecionar, ou acrescentar à cadeia ao compor). */
  onActivate(id: string): void;
  onNewSequence(): void;
  /** "Mostrar mais" (150 a mais) ou t("catalog.all") (`all`) numa seção cortada. */
  onMore(section: SectionId, all: boolean): void;
  /** Esc no campo de busca: devolve o foco à grade. */
  onSearchEscape(): void;
}
export interface CatalogState {
  family: Family; filter: CatalogFilter; query: string; selectedId: string | null; composing: boolean;
  /** Após ampliar uma seção: foca (sem rolar) o cartão de índice `index` dela. */
  focusAfter?: { section: SectionId; index: number } | null;
}
export interface Catalog {
  render(sections: CatalogSection[], st: CatalogState): void;
  focusSearch(): void;
  /** Recria só o cartão desse item, no lugar (foco e seleção preservados); false se não está na grade. */
  updateCard(e: EffectiveEntry): boolean;
  /** Foca o cartão selecionado (ou o primeiro). Devolve false se a grade está vazia. */
  focusGrid(): boolean;
  /** Só remarca a seleção (sem refazer a grade). false se o cartão não está na grade. */
  markSelected(id: string): boolean;
  /** Rola o cartão para a área visível, sem pular (nearest). */
  reveal(id: string): void;
}

const FAMILIES: { id: Family; label: string }[] = [{ id: "stgall", label: "St. Gall" }, { id: "laon", label: "Laon" }];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createCatalog(host: HTMLElement, cb: CatalogCallbacks): Catalog {
  const card = el("section", "sc-panel neumas-catalog");
  card.setAttribute("aria-label", t("catalog.label"));

  const head = el("div", "neumas-catalog__head");
  const search = el("input", "sc-input neumas-search");
  search.type = "search";
  search.placeholder = t("catalog.search.placeholder");
  search.setAttribute("aria-label", t("palette.placeholder"));
  search.addEventListener("input", () => cb.onQuery(search.value));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cb.onSearchEscape(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); cb.onSearchEscape(); }
    // demais teclas seguem: a vista ignora teclas vindas de campos e o registro só
    // aceita atalhos com Ctrl dentro deles (Ctrl+1 volta à Edição mesmo daqui).
  });
  const fam = el("div", "sc-seg neumas-family");
  fam.setAttribute("role", "group");
  fam.setAttribute("aria-label", t("common.family"));
  const famButtons = FAMILIES.map((f) => {
    const b = el("button", undefined, f.label);
    b.type = "button";
    b.dataset.family = f.id;
    b.addEventListener("click", () => cb.onFamily(f.id));
    fam.appendChild(b);
    return b;
  });
  head.append(search, fam);

  const filters = el("div", "neumas-filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", t("catalog.filter"));
  filters.appendChild(el("span", "neumas-filters__label", t("catalog.filter.label")));
  const filterButtons = FILTERS.map((f) => {
    const b = el("button", "sc-chip neumas-filter", t(f.labelKey));
    b.type = "button";
    b.dataset.filter = f.id;
    b.addEventListener("click", () => cb.onFilter(f.id));
    filters.appendChild(b);
    return b;
  });

  const list = el("div", "neumas-list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", t("landmark.neumes"));
  card.append(head, filters, list);
  host.appendChild(card);

  const cards = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>(".neumas-card")];
  const focusCard = (c: HTMLElement | undefined): void => {
    if (!c) return;
    for (const x of cards()) x.tabIndex = x === c ? 0 : -1;
    c.focus();
  };

  list.addEventListener("keydown", (e) => {
    const tgt = e.target as HTMLElement;
    if (!tgt.classList?.contains("neumas-card") || e.altKey || e.ctrlKey || e.metaKey) return;
    const all = cards();
    const i = all.indexOf(tgt);
    let j = -1;
    if (e.key === "ArrowRight") j = Math.min(i + 1, all.length - 1);
    else if (e.key === "ArrowLeft") j = Math.max(i - 1, 0);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = all.length - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rects = all.map((c) => { const r = c.getBoundingClientRect(); return { top: r.top, left: r.left }; });
      j = verticalNeighbor(rects, i, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      cb.onActivate(tgt.dataset.id!);
      return;
    } else return;
    e.preventDefault();
    if (j >= 0 && j !== i) { focusCard(all[j]); cb.onSelect(all[j].dataset.id!); }
  });

  function cardEl(e: EffectiveEntry, selected: boolean): HTMLElement {
    const c = el("div", "neumas-card");
    c.setAttribute("role", "option");
    c.dataset.id = e.id;
    c.setAttribute("aria-selected", String(selected));
    c.tabIndex = selected ? 0 : -1;
    if (e.hidden) { c.classList.add("is-hidden"); c.title = t("catalog.hidden"); }
    const fig = el("span", "neumas-card__fig");
    fig.appendChild(neumeThumb(e, 40));
    const mine = !!e.userNames?.length;
    const name = el("span", "neumas-card__name" + (mine ? " is-mine" : ""), e.displayNames[0] ?? e.nabc);
    const code = el("span", "neumas-card__code", e.nabc);
    c.append(fig, name, code);
    if (mine) {
      const dot = el("span", "neumas-card__mine");
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", t("catalog.hasYourName"));
      c.appendChild(dot);
    }
    c.addEventListener("click", () => { focusCard(c); cb.onActivate(e.id); });
    return c;
  }

  return {
    render(sections, st) {
      if (search.value !== st.query) search.value = st.query;
      famButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.family === st.family)));
      filterButtons.forEach((b) => {
        const on = b.dataset.filter === st.filter;
        b.setAttribute("aria-pressed", String(on));
        b.classList.toggle("sc-chip--active", on);
      });
      card.classList.toggle("is-composing", st.composing);
      const hadFocus = list.contains(document.activeElement);
      const scroll = list.scrollTop;
      list.replaceChildren();
      let any = false;
      for (const s of sections) {
        if (s.total === 0) {
          // "Minhas sequências" vazia só aparece sem busca e com filtro Todos/Sequências
          // (é onde t("catalog.new") e a frase de ajuda fazem sentido); fora disso, some.
          const plain = !st.query.trim() && (st.filter === "todos" || st.filter === "sequencias");
          if (s.id !== "minhas" || !plain) continue;
        }
        const sec = el("div", "neumas-section");
        sec.setAttribute("role", "group");
        sec.dataset.section = s.id;
        const h = el("div", "neumas-section__head");
        const title = el("span", "neumas-section__title", s.id === "minhas" ? `${s.title} (${s.total})` : s.title);
        sec.setAttribute("aria-label", s.title);
        h.appendChild(title);
        if (s.id === "minhas") {
          const add = el("button", "sc-btn sc-btn--tonal neumas-new", t("catalog.new"));
          add.type = "button";
          add.dataset.tip = t("catalog.new.tip");
          add.addEventListener("click", () => cb.onNewSequence());
          h.appendChild(add);
        }
        sec.appendChild(h);
        const grid = el("div", "neumas-grid");
        for (const e of s.items) grid.appendChild(cardEl(e, e.id === st.selectedId));
        if (s.id === "minhas" && s.total === 0) {
          grid.appendChild(el("div", "sc-empty neumas-empty", t("catalog.empty")));
        }
        sec.appendChild(grid);
        if (s.items.length < s.total) {
          const more = el("div", "neumas-more");
          more.appendChild(el("span", "neumas-more__text", t("catalog.showing", { shown: s.items.length, total: s.total })));
          const rest = s.total - s.items.length;
          const next = el("button", "sc-btn sc-btn--elevated neumas-more-btn", tn("catalog.more", rest));
          next.type = "button";
          next.addEventListener("click", () => cb.onMore(s.id, false));
          const every = el("button", "sc-btn sc-btn--elevated neumas-all-btn", t("catalog.all"));
          every.type = "button";
          every.addEventListener("click", () => cb.onMore(s.id, true));
          more.append(next, every);
          sec.appendChild(more);
        }
        list.appendChild(sec);
        any = any || s.items.length > 0;
      }
      if (!any && st.query.trim()) list.appendChild(el("div", "sc-empty", t("catalog.noResults", { query: st.query.trim() })));
      // Foco itinerante: sem seleção, o primeiro cartão é o focável.
      const all = cards();
      if (!all.some((c) => c.tabIndex === 0) && all[0]) all[0].tabIndex = 0;
      list.scrollTop = scroll;
      const fa = st.focusAfter;
      const target = fa ? list.querySelectorAll<HTMLElement>(`[data-section="${fa.section}"] .neumas-card`)[fa.index] : undefined;
      if (target) {
        for (const x of all) x.tabIndex = x === target ? 0 : -1;
        target.focus({ preventScroll: true });
      } else if (hadFocus) focusCard(all.find((c) => c.tabIndex === 0));
      list.scrollTop = scroll;
    },
    updateCard(e) {
      const old = cards().find((x) => x.dataset.id === e.id);
      if (!old) return false;
      const fresh = cardEl(e, old.getAttribute("aria-selected") === "true");
      fresh.tabIndex = old.tabIndex;
      const had = document.activeElement === old;
      old.replaceWith(fresh);
      if (had) fresh.focus({ preventScroll: true });
      return true;
    },
    focusSearch() { search.focus(); search.select(); },
    markSelected(id) {
      const all = cards();
      const c = all.find((x) => x.dataset.id === id);
      if (!c) return false;
      for (const x of all) {
        x.setAttribute("aria-selected", String(x === c));
        x.tabIndex = x === c ? 0 : -1;
      }
      return true;
    },
    reveal(id) {
      const c = cards().find((x) => x.dataset.id === id);
      if (c && typeof c.scrollIntoView === "function") c.scrollIntoView({ block: "nearest" });
    },
    focusGrid() {
      const all = cards();
      const c = all.find((x) => x.tabIndex === 0) ?? all[0];
      if (!c) return false;
      focusCard(c);
      return true;
    },
  };
}
