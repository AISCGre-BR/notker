// src/neume/search.ts
import type { EffectiveEntry } from "./types";

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
  constructor(items: EffectiveEntry[]) {
    this.items = items.filter((e) => !e.hidden);
  }
  query(raw: string, limit = 200): EffectiveEntry[] {
    const q = norm(raw.trim());
    if (!q) return this.items.slice(0, limit);
    const scored: { e: EffectiveEntry; s: number }[] = [];
    for (const e of this.items) {
      let best = -1;
      for (const t of e.terms) best = Math.max(best, scoreTerm(t, q));
      if (best >= 0) scored.push({ e, s: best });
    }
    scored.sort((a, b) => b.s - a.s || a.e.id.localeCompare(b.e.id));
    return scored.slice(0, limit).map((x) => x.e);
  }
}
