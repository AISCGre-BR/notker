// test/tuotilo-signs-interleave.test.ts
// TDD — segmentos gabc|nabc intercalados em melismas plurissônicos.
//
// GABC real: quando um melisma é longo, o conteúdo do grupo `(...)` intercala
// segmentos na forma `gabc0|nabc0|gabc1|nabc1|...`
// Índices PARES  = gabc  (concatenar para obter as notas)
// Índices ÍMPARES = nabc (alimentar enrichFromNabc)
//
// Fonte dos exemplos: samples/04-dies-sanctificatus.gabc, linha 3:
//   Di(f_e|/cl|/f!gwh!iv|`qlheppt1vi-hk|//ji/ihi|///cl!pivi)
//   es(iv.|vi-|hh|//ds-hg|/fgf.|//to)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { extractSyllable, extractAll } from "../src/tuotilo/signs";
import { syllableSpans } from "../src/preview/nabc-lib";

describe("tuotilo signs — segmentos gabc|nabc intercalados", () => {

  // ── Teste INTER-1: sílaba "Di" com 6 segmentos (3 gabc + 3 nabc) ─────────────
  // Conteúdo: f_e|/cl|/f!gwh!iv|`qlheppt1vi-hk|//ji/ihi|///cl!pivi
  // Segmentos: [f_e, /cl, /f!gwh!iv, `qlheppt1vi-hk, //ji/ihi, ///cl!pivi]
  // gabc (pares 0,2,4): "f_e" + "/f!gwh!iv" + "//ji/ihi"
  // nabc (ímpares 1,3,5): "/cl" + "`qlheppt1vi-hk" + "///cl!pivi"
  //
  // Pitches esperados: f e f g h i j i i h i  (11 notas)
  //   f_e   → f(episema) e
  //   /f!gwh!iv → f, g(quilisma via w), h, i  (v ignorado; !percurso ignorado)
  //   //ji/ihi  → j, i, i, h, i
  it("INTER-1: Di(...) com 6 segmentos intercalados → 11 pitches", () => {
    const src = "Di(f_e|/cl|/f!gwh!iv|`qlheppt1vi-hk|//ji/ihi|///cl!pivi)";
    const r = extractSyllable(src);

    expect(r.pitches).toHaveLength(11);
    expect(r.pitches).toEqual(["f", "e", "f", "g", "h", "i", "j", "i", "i", "h", "i"]);

    // Sinais: episema (f_), quilisma (gw), preQuilisma (f antes de gw)
    expect(r.signs).toContain("episema");
    expect(r.signs).toContain("quilisma");
    expect(r.signs).toContain("preQuilisma");
  });

  // ── Teste INTER-2: sílaba "es" com 6 segmentos (3 gabc + 3 nabc) ─────────────
  // Conteúdo: iv.|vi-|hh|//ds-hg|/fgf.|//to
  // Segmentos: [iv., vi-, hh, //ds-hg, /fgf., //to]
  // gabc (pares 0,2,4): "iv." + "hh" + "/fgf."
  // nabc (ímpares 1,3,5): "vi-" + "//ds-hg" + "//to"
  //
  // Pitches esperados: i h h f g f  (6 notas)
  //   iv.  → i(mora)   (v ignorado)
  //   hh   → h h
  //   /fgf. → f g f(mora)
  //
  // Sinais: mora (iv. e fgf.), strophae (nabc ds no segmento 3 = "//ds-hg")
  it("INTER-2: es(...) com 6 segmentos intercalados → 6 pitches e strophae", () => {
    const src = "es(iv.|vi-|hh|//ds-hg|/fgf.|//to)";
    const r = extractSyllable(src);

    expect(r.pitches).toHaveLength(6);
    expect(r.pitches).toEqual(["i", "h", "h", "f", "g", "f"]);

    // mora: presente em iv. e /fgf.
    expect(r.signs).toContain("mora");

    // strophae: base "ds" no segmento nabc "//ds-hg"
    expect(r.signs).toContain("strophae");
  });

  // ── Teste INTER-3: regressão — forma simples (1 pipe) permanece ídêntica ──────
  // "Ro(fg|vihh)" → gabc="fg", nabc="vihh"
  // O "hh" do nabc NÃO vira pitch; nabc "vi" = virga, "hh" é pitch relativo → ignorado
  it("INTER-3: regressão forma simples (fg|vihh) → pitches ['f','g'] sem contaminação", () => {
    const r = extractSyllable("Ro(fg|vihh)");
    expect(r.pitches).toEqual(["f", "g"]);
    // "hh" do nabc não deve virar pitch
    expect(r.pitches).not.toContain("h");
  });

  // ── Teste INTER-4: extractAll no arquivo completo ─────────────────────────────
  // Nenhuma sílaba real (syllableIndex >=1) com texto E parênteses não-divisio
  // pode ter 0 pitches.  A sílaba "Di" em particular deve ter 11 notas.
  it("INTER-4: extractAll em 04-dies-sanctificatus.gabc — sem sílaba real com 0 pitches", () => {
    const doc = readFileSync(
      resolve(__dirname, "../samples/04-dies-sanctificatus.gabc"),
      "utf8",
    );
    const spans = syllableSpans(doc);
    const rhythms = extractAll(doc, spans);

    // Nenhuma sílaba com texto (não-divisio) deve ter 0 pitches
    const zeroPitch = rhythms.filter((r) => {
      // divisio legítima tem pitches=[] e divisio !== null
      return r.pitches.length === 0 && r.divisio === null;
    });
    expect(zeroPitch).toHaveLength(0);

    // A sílaba "Di" tem 11 notas.
    // syllableSpans inclui o texto anterior no `from`, então o span que contém "Di("
    // é o que tem `to` logo após o fechamento de `Di(...)`.
    // Identificar pelo conteúdo extraído do doc.
    const diSpan = spans.find((s) => doc.slice(s.from, s.to).includes("Di("));
    expect(diSpan).toBeDefined();
    // extractAll filtra syllableIndex >= 1; mapear para índice no resultado
    const real = spans.filter((s) => s.syllableIndex >= 1);
    const diRealIdx = real.indexOf(diSpan!);
    expect(diRealIdx).toBeGreaterThanOrEqual(0);
    expect(rhythms[diRealIdx].pitches).toHaveLength(11);
  });
});
