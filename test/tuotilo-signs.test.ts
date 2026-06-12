import { describe, it, expect } from "vitest";
import {
  extractSyllable,
  extractAll,
  type SyllableRhythm,
} from "../src/tuotilo/signs";

// Sintaxe gabc confirmada via nabc-lib/dist/nabc-renderer.es6.js (linhas 17943-18016):
//   pitch minúsculo a-m = punctum; maiúsculo A-M = inclinatum (currentes)
//   `_`  = episema horizontal (H_EPISEMA)
//   `.`  = punctum mora (PUNCTUM_MORA)
//   `w`  = quilisma (S_QUILISMA) — sufixo imediato após a nota
//   `-[a-m]` = initio debilis (NOTE_PUNCTUM_INITIO_DEBILIS)
//   `,`→"minor"  `;`→"maior"  `:`→"finalis"  `::`→"finalis"  `` ` ``→null (v1)

describe("tuotilo signs — extractSyllable", () => {

  // ── Teste 1: episema e mora ─────────────────────────────────────────────────
  it("1. episema em g e mora em h: vi(fg_h.)", () => {
    const r = extractSyllable("vi(fg_h.)");
    // pitches: f, g (com episema), h (com mora)
    expect(r.pitches).toEqual(["f", "g", "h"]);
    // signs da sílaba contém episema e mora
    expect(r.signs).toContain("episema");
    expect(r.signs).toContain("mora");
    // perPitchSigns por posição
    expect(r.perPitchSigns[0]).toEqual([]);           // f: sem sinal
    expect(r.perPitchSigns[1]).toContain("episema");  // g_
    expect(r.perPitchSigns[1]).not.toContain("mora");
    expect(r.perPitchSigns[2]).toContain("mora");     // h.
    expect(r.perPitchSigns[2]).not.toContain("episema");
  });

  // ── Teste 2: quilisma — sintaxe confirmada: `w` é sufixo da nota quilisma ──
  // Exemplo: "(fwg)" → f é quilisma (tem 'w' após), g é a nota seguinte
  // preQuilisma recai na nota ANTERIOR à quilisma (f), quilisma na própria (f)
  // PORÉM: no gabc real, a quilisma é a nota que CARREGA o `w`.
  // Semântica semiológica: a nota quilisma é a própria nota marcada com `w`;
  // a nota ANTERIOR a ela recebe preQuilisma (alargamento antes da quilisma).
  // Exemplo de "(efwg)": e=preQuilisma, f=quilisma, g=normal
  it("2. quilisma: (efwg) → e=preQuilisma, f=quilisma, g=normal", () => {
    // sintaxe confirmada: `w` após a letra de pitch marca aquela nota como quilisma
    const r = extractSyllable("(efwg)");
    expect(r.pitches).toEqual(["e", "f", "g"]);
    expect(r.signs).toContain("quilisma");
    expect(r.signs).toContain("preQuilisma");
    // e: preQuilisma (anterior à quilisma)
    expect(r.perPitchSigns[0]).toContain("preQuilisma");
    expect(r.perPitchSigns[0]).not.toContain("quilisma");
    // f: quilisma (tem w)
    expect(r.perPitchSigns[1]).toContain("quilisma");
    expect(r.perPitchSigns[1]).not.toContain("preQuilisma");
    // g: normal
    expect(r.perPitchSigns[2]).toEqual([]);
  });

  it("2b. quilisma na primeira nota: (fwg) → f=quilisma sem preQuilisma na sílaba", () => {
    // quando quilisma é a primeira nota, não há nota anterior → sem preQuilisma
    const r = extractSyllable("(fwg)");
    expect(r.pitches).toEqual(["f", "g"]);
    expect(r.signs).toContain("quilisma");
    expect(r.signs).not.toContain("preQuilisma");
    expect(r.perPitchSigns[0]).toContain("quilisma");
    expect(r.perPitchSigns[1]).toEqual([]);
  });

  // ── Teste 3: divisiones ─────────────────────────────────────────────────────
  it("3a. divisio minor ','", () => {
    expect(extractSyllable("(,)").divisio).toBe("minor");
  });

  it("3b. divisio maior ';'", () => {
    expect(extractSyllable("(;)").divisio).toBe("maior");
  });

  it("3c. divisio finalis ':'", () => {
    expect(extractSyllable("(:)").divisio).toBe("finalis");
  });

  it("3d. divisio finalis '::'", () => {
    expect(extractSyllable("(::)").divisio).toBe("finalis");
  });

  it("3e. virgula → divisio null (sem efeito v1)", () => {
    expect(extractSyllable("(`)").divisio).toBe(null);
  });

  it("3f. divisio: pitches vazio e signs vazio", () => {
    const r = extractSyllable("(;)");
    expect(r.pitches).toEqual([]);
    expect(r.signs).toEqual([]);
  });

  // ── Teste 4: repercussão preservada (regra do projeto: NUNCA fundir) ────────
  it("4. repercussão: a(fff) → pitches ['f','f','f']", () => {
    const r = extractSyllable("a(fff)");
    expect(r.pitches).toEqual(["f", "f", "f"]);
    expect(r.pitches).toHaveLength(3); // NUNCA fundir notas repetidas
  });

  // ── Teste 5: initio debilis ─────────────────────────────────────────────────
  it("5. initio debilis: (-fg) → f=initioDebilis, g=normal", () => {
    const r = extractSyllable("(-fg)");
    expect(r.pitches).toEqual(["f", "g"]);
    expect(r.signs).toContain("initioDebilis");
    expect(r.perPitchSigns[0]).toContain("initioDebilis");
    expect(r.perPitchSigns[1]).toEqual([]);
  });

  // ── Teste 6: currentes (maiúsculas = inclinatum) ───────────────────────────
  it("6. currentes: maiúsculas A-M marcam a nota como currentes", () => {
    const r = extractSyllable("(fGH)"); // G, H = inclinatum = currentes
    expect(r.pitches).toEqual(["f", "g", "h"]); // sempre minúsculo no output
    expect(r.signs).toContain("currentes");
    expect(r.perPitchSigns[0]).toEqual([]);         // f minúsculo: normal
    expect(r.perPitchSigns[1]).toContain("currentes"); // G maiúsculo
    expect(r.perPitchSigns[2]).toContain("currentes"); // H maiúsculo
  });

  // ── Teste 7: gabc sem texto (sílaba apenas com gabc) ──────────────────────
  it("7. gabc puro sem texto: (fgh) → pitches ['f','g','h']", () => {
    const r = extractSyllable("(fgh)");
    expect(r.pitches).toEqual(["f", "g", "h"]);
    expect(r.signs).toEqual([]);
    expect(r.divisio).toBe(null);
  });

  // ── Teste 8: símbolos desconhecidos ignorados sem quebrar ──────────────────
  it("8. símbolos desconhecidos ignorados: (f~g>h)", () => {
    const r = extractSyllable("(f~g>h)");
    expect(r.pitches).toEqual(["f", "g", "h"]);
    expect(r.signs).toEqual([]);
  });

  // ── Teste 9: combinação de episema com mora na mesma nota ──────────────────
  it("9. episema + mora na mesma nota: (f_.g)", () => {
    const r = extractSyllable("(f_.g)");
    // f tem episema E mora; g sem nada
    expect(r.pitches).toEqual(["f", "g"]);
    expect(r.perPitchSigns[0]).toContain("episema");
    expect(r.perPitchSigns[0]).toContain("mora");
    expect(r.perPitchSigns[1]).toEqual([]);
  });

  // ── Teste 10: signs não tem duplicatas ────────────────────────────────────
  it("10. signs sem duplicatas mesmo com múltiplos episemas", () => {
    const r = extractSyllable("(f_g_h)");
    const count = r.signs.filter((s) => s === "episema").length;
    expect(count).toBe(1); // episema só aparece uma vez no array signs
  });
});

