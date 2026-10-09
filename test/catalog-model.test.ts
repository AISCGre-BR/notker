// test/catalog-model.test.ts — seções, filtros, teto e navegação vertical da grade
import { describe, it, expect } from "vitest";
import { catalogSections, verticalNeighbor, SECTION_CAP } from "../src/neumas/catalog-model";
import type { EffectiveEntry, Family } from "../src/neume/types";

const e = (id: string, extra: Partial<EffectiveEntry> = {}): EffectiveEntry => {
  const [family, code] = id.startsWith("seq:") ? [id.split(":")[1] as Family, id.split(":")[2]] : [id.split(":")[0] as Family, id.split(":")[1]];
  return {
    id, family, code, nabc: code, nabcValid: true, base: code.slice(0, 2), name: code, qualifiers: [], letters: [],
    terms: [code], meaning: "", displayNames: [...(extra.userNames ?? []), code], hidden: false, ...extra,
  };
};
const ALL: EffectiveEntry[] = [
  e("stgall:pe", { userNames: ["podatus"], terms: ["podatus", "pe"] }),
  e("stgall:vi", { hidden: true }),
  e("stgall:cl!po", { synthetic: true }),
  e("laon:pe"),
  e("seq:stgall:pe!vi", { synthetic: true, userSequence: true, userNames: ["pes com virga"], terms: ["pes com virga", "pe!vi"] }),
];
const ids = (s: ReturnType<typeof catalogSections>) => s.map((x) => `${x.id}:${x.items.map((i) => i.id).join(",")}`);

describe("catalogSections", () => {
  it("ordem das seções, só a família pedida, ocultos incluídos", () => {
    expect(ids(catalogSections(ALL, "stgall", "todos", ""))).toEqual([
      "minhas:seq:stgall:pe!vi", "catalogo:stgall:cl!po", "glifos:stgall:pe,stgall:vi",
    ]);
    expect(ids(catalogSections(ALL, "laon", "todos", ""))).toEqual(["minhas:", "catalogo:", "glifos:laon:pe"]);
  });
  it("filtros: com meus nomes, sem nome, sequências", () => {
    expect(ids(catalogSections(ALL, "stgall", "meus", ""))).toEqual(["minhas:seq:stgall:pe!vi", "catalogo:", "glifos:stgall:pe"]);
    expect(ids(catalogSections(ALL, "stgall", "sem-nome", ""))).toEqual(["minhas:", "catalogo:stgall:cl!po", "glifos:stgall:vi"]);
    expect(ids(catalogSections(ALL, "stgall", "sequencias", ""))).toEqual(["minhas:seq:stgall:pe!vi", "catalogo:stgall:cl!po"]);
  });
  it("busca pelo nome do usuário acha a sequência e o glifo nomeado", () => {
    expect(ids(catalogSections(ALL, "stgall", "todos", "pes com"))).toEqual(["minhas:seq:stgall:pe!vi", "catalogo:", "glifos:"]);
    expect(ids(catalogSections(ALL, "stgall", "todos", "podatus"))).toEqual(["minhas:", "catalogo:", "glifos:stgall:pe"]);
  });
  it("teto por seção com total real; o fixado entra mesmo além do teto", () => {
    const many = Array.from({ length: SECTION_CAP + 20 }, (_, i) => e(`stgall:g${i}`));
    const s = catalogSections(many, "stgall", "todos", "")[2];
    expect(s.items).toHaveLength(SECTION_CAP);
    expect(s.total).toBe(SECTION_CAP + 20);
    const p = catalogSections(many, "stgall", "todos", "", { pin: `stgall:g${SECTION_CAP + 5}` })[2];
    expect(p.items).toHaveLength(SECTION_CAP + 1);
    expect(p.items.at(-1)!.id).toBe(`stgall:g${SECTION_CAP + 5}`);
  });
});

describe("verticalNeighbor", () => {
  // 3 por linha: (0,0) (0,100) (0,200) / (50,0) (50,100) / (100,0)
  const R = [{ top: 0, left: 0 }, { top: 0, left: 100 }, { top: 0, left: 200 }, { top: 50, left: 0 }, { top: 50, left: 100 }, { top: 100, left: 0 }];
  it("desce para a coluna mais próxima na linha de baixo; sobe; para nas bordas", () => {
    expect(verticalNeighbor(R, 1, 1)).toBe(4);
    expect(verticalNeighbor(R, 2, 1)).toBe(4); // linha de baixo mais curta
    expect(verticalNeighbor(R, 4, -1)).toBe(1);
    expect(verticalNeighbor(R, 5, 1)).toBe(5);
    expect(verticalNeighbor(R, 0, -1)).toBe(0);
  });
});
