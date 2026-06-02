// test/search.test.ts
import { describe, it, expect } from "vitest";
import { NeumeSearch } from "../src/neume/search";
import type { EffectiveEntry } from "../src/neume/types";

function eff(id: string, name: string, terms: string[]): EffectiveEntry {
  return { id, family: "stgall", code: id.split(":")[1], nabc: id.split(":")[1], nabcValid: true,
    base: name.slice(0, 2), name, qualifiers: [], letters: [], terms, meaning: "",
    svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 }, displayNames: [name], hidden: false };
}

describe("NeumeSearch", () => {
  const items = [
    eff("stgall:sc", "scandicus", ["scandicus", "sc"]),
    eff("stgall:sc1", "scandicus", ["scandicus", "sc1"]),
    eff("stgall:cl", "clivis", ["clivis", "cl"]),
  ];
  it("query vazia devolve tudo (exceto hidden)", () => {
    expect(new NeumeSearch(items).query("").length).toBe(3);
  });
  it("'scandicus' traz as variantes de scandicus antes de clivis", () => {
    const r = new NeumeSearch(items).query("scandicus");
    expect(r.slice(0, 2).every((e) => e.name === "scandicus")).toBe(true);
  });
  it("prefixo do código casa", () => {
    const r = new NeumeSearch(items).query("cl");
    expect(r[0].id).toBe("stgall:cl");
  });
  it("ignora hidden", () => {
    const withHidden = [...items, { ...eff("stgall:x", "oculto", ["oculto"]), hidden: true }];
    expect(new NeumeSearch(withHidden).query("oculto").length).toBe(0);
  });
  it("query multi-palavra exige que todas as palavras casem (AND)", () => {
    const items = [
      eff("stgall:pe-su2", "pes", ["pes", "pe", "pe-su2", "subpunctis", "subbipunctis"]),
      eff("stgall:pe", "pes", ["pes", "pe"]),
      eff("stgall:cl", "clivis", ["clivis", "cl"]),
    ];
    const r = new NeumeSearch(items).query("pes subpunctis");
    expect(r.length).toBe(1);
    expect(r[0].id).toBe("stgall:pe-su2");
  });
  it("query multi-palavra ainda funciona para 'pes subbipunctis'", () => {
    const items = [eff("stgall:pe-su2", "pes", ["pes", "subpunctis", "subbipunctis"])];
    expect(new NeumeSearch(items).query("pes subbipunctis").length).toBe(1);
  });
  it("família ativa vem primeiro com score igual (sem esconder a outra)", () => {
    const stg = { ...eff("stgall:vi", "virga", ["virga", "vi"]) };
    const lao = { ...eff("stgall:vi", "virga", ["virga", "vi"]), id: "laon:vi", family: "laon" as const };
    const s = new NeumeSearch([lao, stg], "stgall"); // laon listado primeiro na entrada
    const r = s.query("virga");
    expect(r.length).toBe(2);            // nada escondido
    expect(r[0].family).toBe("stgall");  // ativa primeiro mesmo entrando depois
  });
});
