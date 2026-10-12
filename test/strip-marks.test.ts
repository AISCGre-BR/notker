import { describe, it, expect } from "vitest";
import { detectMarks, stripMarks } from "../src/gabc/strip-marks";

const ALL = { vertical: true, horizontal: true, mora: true };
const NONE = { vertical: false, horizontal: false, mora: false };
const only = (k: "vertical" | "horizontal" | "mora") => ({ ...NONE, [k]: true });
const HEAD = "name:Dominus dixit ad me;\nmode:1;\n%%\n";
const IN = "(c3) DO(hgh)mi(fe)nus(e) *() di(ggh)xit(f) ad(hi~) me :(g'_[oh:h]) (,) Fí(i)li(ij)us(j) me(h_f)us(h) es(hi) tu,(g.) (;) e(hih)go(g_[oh:h]e) hó(f.0/ggh)di(fe)e(d.) () (,) () gé(f!gwh/ih)nu(fe)i(fg) te.(e.) (::) <eu>E(h) u(h) o(f) u(h) a(i) e.</eu>(h.) (::)";
const OUT = "(c3) DO(hgh)mi(fe)nus(e) *() di(ggh)xit(f) ad(hi~) me :(g) (,) Fí(i)li(ij)us(j) me(hf)us(h) es(hi) tu,(g) (;) e(hih)go(ge) hó(f/ggh)di(fe)e(d) () (,) () gé(f!gwh/ih)nu(fe)i(fg) te.(e) (::) <eu>E(h) u(h) o(f) u(h) a(i) e.</eu>(h) (::)";

describe("stripMarks", () => {
  it("âncora: Dominus dixit com tudo ligado", () => {
    const r = stripMarks(HEAD + IN, ALL);
    expect(r.text).toBe(HEAD + OUT);
    expect(r.counts).toEqual({ vertical: 1, horizontal: 3, mora: 5 });
  });
  it("cada tipo isolado mantém os outros (inclusive [oh:] com _ mantido)", () => {
    expect(stripMarks("(g'_[oh:h].)", only("vertical")).text).toBe("(g_[oh:h].)");
    expect(stripMarks("(g'_[oh:h].)", only("horizontal")).text).toBe("(g'.)");
    expect(stripMarks("(g'_[oh:h].)", only("mora")).text).toBe("(g'_[oh:h])");
    expect(stripMarks("(g'_[oh:h].)", NONE).text).toBe("(g'_[oh:h].)");
  });
  it("'0 e '1; _2; .. e .1", () => {
    expect(stripMarks("(g'0h'1)", ALL)).toEqual({ text: "(gh)", counts: { vertical: 2, horizontal: 0, mora: 0 } });
    expect(stripMarks("(g_2h_0)", ALL)).toEqual({ text: "(gh)", counts: { vertical: 0, horizontal: 2, mora: 0 } });
    expect(stripMarks("(g..h.1i.0)", ALL)).toEqual({ text: "(ghi)", counts: { vertical: 0, horizontal: 0, mora: 3 } });
  });
  it("bloco [oh:h{] … [oh}] some, contando só os _", () => {
    const r = stripMarks("(g_[oh:h{]h_i[oh}])", ALL);
    expect(r.text).toBe("(ghi)");
    expect(r.counts.horizontal).toBe(2);
    expect(stripMarks("(g_[oh:h{]h_i[oh}])", only("mora")).text).toBe("(g_[oh:h{]h_i[oh}])");
  });
  it("nabc depois do | intacto", () => {
    expect(stripMarks("(g'.|vi-)", ALL).text).toBe("(g|vi-)");
    expect(stripMarks("(g.|pe)", NONE).text).toBe("(g.|pe)");
    expect(stripMarks("(g|vi-'_.)", ALL).text).toBe("(g|vi-'_.)");
    expect(stripMarks("(g.|pe)", ALL).text).toBe("(g|pe)");
  });
  it("outros colchetes, divisões e letra intactos", () => {
    expect(stripMarks("a.b'(g[alt:a.b']h)", ALL).text).toBe("a.b'(g[alt:a.b']h)");
    expect(stripMarks("(::) (,) (;) (:?)", ALL).text).toBe("(::) (,) (;) (:?)");
  });
  it("sem %% trata o texto inteiro como corpo; vazio", () => {
    expect(stripMarks("A(g.)", ALL).text).toBe("A(g)");
    expect(stripMarks("", ALL)).toEqual({ text: "", counts: { vertical: 0, horizontal: 0, mora: 0 } });
  });
  it("cabeçalho nunca é tocado", () => {
    const h = "name:a.b'_(x);\n%%\n";
    expect(stripMarks(h + "(g.)", ALL).text).toBe(h + "(g)");
  });
  it("detectMarks = counts do strip com tudo ligado", () => {
    expect(detectMarks(HEAD + IN)).toEqual(stripMarks(HEAD + IN, ALL).counts);
  });
  it("escape $( $) na letra não abre grupo", () => {
    const r = stripMarks("a $(Ps. 1$)(g.)", ALL);
    expect(r.text).toBe("a $(Ps. 1$)(g)");
    expect(r.counts.mora).toBe(1);
  });
  it("comentários % fora de grupo ficam intactos", () => {
    expect(stripMarks("Do(g.)\n% x (v. 2)\nnus(h)", ALL).text).toBe("Do(g)\n% x (v. 2)\nnus(h)");
    expect(stripMarks("% (1\nDo'(g')", ALL).text).toBe("% (1\nDo'(g)");
  });
  it("barras ficam intactas e não contam", () => {
    const r = stripMarks("(:') (,_) (;1) (`_) (^.)", ALL);
    expect(r.text).toBe("(:') (,_) (;1) (`_) (^.)");
    expect(r.counts).toEqual({ vertical: 0, horizontal: 0, mora: 0 });
    expect(stripMarks("(z0::c3) (c4g.)", ALL).text).toBe("(z0::c3) (c4g)");
  });
  it(") dentro de colchetes não fecha o grupo", () => {
    expect(stripMarks("(g[nv:x)(y.]h.)", ALL).text).toBe("(g[nv:x)(y.]h)");
  });
});

