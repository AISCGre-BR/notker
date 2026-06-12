// test/tuotilo-signs-nabc.test.ts
// Testes TDD para enriquecimento NABC de sinais rítmicos (enrichFromNabc).
// Descritores reais extraídos de samples/03-factus-est.gabc e samples/02-kyrie.gabc.
//
// Semântica dos modificadores NABC (synopsis-neumes.json → "modifiers"):
//   "-" = episema      ">" = liquescência aumentativa    "~" = liquescência diminutiva
//   "S" = modificação do sinal   "G" = quebra neumática   "M" = modificação melódica
//
// Bases semiologicamente relevantes detectáveis:
//   or, pq, pt, oc       → "oriscus"
//   st, ds, ts, bv, tv   → "strophae"
//   ql, qi               → "quilisma" (reforço do sinal GABC)
//   > no token           → "liqAug"
//   ~ no token           → "liqDim"

import { describe, it, expect } from "vitest";
import { extractSyllable } from "../src/tuotilo/signs";

describe("tuotilo signs NABC — enriquecimento por enrichFromNabc", () => {

  // ── NABC-1: liqAug via modificador `>` ──────────────────────────────────────
  // Sílaba real: "én(ji~|vi>lst2)" — do trecho "én-tis" em Factus est (linha 2)
  // GABC: ji~ (pes + liquescência dim no gabc → ignorada v1)
  // NABC: vi>lst2 → virga com liquescência aumentativa (>)
  it("NABC-1: liqAug detectado via '>' no descritor nabc (vi>lst2)", () => {
    const r = extractSyllable("én(ji~|vi>lst2)");
    // O NABC > deve adicionar liqAug aos signs da sílaba
    expect(r.signs).toContain("liqAug");
    // pitches gabc preservados
    expect(r.pitches).toEqual(["j", "i"]);
  });

  // ── NABC-2: quilisma NABC via base `ql` ─────────────────────────────────────
  // Sílaba real: "he(f!gwh|ql)" — de "ve-he-mén-tis" em Factus est (linha 2)
  // GABC: f!gwh (notas com w = quilisma gabc)
  // NABC: ql → quilisma (confirma / reforça o sinal gabc)
  it("NABC-2: quilisma confirmado via base 'ql' no descritor nabc", () => {
    const r = extractSyllable("he(f!gwh|ql)");
    // O NABC ql deve adicionar quilisma (ou reforçar) nos signs
    expect(r.signs).toContain("quilisma");
    // pitches gabc preservados (f!gwh → f, g, w não é pitch, h)
    expect(r.pitches).toContain("f");
    expect(r.pitches).toContain("h");
  });

  // ── NABC-3: liqAug via `>` em token composto (ta>) ──────────────────────────
  // Sílaba real: "mén(hi~|ta>)" — de "ve-he-mén-tis" em Factus est (linha 2)
  // GABC: hi~ (pes + nota com ~ ignorado v1)
  // NABC: ta> → tractulus com liquescência aumentativa
  it("NABC-3: liqAug via 'ta>' (tractulus com >)", () => {
    const r = extractSyllable("mén(hi~|ta>)");
    expect(r.signs).toContain("liqAug");
    expect(r.pitches).toEqual(["h", "i"]);
  });

  // ── NABC-4: descritor sem sinal rítmico → signs só do GABC ─────────────────
  // Sílaba real: "est(i|vi)" — NABC: vi (virga simples, sem modificador)
  // Deve retornar só os signs gabc (nenhum adicional do nabc)
  it("NABC-4: descritor nabc simples (vi) não adiciona signs", () => {
    const r = extractSyllable("est(i|vi)");
    expect(r.signs).not.toContain("liqAug");
    expect(r.signs).not.toContain("liqDim");
    expect(r.signs).not.toContain("oriscus");
    expect(r.signs).not.toContain("strophae");
    // pitches preservados
    expect(r.pitches).toEqual(["i"]);
  });

  // ── NABC-5: oriscus via base `pq` em token composto ─────────────────────────
  // Sílaba real: "quén(hg/h_ih~|cllsc2pq>lst2)" — Factus est linha 6
  // NABC: cllsc2pq>lst2 → contém pq (pes quassus / oriscus) + > (liqAug)
  it("NABC-5: oriscus detectado via base 'pq' dentro de token composto (cllsc2pq>lst2)", () => {
    const r = extractSyllable("quén(hg/h_ih~|cllsc2pq>lst2)");
    expect(r.signs).toContain("oriscus");
    // Também tem liqAug pelo >
    expect(r.signs).toContain("liqAug");
  });

  // ── NABC-6: liqDim via modificador `~` no NABC ──────────────────────────────
  // Construído com base nos exemplos da sinopse (cl~ existe no catálogo stgall)
  // "do(fg|cl~)" — clivis com liquescência diminutiva
  it("NABC-6: liqDim detectado via '~' no descritor nabc (cl~)", () => {
    const r = extractSyllable("do(fg|cl~)");
    expect(r.signs).toContain("liqDim");
    expect(r.pitches).toEqual(["f", "g"]);
  });

  // ── NABC-7: signs sem duplicatas mesmo com nabc reforçando gabc ─────────────
  // GABC tem quilisma (w) e NABC também tem ql → quilisma não aparece duplicado
  it("NABC-7: quilisma não duplicado quando gabc e nabc concordam (fwg|ql)", () => {
    const r = extractSyllable("(fwg|ql)");
    const count = r.signs.filter((s) => s === "quilisma").length;
    expect(count).toBe(1);
  });

  // ── NABC-8: oriscus via base `or` simples ────────────────────────────────────
  // "x(f|or)" — oriscus direto
  it("NABC-8: oriscus via base 'or' direta", () => {
    const r = extractSyllable("x(f|or)");
    expect(r.signs).toContain("oriscus");
    expect(r.pitches).toEqual(["f"]);
  });

  // ── NABC-9: strophae via base `ds` ───────────────────────────────────────────
  // "x(ff|ds)" — distropha
  it("NABC-9: strophae detectado via base 'ds' (distropha)", () => {
    const r = extractSyllable("x(ff|ds)");
    expect(r.signs).toContain("strophae");
    expect(r.pitches).toEqual(["f", "f"]);
  });

  // ── NABC-10: strophae via base `ts` ──────────────────────────────────────────
  // "x(fff|ts)" — tristropha
  it("NABC-10: strophae detectado via base 'ts' (tristropha)", () => {
    const r = extractSyllable("x(fff|ts)");
    expect(r.signs).toContain("strophae");
  });

  // ── NABC-11: sem nabc (gabc puro) não quebra ────────────────────────────────
  it("NABC-11: sílaba sem nabc (gabc puro) continua funcionando", () => {
    const r = extractSyllable("vi(fgh)");
    expect(r.pitches).toEqual(["f", "g", "h"]);
    expect(r.signs).toEqual([]);
  });
});
