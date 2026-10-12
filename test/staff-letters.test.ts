// test/staff-letters.test.ts — Task 4 (Letras na pauta): função pura clave → letras.
import { describe, it, expect } from "vitest";
import { staffLetters, clefInGroup, clefsBySyllable } from "../src/gabc/staff-letters";
import { pitchName } from "../src/gabc/gabc-pitch";

const letters = (clef: string | null, lines?: number) => staffLetters(clef, lines).map((p) => p.letter).join("");

describe("staffLetters — letra gabc de cada linha e espaço (de baixo para cima)", () => {
  it("c4: linha 1 (de baixo) = d … linha 4 = j; espaços e, g, i", () => {
    const ps = staffLetters("c4");
    expect(ps.map((p) => p.letter)).toEqual(["d", "e", "f", "g", "h", "i", "j"]);
    expect(ps.map((p) => p.kind)).toEqual(["line", "space", "line", "space", "line", "space", "line"]);
    expect(ps.map((p) => p.degree)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("as letras são posições TIPOGRÁFICAS (Gabc.tex §Pitches): não mudam com a clave", () => {
    for (const clef of ["c1", "c2", "c3", "c4", "f1", "f2", "f3", "f4", "cb3", "cb4"]) {
      expect(letters(clef)).toBe("defghij");
    }
  });
  it("o solfejo de cada posição segue a clave DAQUELA pauta (= gabc-pitch.ts)", () => {
    const sol = (clef: string) => staffLetters(clef).map((p) => p.solfege);
    expect(sol("c4")).toEqual(["re", "mi", "fa", "sol", "la", "si", "do"]);
    // c3: Dó na linha 3 (h); f3: Fá na linha 3 (h)
    expect(staffLetters("c3")[4]).toMatchObject({ letter: "h", kind: "line", solfege: "do" });
    expect(staffLetters("f3")[4]).toMatchObject({ letter: "h", kind: "line", solfege: "fa" });
    expect(staffLetters("f4")[6]).toMatchObject({ letter: "j", solfege: "fa" });
    for (const clef of ["c2", "f2", "c3"]) {
      for (const p of staffLetters(clef)) expect(p.solfege).toBe(pitchName(p.letter, clef));
    }
  });
  it("bemol de clave é ignorado; clave ausente/estranha cai em c4", () => {
    expect(staffLetters("cb3").map((p) => p.solfege)).toEqual(staffLetters("c3").map((p) => p.solfege));
    expect(staffLetters(null).map((p) => p.solfege)).toEqual(staffLetters("c4").map((p) => p.solfege));
    expect(staffLetters("zz").map((p) => p.solfege)).toEqual(staffLetters("c4").map((p) => p.solfege));
  });
  it("outros números de linhas: linha 1 é sempre d (2 linhas: d e f; 3 linhas: d … h)", () => {
    expect(letters("c4", 2)).toBe("def");
    expect(letters("c4", 3)).toBe("defgh");
    expect(letters("c4", 0)).toBe("");
  });
});

describe("clefInGroup — clave dentro de um grupo de notas (só a parte gabc)", () => {
  it("acha c1…c4, f1…f4, com bemol", () => {
    expect(clefInGroup("c4")).toBe("c4");
    expect(clefInGroup(" f3 ")).toBe("f3");
    expect(clefInGroup("cb3")).toBe("cb3");
    expect(clefInGroup("::c3")).toBe("c3");
    expect(clefInGroup("z0::f2")).toBe("f2");
  });
  it("notas comuns não são clave; o nabc depois do | é ignorado", () => {
    expect(clefInGroup("ixhi")).toBeNull();
    expect(clefInGroup("hg")).toBeNull();
    expect(clefInGroup("fe.")).toBeNull();
    expect(clefInGroup("f_2")).toBeNull();
    expect(clefInGroup("g|cl3")).toBeNull();
    expect(clefInGroup("C4")).toBeNull(); // maiúscula = punctum inclinatum, não clave
  });
});

describe("clefsBySyllable — clave ativa depois de cada grupo, no índice de sílaba do preview", () => {
  it("clave inicial (índice 0) e troca no meio (c4 → c3 → f3)", () => {
    const doc = "name: t;\n%%\n(c4) Pu(g)er(h) (c3) cu(e)ius(f) (f3) et(f)";
    // spans: (c4)=0, Pu=1, er=2, (c3)=3, cu=4, ius=5, (f3)=6, et=7
    expect(clefsBySyllable(doc)).toEqual(["c4", "c4", "c4", "c3", "c3", "c3", "f3", "f3"]);
  });
  it("sem clave inicial: c4 por padrão; cabeçalho é ignorado", () => {
    expect(clefsBySyllable("Pu(g)er(h)")).toEqual(["c4", "c4", "c4"]);
    expect(clefsBySyllable("name: f3;\n%%\nA(g)")).toEqual(["c4", "c4"]);
  });
});
