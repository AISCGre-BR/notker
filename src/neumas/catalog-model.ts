// src/neumas/catalog-model.ts — o que a grade da vista Neumas mostra (seções, filtros,
// teto de renderização) e a navegação vertical por posição. PURO.
import { t, type MessageKey } from "../i18n";
import { NeumeSearch } from "../neume/search";
import type { EffectiveEntry, Family } from "../neume/types";

export type CatalogFilter = "todos" | "meus" | "sem-nome" | "sequencias";
export const FILTERS: { id: CatalogFilter; labelKey: MessageKey }[] = [
  { id: "todos", labelKey: "catalog.filter.all" },
  { id: "meus", labelKey: "catalog.filter.mine" },
  { id: "sem-nome", labelKey: "catalog.filter.unnamed" },
  { id: "sequencias", labelKey: "catalog.filter.sequences" },
];
export type SectionId = "minhas" | "catalogo" | "glifos";
export interface CatalogSection { id: SectionId; title: string; items: EffectiveEntry[]; total: number }
/** Teto inicial por seção (a grade inteira teria ~600 cartões por família); a vista amplia por seção ("Mostrar mais"). */
export const SECTION_CAP = 150;

const TITLES: Record<SectionId, MessageKey> = {
  minhas: "catalog.section.mine",
  catalogo: "catalog.section.catalog",
  glifos: "catalog.section.glyphs",
};
export const sectionOf = (e: EffectiveEntry): SectionId =>
  (e.userSequence ? "minhas" : e.synthetic ? "catalogo" : "glifos");

/**
 * Seções na ordem Minhas sequências → Sequências do catálogo → Glifos, só da família
 * pedida, incluindo ocultos (a vista mostra-os esmaecidos para poder reexibi-los).
 * `pin`: id que precisa aparecer mesmo além do teto (item aberto por "Nomear neuma…").
 * O filtro "Sequências" tira a seção Glifos.
 */
export function catalogSections(
  all: EffectiveEntry[], family: Family, filter: CatalogFilter, query: string,
  opts: { cap?: number; caps?: Partial<Record<SectionId, number>>; pin?: string | null } = {},
): CatalogSection[] {
  const cap = opts.cap ?? SECTION_CAP;
  const fam = all.filter((e) => e.family === family);
  const pool = query.trim() ? new NeumeSearch(fam, family, { includeHidden: true }).query(query, Infinity) : fam;
  const keep = (e: EffectiveEntry): boolean =>
    filter === "meus" ? !!e.userNames?.length : filter === "sem-nome" ? !e.userNames?.length : true;
  const groups: Record<SectionId, EffectiveEntry[]> = { minhas: [], catalogo: [], glifos: [] };
  for (const e of pool) if (keep(e)) groups[sectionOf(e)].push(e);
  const ids: SectionId[] = filter === "sequencias" ? ["minhas", "catalogo"] : ["minhas", "catalogo", "glifos"];
  return ids.map((id) => {
    const list = groups[id];
    const items = list.slice(0, opts.caps?.[id] ?? cap);
    const pinned = opts.pin ? list.find((e) => e.id === opts.pin) : undefined;
    if (pinned && !items.includes(pinned)) items.push(pinned);
    return { id, title: t(TITLES[id]), items, total: list.length };
  });
}

/** Cartão na linha de cima/baixo mais próximo na horizontal (grade com quebra automática). */
export function verticalNeighbor(rects: { top: number; left: number }[], index: number, dir: 1 | -1): number {
  const cur = rects[index];
  if (!cur) return index;
  let bestTop: number | null = null;
  for (const r of rects) {
    const below = dir === 1 ? r.top > cur.top + 2 : r.top < cur.top - 2;
    if (!below) continue;
    if (bestTop === null || (dir === 1 ? r.top < bestTop : r.top > bestTop)) bestTop = r.top;
  }
  if (bestTop === null) return index;
  let best = index;
  let dist = Infinity;
  rects.forEach((r, i) => {
    if (Math.abs(r.top - bestTop!) > 2) return;
    const d = Math.abs(r.left - cur.left);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}
