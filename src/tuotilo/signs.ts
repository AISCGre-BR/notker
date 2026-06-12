/** signs.ts — Extração de sinais rítmicos gabc+nabc por sílaba para o motor Tuotilo.
 *
 * Sintaxe gabc confirmada via nabc-lib/dist/nabc-renderer.es6.js (linhas 17943-18016):
 *   pitch minúsculo a-m = punctum   | maiúsculo A-M = inclinatum (→ currentes v1)
 *   `_`  após nota = episema horizontal (H_EPISEMA; pode ter dígitos 0-5 de posição)
 *   `.`  após nota = punctum mora   (PUNCTUM_MORA)
 *   `w`  após nota = quilisma       (S_QUILISMA)
 *   `-`  antes de nota gabc = initio debilis (diferente de `-` no NABC = episema)
 *   `,`→"minima"  `;`→"minor"  `:`→"maior"  `::`→"finalis"  `` ` ``→null (virgula, sem efeito v1)
 *   demais símbolos (~><'vVsx#@r=Ryo^qQ!) ignorados sem quebrar.
 *
 * Modificadores NABC (synopsis-neumes.json → "modifiers"; GregorioNabcRef §241–250):
 *   "-" = episema (fonte primária: St. Gall/Laon)  ">" = liqAug (liquescência aumentativa)
 *   "~" = liqDim (diminutiva)                       "S"/"G"/"M" = modificações visuais (ignoradas v1)
 *
 * Bases NABC relevantes para ritmo (nível sílaba — sem alinhamento nota-a-nota):
 *   or, pq, pt, oc   → "oriscus"   |   st, ds, ts, bv, tv → "strophae"
 *   ql, qi           → "quilisma"  (reforço do sinal gabc quando presente)
 */

import type { SyllableSource } from "../preview/engine";

export type RhythmSign =
  | "episema"
  | "mora"
  | "quilisma"
  | "preQuilisma"
  | "currentes"
  | "initioDebilis"
  | "liqAug"
  | "liqDim"
  | "oriscus"
  | "strophae";

export interface SyllableRhythm {
  pitches: string[];              // minúsculas, na ordem; repercussões PRESERVADAS
  signs: RhythmSign[];            // união dos sinais da sílaba (sem duplicatas)
  perPitchSigns: RhythmSign[][];  // paralelo a pitches
  divisio: "minima" | "minor" | "maior" | "finalis" | null;
  wordFinal: boolean;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Extrai a string gabc de dentro dos parênteses da última `(...)` da sílaba.
 *  Retorna null se não houver grupo gabc. */
function extractGabcGroup(src: string): string | null {
  // Pega o conteúdo do ÚLTIMO grupo `(...)` — sílabas têm exatamente um grupo;
  // se houver barra `|` (nabc), toma só a parte antes da barra.
  const m = src.match(/\(([^)]*)\)\s*$/);
  if (!m) return null;
  const inner = m[1];
  // gabc puro = antes da barra `|` (nabc vem depois)
  return inner.split("|")[0];
}

/** Detecta divisio pelo conteúdo gabc (sem notas).
 *  ATENÇÃO: detectar `::` antes de `:` para evitar match parcial. */
function parseDivisio(gabc: string): SyllableRhythm["divisio"] {
  const s = gabc.trim();
  if (s === "::") return "finalis";
  if (s === ":") return "maior";
  if (s === ";") return "minor";
  if (s === ",") return "minima";
  // virgula (`) e outros → null
  return null;
}

