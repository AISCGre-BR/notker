/** nabc-align.ts — Alinhamento glifo NABC → notas gabc (Tuotilo v2, spec §3).
 *
 * Tabela de contagem por base (St. Gall + bases Laon usadas no projeto).
 * Fontes: GregorioNabcRef.tex (vendor Gregorio v6.2.0) — tabela St. Gall
 * (linhas 207–238), tabela Cardine St. Gall (508–545), tabela Cardine Laon
 * (559–592); cross-check: gregoriotex-nabc.lua:120 (gregallneumekinds) e
 * nabc-renderer.es6.js:18030–18048 (NABC_BASIC_GLYPH_GALL + regra su/pp:
 * "number represents number of repetitions").
 *
 * Decisões do spec: ql/qi isolados = 1 nota (compostos chegam via `!`);
 * ci1/sc1 = +1 nota; demais dígitos pós-base = variante de forma; `ni` = 0;
 * `pv` (base órfã sem documentação pública) fica FORA → fallback.
 */
import type { RhythmSign } from "./signs";

// ── Tabela canônica base → número de notas ──────────────────────────────────

/** Número de notas cobertas por cada base NABC.
 *  Bases St. Gall (gregoriotex-nabc.lua:120) e Laon (GregorioNabcRef §559–592).
 *  `ni` = 0 (base artificial que só carrega letras significativas).
 *  `pv` deliberadamente ausente (base órfã — risco nº 10 do spec). */
export const NOTE_COUNTS: Record<string, number> = {
  // 1 nota
  vi: 1, pu: 1, ta: 1, gr: 1, st: 1, or: 1, un: 1, ql: 1, qi: 1,
  // 2 notas
  cl: 2, pe: 2, ds: 2, bv: 2, pr: 2, pi: 2, vs: 2, pq: 2, pt: 2, oc: 2,
  // 3 notas
  po: 3, to: 3, ci: 3, sc: 3, ts: 3, tg: 3, tv: 3, sa: 3,
  // 4 notas
  pf: 4, sf: 4, tr: 4,
  // base artificial (sem notas musicais)
  ni: 0,
};

// ── Conjuntos semiológicos ──────────────────────────────────────────────────

/** Bases que indicam oriscus (GregorioNabcRef; nabc-renderer.es6.js:18030). */
const ORISCUS_BASES  = new Set(["or", "pq", "pt", "oc"]);

/** Bases que indicam strophae/apostropha e compostos. */
const STROPHAE_BASES = new Set(["st", "ds", "ts", "bv", "tv"]);

/** Bases que indicam quilisma (St. Gall e Laon). */
const QUILISMA_BASES = new Set(["ql", "qi"]);

// ── Tipos exportados ────────────────────────────────────────────────────────

/** Glifo NABC com notas e sinais por nota em ordem melódica:
 *  praepunctis (pp) → notas da base → subpunctis (su). */
export interface NabcGlyph {
  base: string;
  /** Sinais por nota coberta, em ordem melódica. */
  perNote: RhythmSign[][];
}

// ── Helpers internos ────────────────────────────────────────────────────────

/** Sinais inerentes à base (aplicados a TODAS as notas da base). */
function baseSigns(base: string): RhythmSign[] {
  const s: RhythmSign[] = [];
  if (ORISCUS_BASES.has(base))  s.push("oriscus");
  if (STROPHAE_BASES.has(base)) s.push("strophae");
  if (QUILISMA_BASES.has(base)) s.push("quilisma");
  return s;
}

/** Sinais das notas acrescidas por su/pp conforme a letra modificadora.
 *  (GregorioNabcRef §270–291: t=tractulus, u=tractulus c/ episema, v=duplo
 *  episema, w=gravis, x=stropha liquescens, y=gravis c/ episema; Laon §437–447:
 *  n=uncinus, q=quilisma, z=virga). */
function extraNoteSigns(letter: string | undefined): RhythmSign[] {
  if (letter === "u" || letter === "v" || letter === "y") return ["episema"];
  if (letter === "x") return ["strophae"];
  if (letter === "q") return ["quilisma"];
  // w (gravis), t (tractulus) e demais: sem sinal rítmico na v2
  return [];
}

/** Remove o que não é glifo: pitch relativo h[a-m] e ajustes de espaçamento.
 *  Letras significativas (ls/lt) são consumidas no laço principal para evitar
 *  conflito com a base `cl` seguida de `su` (ex.: `clsuu2` ≠ `cl` + `lsuu2`). */
