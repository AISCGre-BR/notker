// test/effective.test.ts — catálogo + nomes + sequências do usuário como entradas efetivas
import { describe, it, expect } from "vitest";
import { buildEffective, findChain, glyphIndex, partGlyphs, splitNabcParts, byNabcIndex } from "../src/neume/effective";
import { addName, addSequence, emptyOverlay, setHidden } from "../src/neume/overlay";
import { neumeThumb } from "../src/neume/render";
import { NeumeSearch } from "../src/neume/search";
import type { NeumeEntry, Family } from "../src/neume/types";

const svg = (d: string) => ({ path: d, viewBox: "0 0 10 10", advance: 10 });
const ne = (family: Family, code: string, nabc: string, name: string, extra: Partial<NeumeEntry> = {}): NeumeEntry => ({
  id: `${family}:${code}`, family, code, nabc, nabcValid: true, base: nabc.slice(0, 2), name,
  qualifiers: [], letters: [], terms: [name, nabc], meaning: "", svg: svg("M" + code), ...extra,
});
const CAT: NeumeEntry[] = [
  ne("stgall", "pe", "pe", "pes"),
  ne("stgall", "vi", "vi", "virga"),
  ne("stgall", "cl", "cl", "clivis"),
  ne("stgall", "po", "po", "porrectus"),
  ne("stgall", "clEpo", "cl!po", "porrectus flexus"),
  ne("stgall", "cl!po", "cl!po", "porrectus flexus resupinus", { synthetic: true, svg: svg("Mplaceholder") }),
  ne("laon", "pe", "pe", "pes"),
];
const T = "2026-10-09T12:00:00.000Z";

describe("partes e glifos", () => {
  it("splitNabcParts separa em ! e /, normalizando", () => {
    expect(splitNabcParts(" pe!vi/cl ")).toEqual(["pe", "vi", "cl"]);
    expect(splitNabcParts("")).toEqual([]);
  });
  it("glyphIndex ignora sintéticas; partGlyphs exige todas as partes", () => {
    const g = glyphIndex(CAT);
    expect(g("stgall", "cl!po")!.path).toBe("MclEpo");
    expect(partGlyphs("stgall", "pe!vi", g)!.map((s) => s.path)).toEqual(["Mpe", "Mvi"]);
    expect(partGlyphs("stgall", "pe!zz", g)).toBeUndefined();
    expect(partGlyphs("laon", "pe!vi", g)).toBeUndefined(); // família certa
  });
});

describe("buildEffective", () => {
  it("catálogo com nomes do usuário (userNames) + sequências no fim, com nome do usuário buscável", () => {
    let o = addName(emptyOverlay(), "stgall:pe", "podatus");
    const s = addSequence(o, "stgall", "pe!vi", T);
    o = addName(s.overlay, s.id, "pes com virga");
    const all = buildEffective(CAT, o);
    expect(all).toHaveLength(CAT.length + 1);
    const pe = all.find((e) => e.id === "stgall:pe")!;
    expect(pe.userNames).toEqual(["podatus"]);
    expect(pe.displayNames).toEqual(["podatus", "pes"]);
    const seq = all.at(-1)!;
    expect(seq).toMatchObject({ id: "seq:stgall:pe!vi", family: "stgall", nabc: "pe!vi", synthetic: true, userSequence: true, hidden: false });
    expect(seq.svg).toBeUndefined();
    expect(seq.displayNames[0]).toBe("pes com virga");
    expect(seq.userNames).toEqual(["pes com virga"]);
    expect(seq.partSvgs!.map((p) => p.path)).toEqual(["Mpe", "Mvi"]);
    expect(new NeumeSearch(all).query("pes com virga")[0].id).toBe("seq:stgall:pe!vi");
    expect(new NeumeSearch(all).query("pe!vi")[0].id).toBe("seq:stgall:pe!vi");
  });
  it("sintética do catálogo ganha partSvgs; oculta some da busca comum mas não da includeHidden", () => {
    const o = setHidden(emptyOverlay(), "stgall:vi", true);
    const all = buildEffective(CAT, o);
    expect(all.find((e) => e.id === "stgall:cl!po")!.partSvgs!.map((p) => p.path)).toEqual(["Mcl", "Mpo"]);
    expect(new NeumeSearch(all).query("virga").some((e) => e.id === "stgall:vi")).toBe(false);
    expect(new NeumeSearch(all, undefined, { includeHidden: true }).query("virga")[0].id).toBe("stgall:vi");
  });
  it("sequências em ordem de criação", () => {
    let o = addSequence(emptyOverlay(), "stgall", "vi!pe", "2026-10-09T13:00:00.000Z").overlay;
    o = addSequence(o, "stgall", "pe!vi", T).overlay;
    expect(buildEffective(CAT, o).filter((e) => e.userSequence).map((e) => e.nabc)).toEqual(["pe!vi", "vi!pe"]);
  });
});

describe("findChain e byNabcIndex (deduplicação/lookup)", () => {
  const o = addSequence(emptyOverlay(), "stgall", "pe!vi", T).overlay;
  const all = buildEffective(CAT, o);
  it("prefere o glifo do catálogo à sintética; acha sequência do usuário; respeita família; normaliza", () => {
    expect(findChain(all, "stgall", "cl!po")!.id).toBe("stgall:clEpo");
    expect(findChain(all, "stgall", " pe! vi ")!.id).toBe("seq:stgall:pe!vi");
    expect(findChain(all, "laon", "pe!vi")).toBeUndefined();
    expect(findChain(all, "stgall", "")).toBeUndefined();
  });
  it("byNabcIndex agrupa todas as famílias e inclui as sequências", () => {
    const look = byNabcIndex(all);
    expect(look("pe").map((e) => e.id)).toEqual(["stgall:pe", "laon:pe"]);
    expect(look("pe!vi").map((e) => e.id)).toEqual(["seq:stgall:pe!vi"]);
  });
});

describe("neumeThumb", () => {
  it("glifo; partes para sequência; código em mono sem nada (texto, nunca HTML)", () => {
    expect(neumeThumb({ svg: svg("Ma"), nabc: "pe" }).tagName.toLowerCase()).toBe("svg");
    const parts = neumeThumb({ svg: svg("Mph"), partSvgs: [svg("Ma"), svg("Mb")], nabc: "a!b", synthetic: true });
    expect(parts.classList.contains("neume-thumb--parts")).toBe(true);
    expect(parts.querySelectorAll("svg")).toHaveLength(2);
    const code = neumeThumb({ nabc: "<img src=x onerror=alert(1)>" });
    expect(code.classList.contains("neume-thumb--code")).toBe(true);
    expect(code.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(code.querySelector("img")).toBeNull();
  });
});
