// src/neume/naming.ts
// Orquestrador de nomes (F4): roda os DOIS produtores sobre um token e devolve a
// visão unificada — nome(s) canônico(s) da sinopse de Cardine + nome sistemático
// derivado, com termos de busca e proveniência. É o ponto único que hover, build e
// UI consomem. Nunca inventa: sem candidato canônico → só o sistemático, e
// provenance vazio. (Spec F4 D2.)
import { classifySynopsis } from "./synopsis";
import { decodeSystematic } from "./decode";
import type { Candidate, Family, Provenance } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface NamingResult {
  /** Nomes a exibir, em ordem: canônico(s) → sistemático → base; deduplicados. */
  displayNames: string[];
  /** Termos de busca (lower-case, sem acento) de ambos os produtores. */
  terms: string[];
  /** Candidatos canônicos da sinopse (0..N). */
  canonical: Candidate[];
  /** Nome sistemático composto (sempre presente). */
  systematic: string;
  /** Proveniência dos nomes canônicos (vazio quando não há). */
  provenance: Provenance[];
}

export function nameNeume(token: string, family: Family): NamingResult {
  const canonical = classifySynopsis(token, family);
  const sys = decodeSystematic(token, family);

  const displayNames = Array.from(new Set(
    [...canonical.map((c) => c.name), sys.name, sys.baseName].filter(Boolean),
  ));
  const terms = Array.from(new Set(
    [...canonical.map((c) => norm(c.name)), ...sys.terms].filter(Boolean),
  ));

  return {
    displayNames,
    terms,
    canonical,
    systematic: sys.name,
    provenance: canonical.map((c) => c.provenance),
  };
}
