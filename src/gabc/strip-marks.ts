// Remoção de episemas verticais, episemas horizontais e moras (punctum mora) do gabc.
// Sintaxe de Gregorio v6.2.0 (doc/Gabc.tex): vertical ' '0 '1; horizontal _ (+dígito 0-5)
// e modificadores [oh:…] [uh:…] (inclusive blocos [oh:…{] … [oh}]); mora . ou .. (+0/1).
// Só dentro de grupos (…) do corpo, só nos segmentos gabc (alternância gabc|nabc pelo `nabc-lines`).
// Varredura por caracteres, sem regex.

export interface MarkKinds { vertical: boolean; horizontal: boolean; mora: boolean }
export interface MarkCounts { vertical: number; horizontal: number; mora: number }

const ALL: MarkKinds = { vertical: true, horizontal: true, mora: true };

/** Índice onde o corpo começa (depois da linha `%%`); 0 se não houver cabeçalho. */
export function bodyStart(gabc: string): number {
  let i = 0;
  while (i <= gabc.length) {
    let nl = gabc.indexOf("\n", i);
    if (nl < 0) nl = gabc.length;
    if (gabc.slice(i, nl).replace(/\r$/, "").trim() === "%%") return Math.min(nl + 1, gabc.length);
    if (nl >= gabc.length) return 0;
    i = nl + 1;
  }
  return 0;
}

const isDigit = (c: string | undefined, max: string): boolean => c !== undefined && c >= "0" && c <= max;

interface Win { from: number; to: number }
export interface Removal { from: number; to: number }

/** Candidato a remoção. `pos` decide a janela (num `_` com seus `[oh|uh:…]`, é a posição do `_`);
 *  `open`/`close` são as pontas de um bloco `[oh:…{]` … `[oh}]` (decididas em par). */
interface Tok { from: number; to: number; pos: number; kind: "v" | "h" | "mora" | "mod" | "open" | "close"; side?: string }

/** `]` que fecha o colchete aberto em `i` (respeitando o escape `$.`), ou -1. */
function bracketEnd(s: string, i: number, end: number): number {
  for (let k = i + 1; k < end; k++) {
    if (s[k] === "$") { k++; continue; }
    if (s[k] === "]") return k;
  }
  return -1;
}

/** Classifica o conteúdo de um colchete do episema horizontal: modificador, abertura ou fecho de bloco. */
function hKind(inner: string): Tok["kind"] | null {
  if (!/^[ou]h/.test(inner)) return null;
  if (/^[ou]h:?\}$/.test(inner)) return "close";
  if (inner.endsWith("{")) return "open";
  return "mod";
}

const BARS = "`^,;:";

/** Varre um segmento gabc [a,b) de um grupo e anota os candidatos. */
function scanSegment(s: string, a: number, b: number, toks: Tok[]): void {
  let i = a;
  const attached = (): void => { // `'`, `_`, `.` colados numa barra pertencem à barra (bar brace etc.)
    for (;;) {
      if (s[i] === "'") { i++; if (i < b && isDigit(s[i], "1")) i++; }
      else if (s[i] === "_") { i++; while (i < b && isDigit(s[i], "5")) i++; }
      else if (s[i] === ".") { i++; if (s[i] === ".") i++; if (i < b && isDigit(s[i], "1")) i++; }
      else return;
      if (i >= b) { i = b; return; }
    }
  };
  while (i < b) {
    const c = s[i];
    if (c === "$") { i += 2; continue; }
    if (c === "[") {
      if (s[i + 1] === "[") { i += 2; continue; } // [[ … ]]: delimitadores, não atributo
      const e = bracketEnd(s, i, b);
      if (e < 0) return;
      const k = hKind(s.slice(i + 1, e));
      if (k) toks.push({ from: i, to: e + 1, pos: i, kind: k, side: s[i + 1] });
      i = e + 1;
      continue;
    }
    if (BARS.includes(c)) {
      i++;
      while (i < b && (isDigit(s[i], "9") || s[i] === "?" || s[i] === ":")) i++;
      attached();
      continue;
    }
    const st = i;
    if (c === "'") {
      i++;
      if (i < b && isDigit(s[i], "1")) i++;
      toks.push({ from: st, to: i, pos: st, kind: "v" });
      continue;
    }
    if (c === "_") {
      i++;
      while (i < b && isDigit(s[i], "5")) i++;
      // os [oh|uh:…] logo depois do `_` (não os de bloco) andam com ele
      while (i < b && s[i] === "[" && s[i + 1] !== "[") {
        const e = bracketEnd(s, i, b);
        if (e < 0 || hKind(s.slice(i + 1, e)) !== "mod") break;
        i = e + 1;
      }
      toks.push({ from: st, to: i, pos: st, kind: "h" });
      continue;
    }
    if (c === ".") {
      i++;
      if (s[i] === ".") i++;
      if (i < b && isDigit(s[i], "1")) i++;
      toks.push({ from: st, to: i, pos: st, kind: "mora" });
      continue;
    }
    i++;
  }
}

/** Acha o `)` que fecha o grupo aberto em `open`, pulando colchetes ([nv:…) etc.) e `$.`. */
function findClose(s: string, open: number): number {
  for (let k = open + 1; k < s.length; k++) {
    if (s[k] === "$") { k++; continue; }
    if (s[k] === "[") {
      if (s[k + 1] === "[") { k++; continue; }
      const e = bracketEnd(s, k, s.length);
      if (e < 0) return -1;
      k = e;
    } else if (s[k] === ")") return k;
  }
  return -1;
}