function stripNonGlyph(token: string): string {
  // Remove pitch relativo: h[a-m]
  let s = token.replace(/h[a-m]/g, "");
  // Remove ajustes de espaçamento horizontal
  s = s.replace(/[/`]+/g, "");
  return s;
}

// ── Parser principal ────────────────────────────────────────────────────────

/** Analisa um token NABC (trecho entre separadores `!`) e retorna os glifos
 *  com suas notas e sinais em ordem melódica.
 *
 *  Retorna `null` se encontrar uma base de 2 letras minúsculas desconhecida
 *  (sinal para o chamador recuar ao fallback de nível de sílaba).
 *
 *  Ordem de processamento após a base:
 *    1. Dígito imediato → variante de forma (ci1/sc1 = +1 nota, outros ignoram)
 *    2. su[letra][n] → subpunctis (notas DEPOIS da base, na ordem melódica)
 *    3. pp[letra][n] → praepunctis (notas ANTES da base, na ordem melódica)
 *    4. Letras significativas ls/lt[letras][n] → ignoradas (sem nota)
 *    5. Modificadores de glifo: `-` episema, `>` liqAug, `~` liqDim
 *    6. Modificadores visuais: S/G/M (com dígito opcional) — ignorados */
export function parseNabcToken(token: string): NabcGlyph[] | null {
  const s = stripNonGlyph(token);
  const glyphs: NabcGlyph[] = [];
  let i = 0;

  while (i < s.length) {
    // Maiúsculas soltas (S, G, M como modificadores fora de base) — pula c/ dígito
    if (/^[A-Z]$/.test(s[i] ?? "")) {
      i++;
      if (/[0-9]/.test(s[i] ?? "")) i++;
      continue;
    }

    // Tentar ler base de 2 letras minúsculas
    const pair = s.slice(i, i + 2);
    if (!/^[a-z]{2}$/.test(pair)) {
      // Caractere solto (dígito órfão, símbolo) — pula
      i++;
      continue;
    }

    const count = NOTE_COUNTS[pair];
    if (count === undefined) {
      // Base de 2 letras desconhecida → chamador recua ao fallback
      return null;
    }

    const base = pair;
    i += 2;
    let noteCount = count;
    const ownSigns: RhythmSign[] = baseSigns(base);

    // Acúmulo de notas praepunctis (chegam antes da base em ordem melódica)
    const pre: RhythmSign[][] = [];
    // Acúmulo de notas subpunctis (chegam depois da base em ordem melódica)
    const post: RhythmSign[][] = [];

    // 1. Dígito imediato pós-base: variante de forma
    //    Exceção documentada: ci1 e sc1 = +1 nota (Cardine St. Gall 524–525)
    if (/[0-9]/.test(s[i] ?? "")) {
      if ((base === "ci" || base === "sc") && s[i] === "1") noteCount += 1;
      i++;
    }

    // 2–6. Modificadores em qualquer ordem após a base (e após o dígito de variante)
    for (;;) {
      // su[letra]?[n] — subpunctis: n notas extras DEPOIS da base
      const spSu = /^su([tuvwxynqz])?([1-9])/.exec(s.slice(i));
      if (spSu) {
        const extras = extraNoteSigns(spSu[1]);
        const n = Number(spSu[2]);
        for (let k = 0; k < n; k++) post.push([...extras]);
        i += spSu[0].length;
        continue;
      }

      // pp[letra]?[n] — praepunctis: n notas extras ANTES da base
      const spPp = /^pp([tuvwxynqz])?([1-9])/.exec(s.slice(i));
      if (spPp) {
        const extras = extraNoteSigns(spPp[1]);
        const n = Number(spPp[2]);
        for (let k = 0; k < n; k++) pre.push([...extras]);
        i += spPp[0].length;
        continue;
      }

      // l[st][letras][dígito] — letra significativa: porta texto, sem nota musical
      // Consumida aqui (não em stripNonGlyph) para não conflitar com bases precedentes
      const spLs = /^l[st][a-z]+[0-9]/.exec(s.slice(i));
      if (spLs) {
        i += spLs[0].length;
        continue;
      }

      // Modificadores de glifo (GregorioNabcRef §241–250):
      //   "-"  = episema (fonte primária do ritmo — St. Gall/Laon)
      //   ">"  = liquescência aumentativa (afeta todas as notas da base)
      //   "~"  = liquescência diminutiva (afeta todas as notas da base)
      const ch = s[i];
      if (ch === "-") { ownSigns.push("episema"); i++; continue; }
      if (ch === ">") { ownSigns.push("liqAug");  i++; continue; }
      if (ch === "~") { ownSigns.push("liqDim");  i++; continue; }

      // Modificadores visuais S/G/M com dígito opcional — ignorados v2
      if (ch === "S" || ch === "G" || ch === "M") {
        i++;
        if (/[0-9]/.test(s[i] ?? "")) i++;
        continue;
      }

      break;
    }

    // Monta perNote: distribui todos os sinais da base para CADA nota da base.
    // Líquescência (liqAug/liqDim) é propriedade do glifo inteiro — distribuída
    // a todas as notas da base (o alinhador da Task 3 refinará se necessário).
    const deduped = Array.from(new Set(ownSigns));
    const baseNotes: RhythmSign[][] = Array.from({ length: noteCount }, () => [
      ...deduped,
    ]);

    glyphs.push({
      base,
      perNote: [...pre, ...baseNotes, ...post],
    });
  }

  return glyphs;
}
