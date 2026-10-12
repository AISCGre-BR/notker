// Remoção de episemas verticais, episemas horizontais e moras (punctum mora) do gabc.
// Sintaxe de Gregorio v6.2.0 (doc/Gabc.tex): vertical ' '0 '1; horizontal _ (+dígito 0-5)
// e modificadores [oh:…] [uh:…] (inclusive blocos [oh:…{] … [oh}]); mora . ou .. (+0/1).
// Só dentro de grupos (…) do corpo, só antes do primeiro `|` (o nabc não é tocado).
// Varredura por caracteres, sem regex.

export interface MarkKinds { vertical: boolean; horizontal: boolean; mora: boolean }
export interface MarkCounts { vertical: number; horizontal: number; mora: number }

const ALL: MarkKinds = { vertical: true, horizontal: true, mora: true };

/** Índice onde o corpo começa (depois da linha `%%`); 0 se não houver cabeçalho. */
function bodyStart(gabc: string): number {
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
function stripGroup(g: string, kinds: MarkKinds, counts: MarkCounts): string {
  let out = "";
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === "[") {
      const end = g.indexOf("]", i);
      if (end < 0) { out += g.slice(i); break; }
      const inner = g.slice(i + 1, end);
      const isH = inner.startsWith("oh") || inner.startsWith("uh");
      if (isH && kinds.horizontal) { i = end + 1; continue; } // modificador do episema: não conta
      out += g.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (c === "'" && kinds.vertical) {
      counts.vertical++;
      i++;
      if (isDigit(g[i], "1")) i++;
      continue;
    }
    if (c === "_" && kinds.horizontal) {
      counts.horizontal++;
      i++;
      while (isDigit(g[i], "5")) i++;
      continue;
    }
    if (c === "." && kinds.mora) {
      counts.mora++;
      i++;
      if (g[i] === ".") i++;
      if (isDigit(g[i], "1")) i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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

export function stripMarks(gabc: string, kinds: MarkKinds): { text: string; counts: MarkCounts } {
  const counts: MarkCounts = { vertical: 0, horizontal: 0, mora: 0 };
  const start = bodyStart(gabc);
  let out = gabc.slice(0, start);
  let i = start;
  while (i < gabc.length) {
    const c = gabc[i];
    if (c === "$") { out += gabc.slice(i, i + 2); i += 2; continue; } // escape na letra: $( $) $%
    if (c === "%") { // comentário até o fim da linha
      let nl = gabc.indexOf("\n", i);
      if (nl < 0) nl = gabc.length;
      out += gabc.slice(i, nl);
      i = nl;
      continue;
    }
    if (c !== "(") { out += c; i++; continue; }
    const close = findClose(gabc, i);
    if (close < 0) { out += gabc.slice(i); break; }
    const inner = gabc.slice(i + 1, close);
    // `|` dentro de colchetes não separa o nabc: acha o primeiro `|` fora deles
    let bar = -1;
    for (let k = 0; k < inner.length; k++) {
      if (inner[k] === "[") { const e = inner.indexOf("]", k); if (e < 0) break; k = e; }
      else if (inner[k] === "|") { bar = k; break; }
    }
    const g = bar < 0 ? inner : inner.slice(0, bar);
    out += "(" + (isBar(g) ? g : stripGroup(g, kinds, counts)) + (bar < 0 ? "" : inner.slice(bar)) + ")";
    i = close + 1;
  }
  return { text: out, counts };
}

export function detectMarks(gabc: string): MarkCounts {
  return stripMarks(gabc, ALL).counts;
}
