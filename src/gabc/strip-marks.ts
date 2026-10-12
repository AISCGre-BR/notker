// Remoção de episemas verticais, episemas horizontais e moras (punctum mora) do gabc.
// Sintaxe de Gregorio v6.2.0 (doc/Gabc.tex): vertical ' '0 '1; horizontal _ (+dígito 0-5)
// e modificadores [oh:…] [uh:…] (inclusive blocos [oh:…{] … [oh}]); mora . ou .. (+0/1).
// Só dentro de grupos (…) do corpo, só antes do primeiro `|` (o nabc não é tocado).
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

/** Processa a parte gabc de um grupo (sem os parênteses e sem o nabc). */
interface Win { from: number; to: number }
export interface Removal { from: number; to: number }

function stripGroup(g: string, base: number, kinds: MarkKinds, counts: MarkCounts, rem: Removal[], win?: Win): void {
  const inWin = (p: number): boolean => !win || (p >= win.from && p < win.to);
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === "[") {
      const end = g.indexOf("]", i);
      if (end < 0) break;
      const inner = g.slice(i + 1, end);
      const isH = inner.startsWith("oh") || inner.startsWith("uh");
      if (isH && kinds.horizontal && inWin(base + i)) rem.push({ from: base + i, to: base + end + 1 }); // modificador do episema: não conta
      i = end + 1;
      continue;
    }
    const st = i;
    if (c === "'" && kinds.vertical) {
      i++;
      if (isDigit(g[i], "1")) i++;
      if (inWin(base + st)) { counts.vertical++; rem.push({ from: base + st, to: base + i }); }
      continue;
    }
    if (c === "_" && kinds.horizontal) {
      i++;
      while (isDigit(g[i], "5")) i++;
      if (inWin(base + st)) { counts.horizontal++; rem.push({ from: base + st, to: base + i }); }
      continue;
    }
    if (c === "." && kinds.mora) {
      i++;
      if (g[i] === ".") i++;
      if (isDigit(g[i], "1")) i++;
      if (inWin(base + st)) { counts.mora++; rem.push({ from: base + st, to: base + i }); }
      continue;
    }
    i++;
  }
}

/** Acha o `)` que fecha o grupo aberto em `open`, pulando colchetes ([nv:…) etc.). */
function findClose(s: string, open: number): number {
  for (let k = open + 1; k < s.length; k++) {
    if (s[k] === "[") { const e = s.indexOf("]", k); if (e < 0) return -1; k = e; }
    else if (s[k] === ")") return k;
  }
  return -1;
}

/** Barras (`, ; : ^ \``) ficam intactas: nelas `_` é "bar brace", não episema. */
function isBar(gabcPart: string): boolean {
  const t = gabcPart.replace(/\s+/g, "");
  return t[0] === "`" || t[0] === "^" || t[0] === "," || t[0] === ";" || t[0] === ":";
}

/** Varre o texto INTEIRO (mesmo contexto: corpo, `$`, `%`, grupos, colchetes, barras, nabc) e remove
 *  só os sinais cuja posição cai em `window` ([from,to)); sem janela, todos. `removals` são os
 *  intervalos removidos no texto original (mudanças mínimas para o editor). */
export function scanMarks(gabc: string, kinds: MarkKinds, window?: Win): { text: string; counts: MarkCounts; removals: Removal[] } {
  const counts: MarkCounts = { vertical: 0, horizontal: 0, mora: 0 };
  const rem: Removal[] = [];
  let i = bodyStart(gabc);
  while (i < gabc.length) {
    const c = gabc[i];
    if (c === "$") { i += 2; continue; } // escape na letra: $( $) $%
    if (c === "%") { // comentário até o fim da linha
      const nl = gabc.indexOf("\n", i);
      i = nl < 0 ? gabc.length : nl;
      continue;
    }
    if (c !== "(") { i++; continue; }
    const close = findClose(gabc, i);
    if (close < 0) break;
    const inner = gabc.slice(i + 1, close);
    // `|` dentro de colchetes não separa o nabc: acha o primeiro `|` fora deles
    let bar = -1;
    for (let k = 0; k < inner.length; k++) {
      if (inner[k] === "[") { const e = inner.indexOf("]", k); if (e < 0) break; k = e; }
      else if (inner[k] === "|") { bar = k; break; }
    }
    const g = bar < 0 ? inner : inner.slice(0, bar);
    if (!isBar(g)) stripGroup(g, i + 1, kinds, counts, rem, window);
    i = close + 1;
  }
  let text = "", pos = 0;
  for (const r of rem) { text += gabc.slice(pos, r.from); pos = r.to; }
  text += gabc.slice(pos);
  return { text, counts, removals: rem };
}

export function stripMarks(gabc: string, kinds: MarkKinds, window?: Win): { text: string; counts: MarkCounts } {
  const { text, counts } = scanMarks(gabc, kinds, window);
  return { text, counts };
}

export function detectMarks(gabc: string, window?: Win): MarkCounts {
  return scanMarks(gabc, ALL, window).counts;
}