/** Retorna true se o conteúdo gabc é apenas divisio/virgula (sem notas). */
function isDivisioOnly(gabc: string): boolean {
  return /^[;:,`^]+$/.test(gabc.trim());
}

// ── Parser de notas por token ─────────────────────────────────────────────────

interface NoteToken {
  pitch: string;        // minúsculo
  signs: RhythmSign[];
}

/** Analisa a parte gabc e devolve array de tokens de nota. */
function parseNotes(gabc: string): NoteToken[] {
  const tokens: NoteToken[] = [];
  let i = 0;
  const len = gabc.length;

  while (i < len) {
    const ch = gabc[i];

    // Initio debilis: `-` antes de nota minúscula ou maiúscula
    if (ch === "-" && i + 1 < len && /[a-mA-M]/.test(gabc[i + 1])) {
      i++; // avança o `-`, a nota vem a seguir no loop
      continue; // será detectada como nota normal; marcamos após
    }

    // Pitch minúsculo (punctum) ou maiúsculo (inclinatum)
    if (/[a-mA-M]/.test(ch)) {
      const pitchLower = ch.toLowerCase();
      const isCurrentes = /[A-M]/.test(ch);
      const noteSigns: RhythmSign[] = [];
      if (isCurrentes) noteSigns.push("currentes");

      // Verifica initio debilis: o char imediatamente anterior (antes do pitch) era `-`
      const prevChar = i > 0 ? gabc[i - 1] : "";
      if (prevChar === "-") noteSigns.push("initioDebilis");

      i++; // avança além do pitch

      // Consome qualificadores que seguem imediatamente a nota
      // Episema: `_` opcionalmente seguido de dígitos 0-5
      while (i < len && gabc[i] === "_") {
        noteSigns.push("episema");
        i++; // consume `_`
        while (i < len && /[0-5]/.test(gabc[i])) i++; // dígitos opcionais de posição
      }
      // Mora: `.` (PUNCTUM_MORA — pode ter `0` ou `1` opcional)
      if (i < len && gabc[i] === ".") {
        noteSigns.push("mora");
        i++;
        if (i < len && (gabc[i] === "0" || gabc[i] === "1")) i++;
      }
      // Quilisma: `w` (S_QUILISMA)
      if (i < len && gabc[i] === "w") {
        noteSigns.push("quilisma");
        i++;
      }
      // Quilisma quadratum: `W` (S_QUILISMA_QUADRATUM) — trata igual
      if (i < len && gabc[i] === "W") {
        noteSigns.push("quilisma");
        i++;
      }
      // Episema vertical: `'` com dígito opcional — ignorado semiologicamente v1
      if (i < len && gabc[i] === "'") {
        i++;
        if (i < len && /[01]/.test(gabc[i])) i++;
      }
      // Liquescência: `~`, `>`, `<` — ignorados v1
      if (i < len && /[~><]/.test(gabc[i])) i++;

      tokens.push({ pitch: pitchLower, signs: noteSigns });
      continue;
    }

    // Símbolos multi-char ou prefixos de outros tipos de nota
    // `@[a-m]` = nota fused (prefixo @) — trata como pitch normal
    if (ch === "@" && i + 1 < len && /[a-mA-M]/.test(gabc[i + 1])) {
      i++; // consome `@`, a nota virá na próxima iteração
      continue;
    }

    // Ignorar tudo mais: `/`, `!`, `'`, números, x, y, s, v, V, o, q, r, R, =, ^, etc.
    i++;
  }

  return tokens;
}

// ── Enriquecimento NABC ───────────────────────────────────────────────────────

/** Bases NABC que indicam oriscus (GregorioNabcRef; tables.ts KIND_NAMES). */
const ORISCUS_BASES = new Set(["or", "pq", "pt", "oc"]);

/** Bases NABC que indicam strophae (apostropha e seus compostos). */
const STROPHAE_BASES = new Set(["st", "ds", "ts", "bv", "tv"]);

/** Bases NABC que indicam quilisma. */
const QUILISMA_BASES = new Set(["ql", "qi"]);

/** Extrai a parte nabc de dentro dos parênteses (após `|`).
 *  Retorna null se não houver separador `|`. */
function extractNabcGroup(src: string): string | null {
  const m = src.match(/\(([^)]*)\)\s*$/);
  if (!m) return null;
  const idx = m[1].indexOf("|");
  if (idx < 0) return null;
  return m[1].slice(idx + 1);
}

/** Remove prefixos de letras significativas (ls.../lt...) e hh-pitch (h[a-m])
 *  do token para isolar bases e modificadores de glifo.
 *  Estratégia leve: substitui padrões conhecidos por ""; não usa tabelas externas. */