describe("janela", () => {
  it("só conta e remove sinais dentro de [from,to), com o contexto do texto inteiro", () => {
    const d = "%%\nDo(f.)mi(g.)nus";
    const from = d.indexOf("mi");
    expect(detectMarks(d, { from, to: d.length })).toEqual({ vertical: 0, horizontal: 0, mora: 1 });
    expect(stripMarks(d, { vertical: true, horizontal: true, mora: true }, { from, to: d.length }).text).toBe("%%\nDo(f.)mi(g)nus");
  });
});

describe("onda final: contexto do Gregorio", () => {
  it("<v>, <alt> e <sp> fora de grupo são texto, não notas (1)", () => {
    expect(stripMarks("<alt>(T. P.)</alt>Al(g.)", ALL).text).toBe("<alt>(T. P.)</alt>Al(g)");
    const r = stripMarks("<c><v>(</v></c>Sr.(h.)", ALL);
    expect(r.text).toBe("<c><v>(</v></c>Sr.(h)");
    expect(r.counts).toEqual({ vertical: 0, horizontal: 0, mora: 1 });
    expect(stripMarks("<sp>(R.)</sp> A(g.)", ALL).text).toBe("<sp>(R.)</sp> A(g)");
    expect(stripMarks("<v>\\%</v>(g.)", ALL).text).toBe("<v>\\%</v>(g)");
    expect(stripMarks("<v>a$</v>(x.)</v>(g.)", ALL).text).toBe("<v>a$</v>(x.)</v>(g)");
  });
  it("_ e seus [oh|uh:…] são uma unidade decidida pela posição do _ (2)", () => {
    const d = "%%\nA(g_[oh:h]e)";
    const us = d.indexOf("_");
    expect(stripMarks(d, ALL, { from: 0, to: us + 1 }).text).toBe("%%\nA(ge)");
    expect(stripMarks(d, ALL, { from: us + 1, to: d.length }).text).toBe(d);
  });
  it("bloco [oh:{] … [oh}] só sai com as duas pontas na janela (2)", () => {
    const d = "%%\nA(g[oh:{]h_)B(i_[oh}])";
    const b = d.indexOf("B");
    const r = stripMarks(d, ALL, { from: 0, to: b });
    expect(r.text).toBe("%%\nA(g[oh:{]h)B(i_[oh}])");
    expect(stripMarks(d, ALL, { from: b, to: d.length }).text).toBe("%%\nA(g[oh:{]h_)B(i[oh}])");
    expect(stripMarks(d, ALL).text).toBe("%%\nA(gh)B(i)");
  });
  it("alternância gabc|nabc pelo nabc-lines (3)", () => {
    const h1 = "nabc-lines: 1;\n%%\n";
    expect(stripMarks(h1 + "(e.|pu|f_|ta)", ALL).text).toBe(h1 + "(e|pu|f|ta)");
    expect(stripMarks(h1 + "(e.|vi-'_.|f_|vi-'_.)", ALL).text).toBe(h1 + "(e|vi-'_.|f|vi-'_.)");
    const h2 = "nabc-lines:2;\n%%\n";
    expect(stripMarks(h2 + "(e.|vi.|pu_|f_|ta'|x.)", ALL).text).toBe(h2 + "(e|vi.|pu_|f|ta'|x.)");
    expect(stripMarks("(e.|pu|f_|ta)", ALL).text).toBe("(e|pu|f|ta)"); // sem cabeçalho: 1
  });
  it("[[ … ]] são delimitadores, não colchete de atributo (4)", () => {
    expect(stripMarks("(f[[g.h_]])", ALL).text).toBe("(f[[gh]])");
  });
  it("$] escapa dentro de colchete", () => {
    expect(stripMarks("(g[nv:a$]b.]h.)", ALL).text).toBe("(g[nv:a$]b.]h)");
  });
  it("barra no meio do grupo: o que vem colado nela fica (5)", () => {
    const r = stripMarks("(f.,_g)", ALL);
    expect(r.text).toBe("(f,_g)");
    expect(r.counts).toEqual({ vertical: 0, horizontal: 0, mora: 1 });
    expect(stripMarks("(f.;1'g.)", ALL).text).toBe("(f;1'g)");
  });
  it("sem %%: linhas de cabeçalho antes do primeiro grupo não são varridas (6)", () => {
    expect(stripMarks("name: x (a.b);\n(g.)", ALL).text).toBe("name: x (a.b);\n(g)");
    expect(stripMarks("nabc-lines: 1;\nA(e.|pu|f_|ta)", ALL).text).toBe("nabc-lines: 1;\nA(e|pu|f|ta)");
    expect(stripMarks("A(g.)\nname: x (a.b);", ALL).text).toBe("A(g)\nname: x (ab);");
  });
});
