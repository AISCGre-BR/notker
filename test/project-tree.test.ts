// test/project-tree.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { setLocale } from "../src/i18n";
import {
  type NotkerProject, type TreeNode, type ChantNode, type GroupNode,
  newProject, ephemeralFromGabc, newChant, newGroup, gabcName, gabcSkeleton,
  findNode, findChant, locate, parentOf, childrenOf, flattenChants, countChants, visibleRows,
  getActiveChant, effectiveFamily, setActive, updateChant, insertNode, moveNode, moveSibling,
  renameNode, duplicateNode, removeNode, restoreRemoved, setChantFamily, setCollapsed, revealNode,
  subtreeHas, invariantErrors,
} from "../src/project/tree";

const c = (id: string, extra: Partial<ChantNode> = {}): ChantNode =>
  ({ kind: "chant", id, title: id.toUpperCase(), content: `name: ${id};\n%%\n(c4) ${id}(f)`, ...extra });
const g = (id: string, children: TreeNode[], extra: Partial<GroupNode> = {}): GroupNode =>
  ({ kind: "group", id, title: id.toUpperCase(), children, ...extra });
/** a · g1[ b · g2[ c ] · d ] · e    — ativo: b */
const sample = (): NotkerProject => ({
  schema: 2, kind: "notker-project", title: "P", family: "stgall", activeId: "b",
  root: [c("a"), g("g1", [c("b"), g("g2", [c("c")]), c("d")]), c("e")],
});
/** Desenho compacto: "a g1[b g2[c] d] e". */
const shape = (nodes: TreeNode[]): string =>
  nodes.map((n) => (n.kind === "group" ? `${n.id}[${shape(n.children)}]` : n.id)).join(" ");

describe("construtores", () => {
  it("newProject: schema 2, um canto ativo com cabeçalho e família padrão", () => {
    const p = newProject({ family: "laon", name: "Rorate", office: "Introitus" });
    expect(p.schema).toBe(2);
    expect(p.kind).toBe("notker-project");
    expect(p.root).toHaveLength(1);
    const a = getActiveChant(p);
    expect(a.title).toBe("Rorate");
    expect(a.content).toBe("name: Rorate;\noffice-part: Introitus;\n%%\n(c4) ");
    expect(effectiveFamily(p, a.id)).toBe("laon");
    expect(invariantErrors(p)).toEqual([]);
  });
  it("ephemeralFromGabc: título do name:, sem caminho, St. Gall", () => {
    const p = ephemeralFromGabc("name: Ad te;\n%%\n(c4) a", "x.gabc");
    expect(p.path).toBeUndefined();
    expect(getActiveChant(p).title).toBe("Ad te");
    expect(p.family).toBe("stgall");
    expect(ephemeralFromGabc("%%\n(c4) a", "Kyrie.gabc").title).toBe("Kyrie");
  });
  it("gabcName, gabcSkeleton, newChant e newGroup", () => {
    expect(gabcName("name: Puer;\n%%\n(c4)")).toBe("Puer");
    expect(gabcName("%%\n(c4)", "X")).toBe("X");
    expect(gabcSkeleton()).toBe("name: Novo;\n%%\n(c4) ");
    expect(newChant({ title: "Lux", family: "laon" })).toMatchObject({ kind: "chant", title: "Lux", family: "laon", content: "name: Lux;\n%%\n(c4) " });
    expect(newChant({ title: "Lux" })).not.toHaveProperty("family");
    expect(newGroup()).toMatchObject({ kind: "group", title: "Novo grupo", children: [] });
    expect(newGroup().id).not.toBe(newGroup().id);
  });
});

