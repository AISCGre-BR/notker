// src/neume/search.ts
import type { EffectiveEntry, Family } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Pontua um termo contra a query. Maior = melhor. -1 = não casa. */
function scoreTerm(term: string, q: string): number {
  if (term === q) return 1000;
  if (term.startsWith(q)) return 800 - (term.length - q.length);
  const idx = term.indexOf(q);
  if (idx >= 0) return 500 - idx;
  // subsequência (fuzzy)
  let ti = 0;
  for (const ch of q) {
    ti = term.indexOf(ch, ti);
    if (ti < 0) return -1;
    ti++;
  }
  return 100;
}

export class NeumeSearch {
  private items: EffectiveEntry[];
  /** `includeHidden`: a vista Neumas busca também os ocultos (para poder mostrá-los). */
  constructor(items: EffectiveEntry[], private activeFamily?: Family, opts: { includeHidden?: boolean } = {}) {
    this.items = opts.includeHidden ? items : items.filter((e) => !e.hidden);
  }
  /** `opts.family`: devolve SÓ essa família (lida a cada consulta pelo chamador, nunca capturada). */
  query(raw: string, limit = 200, opts: { family?: Family } = {}): EffectiveEntry[] {
    const q = norm(raw.trim());
    const pool = opts.family ? this.items.filter((e) => e.family === opts.family) : this.items;
    if (!q) return pool.slice(0, limit);
    const words = q.split(/\s+/).filter(Boolean);
    const scored: { e: EffectiveEntry; s: number }[] = [];
    for (const e of pool) {
      let total = 0;
      let ok = true;
      for (const w of words) {
        let best = -1;
        for (const t of e.terms) best = Math.max(best, scoreTerm(t, w));
        if (best < 0) { ok = false; break; }
        total += best;
      }
      if (ok) scored.push({ e, s: total });
    }
    const af = this.activeFamily;
    scored.sort((a, b) =>
      b.s - a.s ||
      (af ? (Number(b.e.family === af) - Number(a.e.family === af)) : 0) ||
      a.e.id.localeCompare(b.e.id));
    return scored.slice(0, limit).map((x) => x.e);
  }
}