// ── Teste 11: extractAll com wordFinal ────────────────────────────────────────
describe("tuotilo signs — extractAll", () => {
  it("11. wordFinal por sílaba em doc multi-palavra", () => {
    // Duas palavras: "Ky(f)ri(gh)e(h) le(f)i(g)"
    // Palavra 1: Ky-ri-e → só a última sílaba "e" é wordFinal
    // Palavra 2: le-i → só "i" é wordFinal
    //
    // syllableSpans produziria algo como:
    //   idx=0 (clave), 1..N sílabas reais
    // Para este teste injetamos o map manualmente.
    const doc = "(c4) Ky(f)ri(gh)e(h) le(f)i(g)";
    // SyllableSource: {syllableIndex, from, to}
    // Usando nabc-lib.syllableSpans manualmente:
    // (c4) → idx 0; Ky(f) → 1; ri(gh) → 2; e(h) → 3; le(f) → 4; i(g) → 5
    const map = [
      { syllableIndex: 0, from: 0, to: 4 },    // (c4)
      { syllableIndex: 1, from: 5, to: 10 },   // Ky(f)   "Ky(f)"
      { syllableIndex: 2, from: 10, to: 16 },  // ri(gh)
      { syllableIndex: 3, from: 16, to: 20 },  // e(h)     → fim "e(h) " = wordFinal
      { syllableIndex: 4, from: 21, to: 26 },  // le(f)
      { syllableIndex: 5, from: 26, to: 30 },  // i(g)     → fim doc = wordFinal
    ];
    const results = extractAll(doc, map);
    // clave (índice 0) não é sílaba real → extractAll pula syllableIndex===0
    // retorna apenas as sílabas reais 1..5
    expect(results).toHaveLength(5);
    // sílaba "Ky" (idx1): próximo char após ")" é 'r' de "ri" → NOT wordFinal
    expect(results[0].wordFinal).toBe(false);
    // sílaba "ri" (idx2): próximo char após ")" é 'e' de "e" → NOT wordFinal
    expect(results[1].wordFinal).toBe(false);
    // sílaba "e" (idx3): próximo char após ")" é ' ' → wordFinal
    expect(results[2].wordFinal).toBe(true);
    // sílaba "le" (idx4): próximo char após ")" é 'i' de "i" → NOT wordFinal
    expect(results[3].wordFinal).toBe(false);
    // sílaba "i" (idx5): fim de doc → wordFinal
    expect(results[4].wordFinal).toBe(true);
  });

  it("11b. extractAll retorna pitches e signs corretos para cada sílaba", () => {
    const doc = "(c4) a(fg_)b(h.)";
    const map = [
      { syllableIndex: 0, from: 0, to: 4 },   // (c4)
      { syllableIndex: 1, from: 5, to: 11 },  // a(fg_)
      { syllableIndex: 2, from: 11, to: 16 }, // b(h.)
    ];
    const results = extractAll(doc, map);
    expect(results).toHaveLength(2);
    // sílaba 1: "a(fg_)" → pitches f,g; g tem episema
    expect(results[0].pitches).toEqual(["f", "g"]);
    expect(results[0].signs).toContain("episema");
    // sílaba 2: "b(h.)" → pitches h; h tem mora
    expect(results[1].pitches).toEqual(["h"]);
    expect(results[1].signs).toContain("mora");
  });
});
