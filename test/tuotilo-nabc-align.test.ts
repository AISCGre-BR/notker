// test/tuotilo-nabc-align.test.ts
// TDD — tabela base NABC → nº de notas e parser de glifos (Tuotilo v2, spec §3).
// Fontes da tabela: GregorioNabcRef.tex (Gregorio v6.2.0) tabela St. Gall
// (linhas 207–238), Cardine St. Gall (508–545), Cardine Laon (559–592);
// cross-check gregoriotex-nabc.lua:120 e nabc-renderer.es6.js:18030–18048.
import { describe, it, expect } from "vitest";
import { NOTE_COUNTS, parseNabcToken, alignSegment } from "../src/tuotilo/nabc-align";

describe("NOTE_COUNTS — tabela canônica", () => {
  it("A1. bases de 1 nota", () => {
    for (const b of ["vi", "pu", "ta", "gr", "st", "or", "un", "ql", "qi"]) {
      expect(NOTE_COUNTS[b], b).toBe(1);
    }
  });
  it("A2. bases de 2 notas", () => {
    for (const b of ["cl", "pe", "ds", "bv", "pr", "pi", "vs", "pq", "pt", "oc"]) {
      expect(NOTE_COUNTS[b], b).toBe(2);
    }
  });
  it("A3. bases de 3 notas", () => {
    for (const b of ["po", "to", "ci", "sc", "ts", "tg", "tv", "sa"]) {
      expect(NOTE_COUNTS[b], b).toBe(3);
    }
  });
  it("A4. bases de 4 notas", () => {
    for (const b of ["pf", "sf", "tr"]) expect(NOTE_COUNTS[b], b).toBe(4);
  });
  it("A5. ni = 0 (base artificial, só porta letras significativas)", () => {
    expect(NOTE_COUNTS["ni"]).toBe(0);
  });
  it("A6. pv NÃO está na tabela (base órfã — risco nº 10 do spec)", () => {
    expect(NOTE_COUNTS["pv"]).toBeUndefined();
  });
});

describe("parseNabcToken — glifos e contagem", () => {
  it("B1. vi → 1 glifo, 1 nota, sem sinais", () => {
    const g = parseNabcToken("vi");
    expect(g).not.toBeNull();
    expect(g!).toHaveLength(1);
    expect(g![0].perNote).toEqual([[]]);
  });
  it("B2. cl- → clivis com episema nas 2 notas", () => {
    const g = parseNabcToken("cl-")!;
    expect(g[0].perNote).toEqual([["episema"], ["episema"]]);
  });
  it("B3. ds → strophae nas 2 notas", () => {
    const g = parseNabcToken("ds")!;
    expect(g[0].perNote).toEqual([["strophae"], ["strophae"]]);
  });
  it("B4. or → oriscus; pq → oriscus em 2 notas", () => {
    expect(parseNabcToken("or")![0].perNote).toEqual([["oriscus"]]);
    expect(parseNabcToken("pq")![0].perNote).toHaveLength(2);
    expect(parseNabcToken("pq")![0].perNote[0]).toContain("oriscus");
  });
  it("B5. su soma notas DEPOIS da base: tosut1 → 3+1 notas (sut1 = tractulus simples)", () => {
    const g = parseNabcToken("tosut1")!;
    expect(g[0].perNote).toHaveLength(4);
    expect(g[0].perNote[3]).toEqual([]); // t = tractulus, sem sinal
  });
  it("B6. pp soma notas ANTES da base: vippt1 → 1+1 notas, extra na frente", () => {
    const g = parseNabcToken("vippt1")!;
    expect(g[0].perNote).toHaveLength(2);
    expect(g[0].perNote[0]).toEqual([]); // praepunctis primeiro (ordem melódica)
  });
  it("B7. letra u/v/y no su adiciona episema às notas acrescidas: clsuu2", () => {
    const g = parseNabcToken("clsuu2")!;
    expect(g[0].perNote).toHaveLength(4);
    expect(g[0].perNote[2]).toEqual(["episema"]);
    expect(g[0].perNote[3]).toEqual(["episema"]);
  });
  it("B8. ci1/sc1 = +1 nota (Cardine 524–525); to2 = variante de forma, sem mudança", () => {
    expect(parseNabcToken("ci1")![0].perNote).toHaveLength(4);
    expect(parseNabcToken("sc1")![0].perNote).toHaveLength(4);
    expect(parseNabcToken("to2")![0].perNote).toHaveLength(3);
  });
  it("B9. strip de ls/lt, pitch h[a-m] e barras: vihglsc2 → 1 nota", () => {
    expect(parseNabcToken("vihglsc2")![0].perNote).toEqual([[]]);
  });
  it("B10. base desconhecida → null (chamador recua ao fallback)", () => {
    expect(parseNabcToken("zz")).toBeNull();
    expect(parseNabcToken("vizz")).toBeNull();
  });
  it("B11. token real do Dies: toS2sut1lsi2lsal2 → 4 notas, sem sinal espúrio", () => {
    const g = parseNabcToken("toS2sut1lsi2lsal2")!;
    const flat = g.flatMap((x) => x.perNote);
    expect(flat).toHaveLength(4);
    expect(flat.flat()).toEqual([]);
  });
  it("B12. modificadores > e ~ nas notas do glifo: pe> e cl~", () => {
    expect(parseNabcToken("pe>")![0].perNote[0]).toContain("liqAug");
    expect(parseNabcToken("cl~")![0].perNote[1]).toContain("liqDim");
  });
  it("B13. ql isolado = 1 nota com quilisma (compostos chegam via '!')", () => {
    const g = parseNabcToken("ql")!;
    expect(g[0].perNote).toEqual([["quilisma"]]);
  });
  it("B14. letra x no su = strophae; letra q = quilisma (nas notas acrescidas)", () => {
    const gx = parseNabcToken("clsux1")!;
    expect(gx[0].perNote).toHaveLength(3);
    expect(gx[0].perNote[2]).toEqual(["strophae"]);
    const gq = parseNabcToken("clsuq1")!;
    expect(gq[0].perNote[2]).toEqual(["quilisma"]);
  });
  it("B15. liqAug/liqDim distribuídos a TODAS as notas da base: pe> e cl~", () => {
    const aug = parseNabcToken("pe>")![0].perNote;
    expect(aug[0]).toContain("liqAug");
    expect(aug[1]).toContain("liqAug");
    const dim = parseNabcToken("cl~")![0].perNote;
    expect(dim[0]).toContain("liqDim");
    expect(dim[1]).toContain("liqDim");
  });
  it("B16. qi (quilisma 2 loops) = 1 nota com quilisma; ni no parser = glifo sem notas", () => {
    expect(parseNabcToken("qi")![0].perNote).toEqual([["quilisma"]]);
    const ni = parseNabcToken("ni")!;
    expect(ni).toHaveLength(1);
    expect(ni[0].perNote).toEqual([]);
  });
});