describe("leitura", () => {
  it("findNode/findChant/locate/parentOf/childrenOf", () => {
    const p = sample();
    expect(findNode(p, "g2")?.kind).toBe("group");
    expect(findChant(p, "g2")).toBeUndefined();
    expect(findChant(p, "c")?.title).toBe("C");
    expect(locate(p, "d")).toEqual({ parentId: "g1", index: 2 });
    expect(locate(p, "e")).toEqual({ parentId: null, index: 2 });
    expect(locate(p, "zz")).toBeUndefined();
    expect(parentOf(p, "a")).toBeNull();
    expect(parentOf(p, "c")?.id).toBe("g2");
    expect(parentOf(p, "zz")).toBeUndefined();
    expect(childrenOf(p, "g1")?.map((n) => n.id)).toEqual(["b", "g2", "d"]);
    expect(childrenOf(p, "a")).toBeUndefined();
    expect(subtreeHas(findNode(p, "g1")!, "c")).toBe(true);
    expect(subtreeHas(findNode(p, "g2")!, "b")).toBe(false);
  });
  it("flattenChants em ordem de documento; countChants conta descendentes", () => {
    const p = sample();
    expect(flattenChants(p).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(countChants(findNode(p, "g1")!)).toBe(3);
    expect(countChants(findNode(p, "a")!)).toBe(1);
  });
  it("visibleRows: profundidade, posição e grupos recolhidos", () => {
    const p = setCollapsed(sample(), "g2", true);
    const rows = visibleRows(p);
    expect(rows.map((r) => `${r.node.id}@${r.depth}`)).toEqual(["a@0", "g1@0", "b@1", "g2@1", "d@1", "e@0"]);
    const d = rows.find((r) => r.node.id === "d")!;
    expect(d).toMatchObject({ parentId: "g1", index: 2, setSize: 3 });
  });
  it("getActiveChant, effectiveFamily e setActive (só cantos)", () => {
    let p = sample();
    expect(getActiveChant(p).id).toBe("b");
    p = setChantFamily(p, "c", "laon");
    expect(effectiveFamily(p, "c")).toBe("laon");
    expect(effectiveFamily(p, "a")).toBe("stgall");
    expect(setActive(p, "g1")).toBe(p);
    expect(setActive(p, "zz")).toBe(p);
    expect(setActive(p, "e").activeId).toBe("e");
  });
});

describe("escrita", () => {
  it("updateChant só em cantos e não altera o original", () => {
    const p = sample();
    const q = updateChant(p, "c", { content: "novo" });
    expect(findChant(q, "c")!.content).toBe("novo");
    expect(findChant(p, "c")!.content).toBe("name: c;\n%%\n(c4) c(f)");
    expect(updateChant(p, "g1", { content: "x" })).toBe(p);
  });
  it("renameNode apara espaços; vazio ou igual é no-op", () => {
    const p = sample();
    expect(findNode(renameNode(p, "g1", "  Natal  "), "g1")!.title).toBe("Natal");
    expect(renameNode(p, "g1", "   ")).toBe(p);
    expect(renameNode(p, "g1", "G1")).toBe(p);
  });
  it("setChantFamily ignora grupos; setCollapsed ignora cantos e limpa a chave", () => {
    const p = sample();
    expect(setChantFamily(p, "g1", "laon")).toBe(p);
    expect(setCollapsed(p, "a", true)).toBe(p);
    const q = setCollapsed(p, "g1", true);
    expect((findNode(q, "g1") as GroupNode).collapsed).toBe(true);
    expect(findNode(setCollapsed(q, "g1", false), "g1")).not.toHaveProperty("collapsed");
  });
  it("revealNode expande todos os ancestrais", () => {
    let p = setCollapsed(setCollapsed(sample(), "g1", true), "g2", true);
    p = revealNode(p, "c");
    expect((findNode(p, "g1") as GroupNode).collapsed).toBeFalsy();
    expect((findNode(p, "g2") as GroupNode).collapsed).toBeFalsy();
  });
  it("insertNode: raiz, grupo, limite de índice; pai inválido ou id repetido é no-op", () => {
    const p = sample();
    expect(shape(insertNode(p, null, 1, c("x")).root)).toBe("a x g1[b g2[c] d] e");
    expect(shape(insertNode(p, "g2", Infinity, c("x")).root)).toBe("a g1[b g2[c x] d] e");
    expect(shape(insertNode(p, "g2", -5, c("x")).root)).toBe("a g1[b g2[x c] d] e");
    expect(insertNode(p, "a", 0, c("x"))).toBe(p);
    expect(insertNode(p, "zz", 0, c("x"))).toBe(p);
    expect(insertNode(p, null, 0, c("b"))).toBe(p);
    expect(insertNode(p, null, 0, g("y", [c("c")]))).toBe(p);
  });
  it("moveNode: índice relativo à árvore ANTES da mudança, entre listas e no fim", () => {
    const p = sample();
    expect(shape(moveNode(p, "a", null, 2).root)).toBe("g1[b g2[c] d] a e");
    expect(shape(moveNode(p, "e", null, 0).root)).toBe("e a g1[b g2[c] d]");
    expect(shape(moveNode(p, "a", "g2", 0).root)).toBe("g1[b g2[a c] d] e");
    expect(shape(moveNode(p, "c", null, Infinity).root)).toBe("a g1[b g2[] d] e c");
    expect(moveNode(p, "a", null, 1)).toBe(p); // mesma posição
    expect(moveNode(p, "e", null, Infinity)).toBe(p);
  });
  it("moveNode proíbe ciclos e destinos inválidos", () => {
    const p = sample();
    expect(moveNode(p, "g1", "g2", 0)).toBe(p);
    expect(moveNode(p, "g1", "g1", 0)).toBe(p);
    expect(moveNode(p, "a", "b", 0)).toBe(p);
    expect(moveNode(p, "a", "zz", 0)).toBe(p);
    expect(moveNode(p, "zz", null, 0)).toBe(p);
    expect(invariantErrors(moveNode(p, "g2", null, 0))).toEqual([]);
  });
  it("moveSibling troca com o vizinho e não sai das pontas", () => {
    const p = sample();
    expect(shape(moveSibling(p, "d", -1).root)).toBe("a g1[b d g2[c]] e");
    expect(shape(moveSibling(p, "a", 1).root)).toBe("g1[b g2[c] d] a e");
    expect(moveSibling(p, "a", -1)).toBe(p);
    expect(moveSibling(p, "d", 1)).toBe(p);
  });
  it("duplicateNode: cópia profunda com ids novos logo depois; '(cópia)' só no topo", () => {
    const p = sample();
    const r = duplicateNode(p, "g1")!;
    expect(r.project.root.map((n) => n.title)).toEqual(["A", "G1", "G1 (cópia)", "E"]);
    const copy = r.project.root[2] as GroupNode;
    expect(copy.id).toBe(r.id);
    expect(copy.children.map((n) => n.title)).toEqual(["B", "G2", "D"]);
    expect(copy.children.map((n) => n.id)).not.toContain("b");
    expect(invariantErrors(r.project)).toEqual([]);
    expect(duplicateNode(p, "zz")).toBeNull();
  });
  it("duplicateNode de canto copia a onda sem compartilhar o objeto", () => {
    const p = updateChant(sample(), "a", { interpretation: { gabcBodyHash: "h", factors: { "0:0": 1.4 } } });
    const r = duplicateNode(p, "a")!;
    const copy = findChant(r.project, r.id)!;
    expect(copy.interpretation).toEqual({ gabcBodyHash: "h", factors: { "0:0": 1.4 } });
    expect(copy.interpretation!.factors).not.toBe(findChant(p, "a")!.interpretation!.factors);
  });
});

describe("removeNode / restoreRemoved", () => {
  it("remover um não-ativo mantém o ativo e informa pai e índice", () => {
    const r = removeNode(sample(), "c")!;
    expect(shape(r.project.root)).toBe("a g1[b g2[] d] e");
    expect(r.project.activeId).toBe("b");
    expect(r).toMatchObject({ parentId: "g2", index: 0, prevActiveId: "b" });
    expect(r.createdId).toBeUndefined();
  });
  it("remover o ativo ativa o próximo canto; sem próximo, o anterior", () => {
    expect(removeNode(sample(), "b")!.project.activeId).toBe("c");
    const p = setActive(sample(), "e");
    expect(removeNode(p, "e")!.project.activeId).toBe("d");
  });
  it("remover o grupo que contém o ativo ativa o canto depois do grupo", () => {
    const r = removeNode(sample(), "g1")!;
    expect(shape(r.project.root)).toBe("a e");
    expect(r.project.activeId).toBe("e");
  });
  it("o projeto nunca fica sem canto: sai o último, entra um vazio", () => {
    const p: NotkerProject = { ...sample(), root: [g("g", [c("x")])], activeId: "x" };
    const r = removeNode(p, "g")!;
    expect(flattenChants(r.project)).toHaveLength(1);
    expect(r.createdId).toBe(r.project.activeId);
    expect(getActiveChant(r.project).content).toBe("name: Novo;\n%%\n(c4) ");
    expect(invariantErrors(r.project)).toEqual([]);
    expect(removeNode(p, "zz")).toBeNull();
  });
  it("restoreRemoved devolve no mesmo lugar e reativa o canto removido", () => {
    const r = removeNode(sample(), "b")!;
    const back = restoreRemoved(r.project, r);
    expect(shape(back.root)).toBe(shape(sample().root));
    expect(back.activeId).toBe("b");
  });
  it("restoreRemoved: pai que sumiu → fim da raiz; segunda restauração é no-op", () => {
    const r = removeNode(sample(), "c")!;
    const gone = removeNode(r.project, "g2")!.project;
    const back = restoreRemoved(gone, r);
    expect(shape(back.root)).toBe("a g1[b d] e c");
    expect(restoreRemoved(back, r)).toBe(back);
  });
  it("restoreRemoved remove o canto vazio criado só se ele ficou intocado", () => {
    const p = newProject({ family: "stgall", name: "Único" });
    const r = removeNode(p, p.activeId)!;
    expect(flattenChants(restoreRemoved(r.project, r)).map((x) => x.title)).toEqual(["Único"]);
    const edited = updateChant(r.project, r.createdId!, { content: "name: Meu;\n%%\n(c4) a" });
    expect(flattenChants(restoreRemoved(edited, r)).map((x) => x.title)).toEqual(["Único", "Novo"]);
  });
  it("restoreRemoved: só o título renomeado já conta como mexido", () => {
    const p = newProject({ family: "stgall", name: "Único" });
    const r = removeNode(p, p.activeId)!;
    const renamed = renameNode(r.project, r.createdId!, "Meu");
    expect(flattenChants(restoreRemoved(renamed, r)).map((x) => x.title)).toEqual(["Único", "Meu"]);
  });
});

describe("invariantes", () => {
  it("detecta id repetido, ativo inválido e projeto sem canto", () => {
    expect(invariantErrors(sample())).toEqual([]);
    expect(invariantErrors({ ...sample(), activeId: "g1" })).toEqual(["ativo inválido: g1"]);
    expect(invariantErrors({ ...sample(), root: [c("a"), c("a")], activeId: "a" })).toEqual(["id repetido: a"]);
    expect(invariantErrors({ ...sample(), root: [g("g", [])], activeId: "x" })).toEqual(["projeto sem canto", "ativo inválido: x"]);
  });
});

describe("árvore (modelo) — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("padrões de criação e cópia no idioma", () => {
    setLocale("it");
    expect(newGroup().title).toBe("Nuovo gruppo");
    expect(gabcSkeleton()).toContain("name: Nuovo;");
    expect(gabcName("%%\n(c4)")).toBe("Senza titolo");
    const p = newProject({ family: "stgall" });
    const r = duplicateNode(p, p.activeId)!;
    expect(findNode(r.project, r.id)!.title).toBe("Nuovo (copia)");
  });
});
