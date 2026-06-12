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
  perPitchAlt: number[];          // semitons por nota: -1 (bemol) | 0 (natural) | +1 (sustenido)
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

interface AccidentEvent {
  afterNote: number;            // nº de notas já emitidas quando o acidente apareceu
  letter: string;               // letra (minúsculo) da posição afetada
  kind: "flat" | "natural" | "sharp";
}

interface ParseNotesResult {
  tokens: NoteToken[];
  events: AccidentEvent[];
}

/** Analisa a parte gabc e devolve tokens de nota E eventos de acidente.
 *  D1: episema (`_`), mora (`.`) e episema vertical (`'`) SÃO CONSUMIDOS mas NÃO
 *  geram sinais. Apenas quilisma `w`/`W`, initio debilis `-` e currentes maiúsculos
 *  A-M geram sinais (estes são neumáticos/melódicos do gabc, não rítmicos da quadrada).
 *  Acidentes: letra+x (bemol), letra+y (natural), letra+# (sustenido) são registrados
 *  como AccidentEvent com afterNote = nº de notas já emitidas naquele momento. */
function parseNotes(gabc: string): ParseNotesResult {
  const tokens: NoteToken[] = [];
  const events: AccidentEvent[] = [];
  let i = 0;
  const len = gabc.length;

  while (i < len) {
    const ch = gabc[i];

    // Initio debilis: `-` antes de nota minúscula ou maiúscula
    if (ch === "-" && i + 1 < len && /[a-mA-M]/.test(gabc[i + 1])) {
      i++; // avança o `-`, a nota vem a seguir no loop
      continue; // será detectada como nota normal; marcamos após
    }

    // Acidente: letra de POSIÇÃO seguida de x (bemol), y (natural) ou # (sustenido)
    // é um glifo de acidente, NÃO uma nota — registrar o evento e consumir os dois.
    if (/[a-m]/.test(ch) && i + 1 < len && /[xy#]/.test(gabc[i + 1])) {
      const letter = ch.toLowerCase();
      const mod = gabc[i + 1];
      const kind: AccidentEvent["kind"] = mod === "x" ? "flat" : mod === "#" ? "sharp" : "natural";
      events.push({ afterNote: tokens.length, letter, kind });
      i += 2;
      continue;
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

  return { tokens, events };
}

/** Aplica eventos de acidente aos tokens de uma sílaba, consultando e atualizando
 *  o mapa de acidentes ativos (altState). Retorna array perPitchAlt paralelo a tokens.
 *  @param tokens — notas da sílaba (offset 0-based dentro desta chamada)
 *  @param events — acidentes encontrados nesta sílaba (afterNote relativo ao início da sílaba)
 *  @param noteOffset — quantas notas já foram emitidas ANTES desta sílaba no segmento atual
 *  @param altState — mapa mutado: letter → -1 (bemol) | 1 (sustenido); ausente = natural */
function applyAccidents(
  tokens: NoteToken[],
  events: AccidentEvent[],
  noteOffset: number,
  altState: Map<string, -1 | 1>,
): number[] {
  // Ordena eventos por afterNote (já devem estar em ordem, mas garante)
  const sorted = [...events].sort((a, b) => a.afterNote - b.afterNote);

  // Para cada nota (i), aplica primeiro os acidentes com afterNote <= noteOffset+i
  // que aparecem ANTES ou NA fronteira da nota, depois consulta o estado ativo.
  const perPitchAlt: number[] = [];
  let evIdx = 0;

  for (let i = 0; i < tokens.length; i++) {
    // Processa todos os acidentes que caem antes ou na fronteira desta nota
    while (evIdx < sorted.length && sorted[evIdx].afterNote <= noteOffset + i) {
      const ev = sorted[evIdx];
      if (ev.kind === "natural") {
        altState.delete(ev.letter);
      } else {
        altState.set(ev.letter, ev.kind === "flat" ? -1 : 1);
      }
      evIdx++;
    }
    const alt = altState.get(tokens[i].pitch) ?? 0;
    perPitchAlt.push(alt);
  }

  // Processa acidentes remanescentes (após a última nota da sílaba) —
  // atualizam o estado para sílabas seguintes da mesma palavra
  while (evIdx < sorted.length) {
    const ev = sorted[evIdx];
    if (ev.kind === "natural") {
      altState.delete(ev.letter);
    } else {
      altState.set(ev.letter, ev.kind === "flat" ? -1 : 1);
    }
    evIdx++;
  }

  return perPitchAlt;
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
 *  @param src      — string no formato "texto(gabc)" ou "(gabc|nabc)" ou intercalado
 *  @param wordFinal — sílaba é a última da palavra (para wordFinal flag)
 *  @param altState  — mapa mutado de acidentes ativos na palavra (letra → -1|1).
 *                     Se omitido, cria um Map local (escopo por-sílaba, retrocompatível). */
export function extractSyllable(
  src: string,
  wordFinal = false,
  altState?: Map<string, -1 | 1>,
): SyllableRhythm {
  const localAltState = altState ?? new Map<string, -1 | 1>();

  const accented = ACCENT_RE.test(syllableText(src));
  const segments = extractSegments(src);
  if (!segments) {
    // Sem grupo gabc — retorna estrutura vazia
    return { pitches: [], signs: [], perPitchSigns: [], perPitchAlt: [], aligned: true, accented, divisio: null, wordFinal };
  }

  const joined = segments.map((s) => s.gabc).join("/");

  // Divisio only?
  if (isDivisioOnly(joined)) {
    return {
      pitches: [],
      signs: [],
      perPitchSigns: [],
      perPitchAlt: [],
      aligned: true,
      accented,
      divisio: parseDivisio(joined),
      wordFinal,
    };
  }

  const pitches: string[] = [];
  const perPitchSigns: RhythmSign[][] = [];
  const perPitchAlt: number[] = [];
  let aligned = true;
  let noteOffset = 0;

  for (const seg of segments) {
    const { tokens, events } = parseNotes(seg.gabc);
    const a = alignSegment(tokens.length, seg.nabc);
    if (!a.aligned) aligned = false;
    // Aplica acidentes deste segmento consultando/atualizando o altState compartilhado.
    // noteOffset acumula o nº de notas de segmentos anteriores nesta sílaba.
    const segAlt = applyAccidents(tokens, events, noteOffset, localAltState);
    tokens.forEach((t, i) => {
      pitches.push(t.pitch);
      perPitchSigns.push(Array.from(new Set([...t.signs, ...a.perNote[i]])));
      perPitchAlt.push(segAlt[i]);
    });
    noteOffset += tokens.length;
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

  return { pitches, signs: Array.from(signsSet), perPitchSigns, perPitchAlt, aligned, accented, divisio, wordFinal };
}

/** Extrai sinais rítmicos de todas as sílabas reais do documento.
 *  @param docText — texto completo do documento
 *  @param map     — resultado de syllableSpans (SyllableSource[])
 *  @returns array de SyllableRhythm na ordem das sílabas (ignora índice 0 = clave)
 *
 *  Acidentes valem pela PALAVRA: o altState é compartilhado entre todas as sílabas
 *  da mesma palavra e resetado ao início de cada nova palavra. Sílabas de divisio
 *  (pitches vazios, divisio !== null) também resetam o estado (separam palavras). */
export function extractAll(docText: string, map: SyllableSource[]): SyllableRhythm[] {
  // Filtra apenas sílabas reais (syllableIndex >= 1)
  const real = map.filter((s) => s.syllableIndex >= 1);

  // altState: mapa de acidentes ativos na palavra corrente (mutado por extractSyllable)
  let altState = new Map<string, -1 | 1>();
  let prevWordFinal = true; // antes da primeira sílaba = início de palavra nova

  return real.map((span) => {
    const src = docText.slice(span.from, span.to);

    // wordFinal: char imediatamente após o `)` de fechamento da sílaba
    // é espaço, quebra de linha, ou fim do documento → nova palavra
    const afterPos = span.to;
    const charAfter = afterPos < docText.length ? docText[afterPos] : "";
    const wordFinal = charAfter === "" || /[\s\n\r]/.test(charAfter);

    // Reset do altState no início de cada nova palavra (ou pós-divisio)
    if (prevWordFinal) {
      altState = new Map<string, -1 | 1>();
    }

    const result = extractSyllable(src, wordFinal, altState);

    // Sílabas de divisio também encerram a "palavra" para fins de acidentes
    if (result.divisio !== null) {
      prevWordFinal = true;
    } else {
      prevWordFinal = wordFinal;
    }

    return result;
  });
}
