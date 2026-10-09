// test/completion-family.test.ts — sugestões do editor só da família do canto
import { describe, it, expect } from "vitest";
import { completionOptions } from "../src/neume/completion";
import { NeumeSearch } from "../src/neume/search";
import type { EffectiveEntry, Family } from "../src/neume/types";

const SVG = { path: "M0", viewBox: "0 0 1 1", advance: 1 };
const entry = (family: Family, nabc: string, name: string): EffectiveEntry => ({
  id: `${family}:${nabc}`, family, code: nabc, nabc, nabcValid: true, base: nabc, name, qualifiers: [], letters: [],
  terms: [nabc, name], meaning: "", svg: SVG, displayNames: [name], hidden: false,
});

describe("completion — família do canto", () => {
  const all = [entry("stgall", "pe", "pes"), entry("laon", "pe", "pes laon"), entry("laon", "un", "uncinus")];
  it("só entradas da família pedida, avaliada a cada consulta", () => {
    const s = new NeumeSearch(all); // construída sem família
    expect(completionOptions(s, "pe", "stgall").map((o) => o.detail)).toEqual(["pes"]);
    expect(completionOptions(s, "pe", "laon").map((o) => o.detail)).toEqual(["pes laon"]);
    expect(completionOptions(s, "un", "stgall")).toEqual([]);
  });
});
