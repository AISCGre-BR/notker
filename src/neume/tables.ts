// src/neume/tables.ts
// Port de vendor/gregorio: gregoriotex-nabc.lua:120 (neumekinds) e
// GregorioNabcRef.tex (tabela código→nome). Encoding do nome do glifo:
// B→> N→- E→! T→~ (gregoriotex-nabc.lua:89).

/** 32 códigos-base válidos (gregoriotex-nabc.lua:120). */
export const NEUME_KINDS: ReadonlySet<string> = new Set([
  "vi", "pu", "ta", "gr", "cl", "un", "pv", "pe", "po", "to", "ci", "sc",
  "pf", "sf", "tr", "st", "ds", "ts", "tg", "bv", "tv", "pr", "pi", "vs",
  "or", "sa", "pq", "qi", "ql", "pt", "oc", "ni",
]);

/** Nome canônico latino por código-base (GregorioNabcRef.tex). `pv` não é
 *  nomeado na referência → fallback para o próprio código no decode. */
export const KIND_NAMES: Readonly<Record<string, string>> = {
  vi: "virga", pu: "punctum", ta: "tractulus", gr: "gravis", cl: "clivis",
  un: "uncinus", pe: "pes", po: "porrectus", to: "torculus", ci: "climacus",
  sc: "scandicus", pf: "porrectus flexus", sf: "scandicus flexus",
  tr: "torculus resupinus", st: "stropha", ds: "distropha", ts: "tristropha",
  tg: "trigonus", bv: "bivirga", tv: "trivirga", pr: "pressus maior",
  pi: "pressus minor", vs: "virga strata", or: "oriscus", sa: "scandicus",
  pq: "pes quassus", qi: "quilisma (2 loops)", ql: "quilisma (3 loops)",
  pt: "pes stratus", oc: "oriscus-clivis", ni: "nihil",
};

/** Substituição de encoding do nome do glifo → token NABC (lua:89). */
export function decodeName(glyphName: string): string {
  return glyphName
    .replace(/B/g, ">").replace(/N/g, "-").replace(/E/g, "!").replace(/T/g, "~");
}
