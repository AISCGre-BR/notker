/** signs.ts — Extração de sinais rítmicos gabc+nabc por sílaba para o motor Tuotilo.
 *
 * v2 — Decisões de spec:
 *   D1: episema (`_`+dígitos), mora (`.`+[01]) e episema vertical (`'`+[01]) da notação
 *       quadrada NUNCA geram sinais rítmicos; o parser CONSUME esses caracteres mas os
 *       descarta. Sinais rítmicos vêm SÓ do NABC (+ quilisma `w`/`W`, initio debilis `-`,
 *       currentes maiúsculos A-M — estes são neumáticos/melódicos do gabc).
 *   D3: alinhamento por segmento via alignSegment(gabcNoteCount, nabcToken|null);
 *       divergência de contagem → fallback "smear" (sinais borrados em todas as notas,
 *       aligned=false).
 *
 * Sintaxe gabc confirmada via nabc-lib/dist/nabc-renderer.es6.js (linhas 17943-18016):
 *   pitch minúsculo a-m = punctum   | maiúsculo A-M = inclinatum (→ currentes v1)
 *   `_`  após nota = episema horizontal (H_EPISEMA; D1: consumido, SEM sinal)
 *   `.`  após nota = punctum mora   (PUNCTUM_MORA; D1: consumido, SEM sinal)
 *   `w`  após nota = quilisma       (S_QUILISMA — sinal melódico, MANTIDO)
 *   `-`  antes de nota gabc = initio debilis (MANTIDO)
 *   `,`→"minima"  `;`→"minor"  `:`→"maior"  `::`→"finalis"  `` ` ``→null (virgula, sem efeito v1)
 *   demais símbolos (~><'vVsx#@r=Ryo^qQ!) ignorados sem quebrar.
 *
 * Modificadores NABC (synopsis-neumes.json → "modifiers"; GregorioNabcRef §241–250):
 *   "-" = episema (fonte primária: St. Gall/Laon)  ">" = liqAug  "~" = liqDim
 */

import type { SyllableSource } from "../preview/engine";
import { alignSegment } from "./nabc-align";

export type RhythmSign =
  | "episema"
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
  perPitchSigns: RhythmSign[][];  // paralelo a pitches — FONTE para a timeline
  aligned: boolean;               // false se algum segmento caiu no fallback D3
  accented: boolean;              // vogal com acento gráfico no TEXTO da sílaba
  divisio: "minima" | "minor" | "maior" | "finalis" | null;
  wordFinal: boolean;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

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

/** Segmentos pareados (gabc, nabc) do grupo `(...)`. Intercalado:
 *  índices pares = gabc, ímpares = nabc do segmento gabc que os precede (mesmo par). */
function extractSegments(src: string): { gabc: string; nabc: string | null }[] | null {
  const m = src.match(/\(([^)]*)\)\s*$/);
  if (!m) return null;
  const segs = m[1].split("|");
  if (segs.length <= 1) return [{ gabc: segs[0] ?? "", nabc: null }];
  const pairs: { gabc: string; nabc: string | null }[] = [];
  for (let i = 0; i < segs.length; i += 2) {
    pairs.push({ gabc: segs[i], nabc: segs[i + 1] ?? null });
  }
  return pairs;
}

// ── Parser de notas por token ─────────────────────────────────────────────────

interface NoteToken {
  pitch: string;        // minúsculo
  signs: RhythmSign[];
}

