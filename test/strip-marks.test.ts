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
});
