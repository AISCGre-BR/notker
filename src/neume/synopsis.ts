// src/neume/synopsis.ts
// Classificação CANÔNICA de um token NABC contra a tabela-sinopse de Cardine
// (synopsis-neumes.json, portada de GregorioNabcRef v6.2.0). Constrói, no load,
// um índice `assinatura estrutural → candidatos` rodando a MESMA função signature()
// sobre cada código-exemplo. Consultar é só reduzir o token à sua assinatura e
// buscar. Uma assinatura pode casar N candidatos (ambiguidade legítima entre
// linhas/famílias) — todos são devolvidos; o humano arbitra. Nunca inventa: sem
// assinatura no índice → lista vazia.
import data from "./synopsis-neumes.json";
import { signature } from "./signature";
import type { Candidate, Family, Provenance } from "./types";

interface SynopsisRow { family: Family; name: string; examples: string[]; by?: string }
interface SynopsisData {
  provenance: { source: string; via: string };
  rows: SynopsisRow[];
}

const synopsis = data as unknown as SynopsisData;

const index: Map<string, Candidate[]> = (() => {
  const m = new Map<string, Candidate[]>();
  for (const row of synopsis.rows) {
    const provenance: Provenance = {
      source: synopsis.provenance.source,
      via: synopsis.provenance.via,
      family: row.family,
      row: row.name,
    };
    const candidate: Candidate = { name: row.name, family: row.family, provenance };
    for (const ex of row.examples) {
      const sig = signature(ex, row.family);
      const list = m.get(sig) ?? [];
      if (!list.some((c) => c.name === candidate.name && c.family === candidate.family)) {
        list.push(candidate);
      }
      m.set(sig, list);
    }
  }
  return m;
})();

/** Candidatos canônicos para o token na família dada (0..N). Vazio = sem chancela. */
export function classifySynopsis(token: string, family: Family): Candidate[] {
  return index.get(signature(token, family)) ?? [];
}
