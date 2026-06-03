// src/neume/signature.ts
// Assinatura ESTRUTURAL de um token NABC, para o match canônico da tabela-sinopse
// (GregorioNabcRef §178–320). Reduz um código à sua família + bases + conjunto de
// TIPOS de modificador, descartando contagens, letras significativas, pitch e ajuste
// horizontal — exatamente as dimensões que a sinopse mostra serem "livres" dentro de
// uma mesma linha. É usada tanto para indexar a sinopse quanto para consultar; basta
// ser determinística (colisões viram candidatos múltiplos, revisados por humano).
import type { Family } from "./types";

/** Modificadores de glifo (§241–250), na ordem canônica de exibição. */
const GLYPH_MODS = ["S", "G", "M", "-", ">", "~"] as const;
/** Ordem determinística dos tipos na assinatura: glifo, depois praepunctis/subpunctis. */
const ORDER = ["S", "G", "M", "-", ">", "~", "pp", "su"];

export function signature(token: string, family: Family): string {
  const t = token.replace(/^[/`]+/, ""); // remove ajuste horizontal prefixado (/ // ` ``)
  const bases = t.split("!").map((seg) => seg.slice(0, 2)); // base = 2 letras de cada glifo

  const types = new Set<string>();
  for (const m of GLYPH_MODS) if (t.includes(m)) types.add(m);
  if (/pp[a-z]?\d/.test(t)) types.add("pp"); // praepunctis: pp [forma] contagem
  if (/su[a-z]?\d/.test(t)) types.add("su"); // subpunctis: su [forma] contagem

  const ordered = ORDER.filter((x) => types.has(x));
  return `${family}·${bases.join("!")}·${ordered.join("+")}`;
}