/** Analisa a parte gabc e devolve array de tokens de nota.
 *  D1: episema (`_`), mora (`.`) e episema vertical (`'`) SÃO CONSUMIDOS mas NÃO
 *  geram sinais. Apenas quilisma `w`/`W`, initio debilis `-` e currentes maiúsculos
 *  A-M geram sinais (estes são neumáticos/melódicos do gabc, não rítmicos da quadrada). */
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

      // D1 — Episema: `_` opcionalmente seguido de dígitos 0-5: CONSUMIDO, SEM sinal
      while (i < len && gabc[i] === "_") {
        i++; // consume `_`
        while (i < len && /[0-5]/.test(gabc[i])) i++; // dígitos opcionais de posição
      }
      // D1 — Mora: `.` (PUNCTUM_MORA — pode ter `0` ou `1` opcional): CONSUMIDO, SEM sinal
      if (i < len && gabc[i] === ".") {
        i++;
        if (i < len && (gabc[i] === "0" || gabc[i] === "1")) i++;
      }
      // Quilisma: `w` (S_QUILISMA) — sinal melódico, MANTIDO
      if (i < len && gabc[i] === "w") {
        noteSigns.push("quilisma");
        i++;
      }
      // Quilisma quadratum: `W` (S_QUILISMA_QUADRATUM) — trata igual
      if (i < len && gabc[i] === "W") {
        noteSigns.push("quilisma");
        i++;
      }
      // D1 — Episema vertical: `'` com dígito opcional: CONSUMIDO, SEM sinal
      if (i < len && gabc[i] === "'") {
        i++;
        if (i < len && /[01]/.test(gabc[i])) i++;
      }
      // Liquescência: `~`, `>`, `<` — ignorados v1
      if (i < len && /[~><]/.test(gabc[i])) i++;

      tokens.push({ pitch: pitchLower, signs: noteSigns });
      continue;
    }

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

// ── API pública ──────────────────────────────────────────────────────────────

/** Vogais com acento agudo do latim litúrgico (precompostas) ou acento
 *  combinante U+0301 — marcam a sílaba TÔNICA nos livros de canto. */
const ACCENT_RE = /[áéíóúýÁÉÍÓÚÝǽǼ́]/;

/** Texto cantado da sílaba = tudo antes do primeiro `(` (pode ser ""). */
function syllableText(s: string): string {
  const i = s.indexOf("(");
  return i < 0 ? s : s.slice(0, i);
}

/** Extrai sinais rítmicos de uma sílaba gabc.
 *  @param src — string no formato "texto(gabc)" ou "(gabc|nabc)" ou intercalado */
export function extractSyllable(src: string, wordFinal = false): SyllableRhythm {
  const accented = ACCENT_RE.test(syllableText(src));
  const segments = extractSegments(src);
  if (!segments) {
    // Sem grupo gabc — retorna estrutura vazia
    return { pitches: [], signs: [], perPitchSigns: [], aligned: true, accented, divisio: null, wordFinal };
  }

  const joined = segments.map((s) => s.gabc).join("/");

  // Divisio only?
  if (isDivisioOnly(joined)) {
    return {
      pitches: [],
      signs: [],
      perPitchSigns: [],
      aligned: true,
      accented,
      divisio: parseDivisio(joined),
      wordFinal,
    };
  }

  const pitches: string[] = [];
  const perPitchSigns: RhythmSign[][] = [];
  let aligned = true;

  for (const seg of segments) {
    const tokens = parseNotes(seg.gabc);
    const a = alignSegment(tokens.length, seg.nabc);
    if (!a.aligned) aligned = false;
    tokens.forEach((t, i) => {
      pitches.push(t.pitch);
      perPitchSigns.push(Array.from(new Set([...t.signs, ...a.perNote[i]])));
    });
  }

  // preQuilisma: nota anterior a uma quilisma que ela própria não seja quilisma.
  for (let i = 1; i < perPitchSigns.length; i++) {
    if (perPitchSigns[i].includes("quilisma") && !perPitchSigns[i - 1].includes("quilisma")) {
      perPitchSigns[i - 1].push("preQuilisma");
    }
  }

  // Divisio no conteúdo misto (ex.: notas + divisio no mesmo grupo — raro, mas seguro)
  const divisio = parseDivisio(joined);

  // União de sinais sem duplicatas
  const signsSet = new Set<RhythmSign>();
  for (const list of perPitchSigns) for (const s of list) signsSet.add(s);

  return { pitches, signs: Array.from(signsSet), perPitchSigns, aligned, accented, divisio, wordFinal };
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