/** Inícios/fins dos segmentos separados por `|` (fora de colchetes) no grupo [a,b). */
function segments(s: string, a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  let st = a;
  for (let k = a; k < b; k++) {
    if (s[k] === "$") { k++; continue; }
    if (s[k] === "[") {
      if (s[k + 1] === "[") { k++; continue; }
      const e = bracketEnd(s, k, b);
      if (e < 0) break;
      k = e;
    } else if (s[k] === "|") { out.push([st, k]); st = k + 1; }
  }
  out.push([st, b]);
  return out;
}

const HEADER_LINE = /^\s*[\w-]+\s*:.*;\s*$/;
const NABC_LINES = /^\s*nabc-lines\s*:\s*(\d+)/m;

/** Pula o texto literal de `<v>…</v>`, `<alt>…</alt>`, `<sp>…</sp>` (com `$.`); devolve o índice depois do fecho. */
function skipVerbatim(s: string, i: number): number {
  for (const t of ["v", "alt", "sp"]) {
    if (!s.startsWith(`<${t}>`, i)) continue;
    const close = `</${t}>`;
    let k = i + t.length + 2;
    while (k < s.length) {
      if (s[k] === "$") { k += 2; continue; }
      if (s.startsWith(close, k)) return k + close.length;
      k++;
    }
    return s.length;
  }
  return -1;
}

/** Varre o texto INTEIRO no contexto do Gregorio (cabeçalho, `$`, `%`, `<v>`/`<alt>`/`<sp>`, grupos,
 *  colchetes, barras, alternância gabc|nabc pelo `nabc-lines`) e remove só os sinais cuja posição cai
 *  em `window` ([from,to)); sem janela, todos. `removals` são os intervalos removidos no texto original
 *  (mudanças mínimas para o editor). */
export function scanMarks(gabc: string, kinds: MarkKinds, window?: Win): { text: string; counts: MarkCounts; removals: Removal[] } {
  const s = gabc;
  const body = bodyStart(s);
  let nabc = 1;
  if (body > 0) { const m = NABC_LINES.exec(s.slice(0, body)); if (m) nabc = Math.max(1, +m[1]); }
  let headerLike = body === 0; // sem %%: linhas `chave: valor;` antes do primeiro grupo são cabeçalho
  const toks: Tok[] = [];
  let i = body;
  while (i < s.length) {
    if (headerLike && (i === 0 || s[i - 1] === "\n")) {
      let nl = s.indexOf("\n", i);
      if (nl < 0) nl = s.length;
      const line = s.slice(i, nl).replace(/\r$/, "");
      if (HEADER_LINE.test(line)) {
        const m = NABC_LINES.exec(line);
        if (m) nabc = Math.max(1, +m[1]);
        i = nl + 1;
        continue;
      }
    }
    const c = s[i];
    if (c === "$") { i += 2; continue; } // escape na letra: $( $) $%
    if (c === "<") { const e = skipVerbatim(s, i); if (e >= 0) { i = e; continue; } }
    if (c === "%") { // comentário até o fim da linha
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl;
      continue;
    }
    if (c !== "(") { i++; continue; }
    const close = findClose(s, i);
    if (close < 0) break;
    headerLike = false;
    // gabc, nabc×N, gabc, …: só os segmentos gabc
    segments(s, i + 1, close).forEach(([a, b], j) => { if (j % (nabc + 1) === 0) scanSegment(s, a, b, toks); });
    i = close + 1;
  }

  // pontas de bloco: pareadas por lado (o/u)
  const mate = new Map<Tok, Tok>();
  const stack: Record<string, Tok[]> = {};
  for (const t of toks) {
    if (t.kind === "open") (stack[t.side!] ??= []).push(t);
    else if (t.kind === "close") { const o = stack[t.side!]?.pop(); if (o) { mate.set(o, t); mate.set(t, o); } }
  }
  const inWin = (p: number): boolean => !window || (p >= window.from && p < window.to);
  const on: Record<Tok["kind"], boolean> = {
    v: kinds.vertical, h: kinds.horizontal, mora: kinds.mora, mod: kinds.horizontal, open: kinds.horizontal, close: kinds.horizontal,
  };
  const counts: MarkCounts = { vertical: 0, horizontal: 0, mora: 0 };
  const rem: Removal[] = [];
  for (const t of toks) {
    if (!on[t.kind] || !inWin(t.pos)) continue;
    const m = mate.get(t);
    if (m && !inWin(m.pos)) continue;
    if (t.kind === "v") counts.vertical++;
    else if (t.kind === "h") counts.horizontal++;
    else if (t.kind === "mora") counts.mora++;
    rem.push({ from: t.from, to: t.to });
  }
  let text = "", pos = 0;
  for (const r of rem) { text += s.slice(pos, r.from); pos = r.to; }
  text += s.slice(pos);
  return { text, counts, removals: rem };
}

export function stripMarks(gabc: string, kinds: MarkKinds, window?: Win): { text: string; counts: MarkCounts } {
  const { text, counts } = scanMarks(gabc, kinds, window);
  return { text, counts };
}

export function detectMarks(gabc: string, window?: Win): MarkCounts {
  return scanMarks(gabc, ALL, window).counts;
}