describe("alignSegment — alinhamento com fallback (D3)", () => {
  it("C1. contagem bate → sinais por nota, aligned=true: 2 notas × cl-", () => {
    const a = alignSegment(2, "cl-");
    expect(a.aligned).toBe(true);
    expect(a.perNote).toEqual([["episema"], ["episema"]]);
  });
  it("C2. composto com '!': 4 notas × cl!pe → aligned, sem sinais", () => {
    const a = alignSegment(4, "cl!pe");
    expect(a.aligned).toBe(true);
    expect(a.perNote).toEqual([[], [], [], []]);
  });
  it("C3. sinal vai ao glifo certo: 4 notas × cl-!pe → episema só nas 2 primeiras", () => {
    const a = alignSegment(4, "cl-!pe");
    expect(a.perNote).toEqual([["episema"], ["episema"], [], []]);
  });
  it("C4. contagem diverge → borrão (união) em todas, aligned=false: 3 notas × vi-", () => {
    const a = alignSegment(3, "vi-");
    expect(a.aligned).toBe(false);
    for (const pn of a.perNote) expect(pn).toContain("episema");
  });
  it("C5. token vazio/null → tudo vazio, aligned=true", () => {
    expect(alignSegment(2, null)).toEqual({ perNote: [[], []], aligned: true });
    expect(alignSegment(1, "  ")).toEqual({ perNote: [[]], aligned: true });
  });
  it("C6. base desconhecida → borrão com sinais detectáveis: 2 notas × zz-", () => {
    const a = alignSegment(2, "zz-");
    expect(a.aligned).toBe(false);
    for (const pn of a.perNote) expect(pn).toContain("episema");
  });
  it("C7. ds alinhado: 2 notas → strophae nas duas, aligned=true", () => {
    const a = alignSegment(2, "ds");
    expect(a.aligned).toBe(true);
    expect(a.perNote).toEqual([["strophae"], ["strophae"]]);
  });
  it("C8. ni (0 notas) compõe sem consumir: 2 notas × ni!cl → aligned", () => {
    const a = alignSegment(2, "ni!cl");
    expect(a.aligned).toBe(true);
    expect(a.perNote).toHaveLength(2);
  });
});