function stripNonGlyphParts(token: string): string {
  // Remove letras significativas: ls<letras><dígito> e lt<letras><dígito>
  let s = token.replace(/l[st][a-z]+[0-9]/g, "");
  // Remove pitch relativo: h[a-m]
  s = s.replace(/h[a-m]/g, "");
  // Remove ajuste horizontal: /+ e `+
  s = s.replace(/[/`]+/g, "");
  return s;
}

/** Extrai sinais rítmicos do token NABC e os adiciona a `s` (nível sílaba v1).
 *  Reutiliza NEUME_KINDS/KIND_NAMES indiretamente via ORISCUS_BASES/STROPHAE_BASES.
 *  NÃO tenta alinhar nota-a-nota; decisão "sentido geral" por divergência gabc×nabc. */
export function enrichFromNabc(s: SyllableRhythm, nabcSrc: string): SyllableRhythm {
  if (!nabcSrc) return s;

  const signsSet = new Set<RhythmSign>(s.signs);

  // Cada neuma do token é separado por "!" (NABC_COMPLEX_NEUME_SEPARATOR).
  // Iterar sobre todos para detectar bases semiológicas em qualquer posição.
  for (const part of nabcSrc.split("!")) {
    const clean = stripNonGlyphParts(part);

    // Extrair base de 2 letras de cada segmento (pode ter vários glifos concatenados)
    // Padrão: letras minúsculas seguidas de modificadores SGM->~1-9
    const baseMatches = clean.match(/[a-z]{2}/g) ?? [];
    for (const base of baseMatches) {
      if (ORISCUS_BASES.has(base))  signsSet.add("oriscus");
      if (STROPHAE_BASES.has(base)) signsSet.add("strophae");
      if (QUILISMA_BASES.has(base)) signsSet.add("quilisma");
    }

    // Detectar modificadores de glifo (GregorioNabcRef §241–250):
    //   "-"  = episema (NABC é a fonte primária de ritmo — St. Gall/Laon)
    //   ">"  = liquescência aumentativa
    //   "~"  = liquescência diminutiva
    // O Set garante que "episema" não duplica mesmo se o GABC também tiver `_`.
    if (clean.includes("-")) signsSet.add("episema");
    if (clean.includes(">")) signsSet.add("liqAug");
    if (clean.includes("~")) signsSet.add("liqDim");
  }

  return { ...s, signs: Array.from(signsSet) };
}

// ── API pública ──────────────────────────────────────────────────────────────

/** Extrai sinais rítmicos de uma sílaba gabc.
 *  @param src — string no formato "texto(gabc)" ou "(gabc|nabc)" */
export function extractSyllable(src: string, wordFinal = false): SyllableRhythm {
  const gabcGroup = extractGabcGroup(src);

  if (!gabcGroup) {
    // Sem grupo gabc — retorna estrutura vazia
    return { pitches: [], signs: [], perPitchSigns: [], divisio: null, wordFinal };
  }

  // Divisio only?
  if (isDivisioOnly(gabcGroup)) {
    return {
      pitches: [],
      signs: [],
      perPitchSigns: [],
      divisio: parseDivisio(gabcGroup),
      wordFinal,
    };
  }

  // Parsing de notas
  const noteTokens = parseNotes(gabcGroup);
  const pitches = noteTokens.map((n) => n.pitch);
  const perPitchSigns: RhythmSign[][] = noteTokens.map((n) => [...n.signs]);

  // Propagação de preQuilisma: para cada nota com "quilisma",
  // a nota imediatamente anterior recebe "preQuilisma".
  for (let i = 0; i < perPitchSigns.length; i++) {
    if (perPitchSigns[i].includes("quilisma") && i > 0) {
      perPitchSigns[i - 1].push("preQuilisma");
    }
  }

  // Divisio no conteúdo misto (ex.: notas + divisio no mesmo grupo — raro, mas seguro)
  const divisio = parseDivisio(gabcGroup);

  // União de sinais sem duplicatas
  const signsSet = new Set<RhythmSign>();
  for (const noteSignList of perPitchSigns) {
    for (const s of noteSignList) signsSet.add(s);
  }
  const signs = Array.from(signsSet);

  let result: SyllableRhythm = { pitches, signs, perPitchSigns, divisio, wordFinal };

  // Enriquecimento NABC: se houver parte após `|`, extrai sinais semiológicos adicionais
  const nabcGroup = extractNabcGroup(src);
  if (nabcGroup) result = enrichFromNabc(result, nabcGroup);

  return result;
}

/** Extrai sinais rítmicos de todas as sílabas reais do documento.
 *  @param docText — texto completo do documento
 *  @param map     — resultado de syllableSpans (SyllableSource[])
 *  @returns array de SyllableRhythm na ordem das sílabas (ignora índice 0 = clave) */
export function extractAll(docText: string, map: SyllableSource[]): SyllableRhythm[] {
  // Filtra apenas sílabas reais (syllableIndex >= 1)
  const real = map.filter((s) => s.syllableIndex >= 1);

  return real.map((span, i) => {
    const src = docText.slice(span.from, span.to);

    // wordFinal: char imediatamente após o `)` de fechamento da sílaba
    // é espaço, quebra de linha, ou fim do documento → nova palavra
    const afterPos = span.to;
    const charAfter = afterPos < docText.length ? docText[afterPos] : "";
    const wordFinal = charAfter === "" || /[\s\n\r]/.test(charAfter);

    return extractSyllable(src, wordFinal);
  });
}
