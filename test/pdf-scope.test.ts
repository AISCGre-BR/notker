import { describe, it, expect } from "vitest";
import { hasMusic, selectPieces, exportableGroup, pdfFileName, scopeTitle } from "../src/pdf/scope";
import type { NotkerProject, TreeNode } from "../src/project/tree";

const c = (id: string, title: string, content: string, family?: "stgall" | "laon"): TreeNode =>
  ({ kind: "chant", id, title, content, ...(family ? { family } : {}) });
const g = (id: string, title: string, children: TreeNode[]): TreeNode => ({ kind: "group", id, title, children });
const MUS = (n: string) => `name: ${n};\n%%\n(c4) ${n}(f|vi)(::)`;

// árvore: A · Natal[ B · Vazio · Dia[ C(laon) ] ] · Sem-música[ Vazio2 ]
const proj = (activeId = "a"): NotkerProject => ({
  schema: 2, kind: "notker-project", title: "Missa de Natal", family: "stgall", activeId,
  root: [
    c("a", "Puer natus est", MUS("A")),
    g("natal", "Natal", [c("b", "Viderunt", MUS("B")), c("v", "Vazio", "name: V;\n%%\n(c4) "), g("dia", "Dia", [c("c", "Dies", MUS("C"), "laon")])]),
    g("sem", "Sem música", [c("v2", "Vazio 2", "name: V;\n%%\n(c4) (::)")]),
  ],
});

describe("hasMusic", () => {
  it("nota em qualquer grupo do corpo conta; clave, barras e esqueleto não", () => {
    expect(hasMusic("name: x;\n%%\n(c4) ")).toBe(false);
    expect(hasMusic("name: x;\n%%\n(c4) (::)")).toBe(false);
    expect(hasMusic("(f3) (,) (;)")).toBe(false);
    expect(hasMusic("(c4) Pu(g)")).toBe(true);
    expect(hasMusic("(cb3) a(hv)")).toBe(true);
    expect(hasMusic("name: c4 (g);\n%%\n(c4) ")).toBe(false); // cabeçalho não conta
    expect(hasMusic("(c4) a(|vi)")).toBe(false); // só nabc, sem altura
    expect(hasMusic("")).toBe(false);
  });
});

describe("selectPieces", () => {
  it("canto atual: só o ativo (se tiver música), com a família efetiva", () => {
    expect(selectPieces(proj("a"), "chant")).toEqual([{ id: "a", title: "Puer natus est", content: MUS("A"), family: "stgall" }]);
    expect(selectPieces(proj("c"), "chant")[0].family).toBe("laon");
    expect(selectPieces(proj("v"), "chant")).toEqual([]);
  });
  it("grupo: subgrupos inclusos, ordem da árvore, sem os vazios", () => {
    expect(selectPieces(proj(), "group", "natal").map((x) => x.id)).toEqual(["b", "c"]);
    expect(selectPieces(proj(), "group", "dia").map((x) => x.id)).toEqual(["c"]);
    expect(selectPieces(proj(), "group", "a")).toEqual([]);      // não é grupo
    expect(selectPieces(proj(), "group", null)).toEqual([]);
    expect(selectPieces(proj(), "group", "sumiu")).toEqual([]);
  });
  it("projeto inteiro: ordem da árvore, sem os vazios", () => {
    expect(selectPieces(proj(), "project").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("exportableGroup", () => {
  it("só grupo com ao menos um canto com música", () => {
    expect(exportableGroup(proj(), "natal")).toEqual({ id: "natal", title: "Natal" });
    expect(exportableGroup(proj(), "sem")).toBeNull();
    expect(exportableGroup(proj(), "a")).toBeNull();
    expect(exportableGroup(proj(), null)).toBeNull();
    expect(exportableGroup(proj(), "sumiu")).toBeNull();
  });
});

describe("nome do arquivo", () => {
  it("slug sem acentos, minúsculo, com hífens; vazio vira 'partitura'", () => {
    expect(pdfFileName("Puer natus est")).toBe("puer-natus-est.pdf");
    expect(pdfFileName("Vigília Pascal — Exsúltet!")).toBe("vigilia-pascal-exsultet.pdf");
    expect(pdfFileName("  ../../etc/passwd ")).toBe("etc-passwd.pdf");
    expect(pdfFileName("***")).toBe("partitura.pdf");
    expect(pdfFileName("a".repeat(120))).toBe("a".repeat(80) + ".pdf");
  });
  it("scopeTitle: canto, grupo ou projeto", () => {
    expect(scopeTitle(proj("b"), "chant")).toBe("Viderunt");
    expect(scopeTitle(proj(), "group", "natal")).toBe("Natal");
    expect(scopeTitle(proj(), "project")).toBe("Missa de Natal");
  });
});
