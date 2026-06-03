// src/neume/naming.ts
// Orquestrador de nomes (F4): roda os DOIS produtores sobre um token e devolve a
// visão unificada — nome(s) canônico(s) da sinopse de Cardine + nome sistemático
// derivado, com termos de busca e proveniência. É o ponto único que hover, build e
// UI consomem. Nunca inventa: sem candidato canônico → só o sistemático, e
// provenance vazio. (Spec F4 D2.)
import { classifySynopsis } from "./synopsis";
import { decodeSystematic, subpunctisWord } from "./decode";
import type { Candidate, Family, Provenance } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Corrige a palavra de subpunctis no nome canônico conforme a contagem REAL do
 *  token (Bug 2): a sinopse nomeia "pes subbipunctis" usando o exemplo su2, mas
 *  o mesmo nome é herdado por assinatura para su3, su5… — então substituímos
 *  sub(bi|tri)?punctis pela palavra certa da contagem do token. */
function correctSubCount(name: string, token: string): string {
  const m = token.match(/su[tuvwxy]?(\d+)/);
  if (!m) return name;
  return name.replace(/sub(?:bi|tri)?punctis/g, subpunctisWord(parseInt(m[1], 10)));
}

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
  const canonical = classifySynopsis(token, family)
    .map((c) => ({ ...c, name: correctSubCount(c.name, token) }));
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
