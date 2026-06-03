// src/neume/decode.ts
import type { Family, NeumeEntry, GlyphSvg, BaseAnnotations } from "./types";
import { KIND_NAMES, NEUME_KINDS, decodeName } from "./tables";
import { parsePosition, type Position } from "./positions";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Letras significativas: grupos `ls..`/`lt..` opcionalmente com dígito. */
function extractLetters(rest: string): string[] {
  return rest.match(/l[st][a-z]*\d*/g) ?? [];
}

export interface TokenDescription {
  base: string;          // código-base (2 letras)
  baseName: string;      // nome humano (KIND_NAMES) ou o próprio base
  isKnownBase: boolean;  // base ∈ NEUME_KINDS
  letters: string[];     // letras significativas decodificadas (ex.: "lsi9" → "i")
  rest: string;          // tudo após o base
}

/** Decodifica QUALQUER token NABC em base + nome + letras significativas, mesmo
 *  quando o token composto inteiro não existe no catálogo. Usado pelo hover para
 *  sempre identificar ao menos o neuma-base e os modificadores. */
export function describeToken(token: string): TokenDescription {
  const t = token.replace(/^\|/, "").trim();
  const base = t.slice(0, 2);
  const rest = t.slice(2);
  const isKnownBase = NEUME_KINDS.has(base);
  const baseName = isKnownBase ? (KIND_NAMES[base] ?? base) : base;
  const letters = extractLetters(rest).map((l) =>
    l.replace(/^l[st]/, "").replace(/\d+$/, ""),
  );
  return { base, baseName, isKnownBase, letters, rest };
}

/** Nome do subpunctis conforme a contagem: 2=bi, 3=tri, demais (1 ou >3) = genérico.
 *  Cardine não nomeia além de tri — acima disso generaliza para "subpunctis". */
export function subpunctisWord(n: number): string {
  if (n === 2) return "subbipunctis";
  if (n === 3) return "subtripunctis";
  return "subpunctis";
}

/** Termos de busca derivados dos modificadores NABC (GregorioNabcRef §270–291). */
function modifierTerms(rest: string): string[] {
  const out: string[] = [];
  const su = rest.match(/su[tuvwxy]?(\d+)?/);   // subpunctis (su) + forma opcional + contagem
  if (su) {
    out.push("subpunctis");                     // genérico, sempre buscável
    const n = su[1] ? parseInt(su[1], 10) : 1;
    const w = subpunctisWord(n);
    if (w !== "subpunctis") out.push(w);         // subbipunctis / subtripunctis
  }
  const pp = rest.match(/pp[tuvwxy]?(\d+)?/);    // praepunctis (pp)
  if (pp) out.push("prepunctis", "praepunctis");
  return out;
}

/** Resultado do decode sistemático (generativo, "composição", rotulado como derivado). */
export interface SystematicDecode {
  base: string;
  baseName: string;
  name: string;          // nome composto legível (baseName + modificadores)
  terms: string[];       // termos de busca (lower-case, sem acento), inclui posicionamento
  position: Position;    // deslocamento horizontal + pitch decodificados
  letters: string[];
}

/** Decodifica MECANICAMENTE um token NABC num nome composto + termos, incluindo
 *  posicionamento (horizontal/pitch). Não consulta a sinopse; é a metade "sistemática"
 *  que sempre existe, mesmo sem nome canônico. (GregorioNabcRef §178–320.) */
export function decodeSystematic(token: string, _family: Family): SystematicDecode {
  const position = parsePosition(token);
  const body = token.replace(/^[/`]+/, "");
  const desc = describeToken(body);
  const modTerms = modifierTerms(desc.rest);
  const posTerms: string[] = [];
  if (position.hshift > 0) posTerms.push("deslocado a direita");
  if (position.hshift < 0) posTerms.push("deslocado a esquerda");
  if (position.pitch !== "f") posTerms.push(`altura relativa h${position.pitch}`);
  const name = [desc.baseName, ...modTerms].join(" ").trim();
  const terms = Array.from(new Set([
    norm(desc.baseName), norm(desc.base),
    ...modTerms.map(norm), ...posTerms.map(norm),
    ...desc.letters.map((l) => norm(l)),
  ].filter(Boolean)));
  return { base: desc.base, baseName: desc.baseName, name, terms, position, letters: desc.letters };
}

export function decodeGlyph(
  family: Family,
  code: string,
  svg: GlyphSvg,
  annot: BaseAnnotations,
): NeumeEntry {
  const nabc = decodeName(code);
  const base = code.slice(0, 2);
  const name = NEUME_KINDS.has(base) ? (KIND_NAMES[base] ?? base) : base;
  const rest = code.slice(2);
  const letters = extractLetters(rest);
  const qualifiers = rest ? [decodeName(rest)] : [];
  const a = annot[base] ?? {};
  const ptTerms = (a.pt ?? []).map(norm);

  const terms = Array.from(new Set([
    norm(name), norm(base), norm(code), norm(nabc), ...ptTerms, ...modifierTerms(rest).map(norm),
  ].filter(Boolean)));

  return {
    id: `${family}:${code}`,
    family, code, nabc, nabcValid: true, base, name,
    qualifiers, letters, terms, meaning: a.meaning ?? "", svg,
  };
}
