// test/project-format.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { toBundle, fromBundle, gabcExportPlan, slug, futureSchemaMessage } from "../src/project/format";
import { setLocale } from "../src/i18n";
import { gabcBodyHash } from "../src/tuotilo/wave";
import {
  type NotkerProject, type TreeNode, type ChantNode, type GroupNode,
  getActiveChant, moveSibling, invariantErrors, flattenChants,
} from "../src/project/tree";

const c = (id: string, title: string, extra: Partial<ChantNode> = {}): ChantNode =>
  ({ kind: "chant", id, title, content: `name: ${title};\n%%\n(c4) ${id}(f)`, ...extra });
const g = (id: string, title: string, children: TreeNode[], extra: Partial<GroupNode> = {}): GroupNode =>
  ({ kind: "group", id, title, children, ...extra });
const sample = (): NotkerProject => ({
  schema: 2, kind: "notker-project", title: "Missa de Natal", family: "stgall", activeId: "c2",
  root: [
    c("c1aaaaaaaa", "Kyrie"),
    g("g1", "Natal", [
      c("c2", "Puer natus", { family: "laon", interpretation: { gabcBodyHash: "cafe", factors: { "0:1": 1.6 } } }),
      g("g2", "Oitava", [], { collapsed: true }),
    ]),
  ],
});

describe("toBundle (schema 2)", () => {
  it("project.json leva árvore + chants, sem conteúdo; .gabc puros por id estável", () => {
    const b = toBundle(sample());
    const m = JSON.parse(b.project_json);
    expect(m).toMatchObject({ schema: 2, kind: "notker-project", title: "Missa de Natal", family: "stgall", active: "c2" });
    expect(m.tree).toEqual([
      { chant: "c1aaaaaaaa" },
      { group: "g1", title: "Natal", children: [{ chant: "c2" }, { group: "g2", title: "Oitava", collapsed: true, children: [] }] },
    ]);
    expect(m.chants).toEqual([
      { id: "c1aaaaaaaa", file: "gabc/kyrie-c1aaaaaa.gabc", title: "Kyrie" },
      { id: "c2", file: "gabc/puer-natus-c2.gabc", title: "Puer natus", family: "laon" },
    ]);
    expect(b.project_json).not.toContain("(c4)");
    expect(b.files["gabc/kyrie-c1aaaaaa.gabc"]).toBe("name: Kyrie;\n%%\n(c4) c1aaaaaaaa(f)");
    expect(JSON.parse(b.files["interpretation/puer-natus-c2.json"])).toEqual({ gabcBodyHash: "cafe", factors: { "0:1": 1.6 } });
    expect(Object.keys(b.files).filter((k) => k.startsWith("interpretation/"))).toHaveLength(1);
  });
  it("reordenar não renomeia arquivos; ids parecidos não colidem", () => {
    const p = sample();
    const before = Object.keys(toBundle(p).files).sort();
    expect(Object.keys(toBundle(moveSibling(p, "g1", -1)).files).sort()).toEqual(before);
    const twins: NotkerProject = { ...p, root: [c("abcdefgh-1", "A"), c("abcdefgh-2", "A")], activeId: "abcdefgh-1" };
    expect(Object.keys(toBundle(twins).files).sort()).toEqual(["gabc/a-abcdefgh-2.gabc", "gabc/a-abcdefgh.gabc"]);
  });
  it("onda com fatores vazios não gera arquivo", () => {
    const p: NotkerProject = { ...sample(), root: [c("x", "X", { interpretation: { gabcBodyHash: "h", factors: {} } })], activeId: "x" };
    expect(Object.keys(toBundle(p).files)).toEqual(["gabc/x-x.gabc"]);
  });
});

describe("fromBundle", () => {
  it("ida e volta preserva árvore, recolhido, famílias, onda, ativo e caminho", () => {
    const p = sample();
    const b = toBundle(p);
    const q = fromBundle(b.project_json, b.files, "/x/missa.notker");
    expect(q.root).toEqual(p.root);
    expect(q).toMatchObject({ schema: 2, title: "Missa de Natal", family: "stgall", activeId: "c2", path: "/x/missa.notker" });
    expect(invariantErrors(q)).toEqual([]);
  });
  it("lê o schema 1 (documents[]) como raiz plana; salvar grava schema 2", () => {
    const json = JSON.stringify({
      schema: 1, kind: "notker-project", title: "Antigo", family: "laon", active: "d2",
      documents: [{ id: "d1", file: "gabc/001-a.gabc", title: "A" }, { id: "d2", file: "gabc/002-b.gabc", title: "B", family: "stgall" }],
    });
    const files = {
      "gabc/001-a.gabc": "name: A;\n%%\n(c4) a",
      "gabc/002-b.gabc": "name: B;\n%%\n(c4) b",
      "interpretation/002-b.json": JSON.stringify({ gabcBodyHash: "h", factors: { "1:0": 1.3 } }),
    };
    const p = fromBundle(json, files, "/v.notker");
    expect(p.schema).toBe(2);
    expect(p.root.map((n) => `${n.kind}:${n.id}`)).toEqual(["chant:d1", "chant:d2"]);
    expect(p.family).toBe("laon");
    expect(getActiveChant(p)).toMatchObject({ id: "d2", family: "stgall", content: "name: B;\n%%\n(c4) b" });
    expect(getActiveChant(p).interpretation?.factors["1:0"]).toBe(1.3);
    expect(JSON.parse(toBundle(p).project_json).schema).toBe(2);
  });
  it("schema futuro → mensagem clara; não-Notker e JSON inválido → erro", () => {
    expect(() => fromBundle(JSON.stringify({ schema: 3, kind: "notker-project" }), {}, undefined)).toThrow(futureSchemaMessage());
    expect(futureSchemaMessage()).toBe("Projeto criado por uma versão mais nova do Notker.");
    expect(() => fromBundle(JSON.stringify({ kind: "outro" }), {}, undefined)).toThrow(/não é um projeto Notker/);
    expect(() => fromBundle("{ quebrado", {}, undefined)).toThrow(/project\.json inválido/);
  });
  it("project.json editado à mão não perde cantos", () => {
    const json = JSON.stringify({
      schema: 2, kind: "notker-project", title: "T", family: "stgall", active: "g",
      tree: [{ chant: "x" }, { chant: "a" }, { group: "g", title: "G" }, { chant: "a" }, 42, null],
      chants: [{ id: "a", file: "gabc/a.gabc", title: "A" }, { id: "b", file: "gabc/b.gabc", title: "B" }],
    });
    const p = fromBundle(json, { "gabc/a.gabc": "A", "gabc/b.gabc": "B" }, undefined);
    expect(p.root.map((n) => n.id)).toEqual(["a", "g", "b"]);   // órfão "b" no fim; "x" e o 2º "a" ignorados
    expect((p.root[1] as GroupNode).children).toEqual([]);
    expect(p.activeId).toBe("a");                                // active era um grupo
    expect(invariantErrors(p)).toEqual([]);
  });
  it("projeto vazio ganha um canto; ids repetidos no schema 1 viram distintos; onda inválida é ignorada", () => {
    const empty = fromBundle(JSON.stringify({ schema: 2, kind: "notker-project", tree: [], chants: [] }), {}, undefined);
    expect(flattenChants(empty)).toHaveLength(1);
    expect(invariantErrors(empty)).toEqual([]);
    const dup = fromBundle(JSON.stringify({
      schema: 1, kind: "notker-project",
      documents: [{ id: "d", file: "gabc/1.gabc", title: "A" }, { id: "d", file: "gabc/2.gabc", title: "B" }],
    }), { "gabc/1.gabc": "a", "gabc/2.gabc": "b", "interpretation/1.json": "{ inválido" }, undefined);
    expect(flattenChants(dup).map((x) => x.content)).toEqual(["a", "b"]);
    expect(invariantErrors(dup)).toEqual([]);
    expect(flattenChants(dup)[0].interpretation).toBeUndefined();
  });
});

describe("exportação e slug", () => {
  it("gabcExportPlan espelha a árvore com prefixos de ordem", () => {
    const plan = gabcExportPlan(sample());
    expect(plan.dirs).toEqual(["02-natal", "02-natal/02-oitava"]);
    expect(plan.files).toEqual([
      { path: "01-kyrie.gabc", content: "name: Kyrie;\n%%\n(c4) c1aaaaaaaa(f)" },
      { path: "02-natal/01-puer-natus.gabc", content: "name: Puer natus;\n%%\n(c4) c2(f)" },
    ]);
  });
  it("toBundle e gabcExportPlan não dependem do idioma (o ZIP é o mesmo)", () => {
    const pt = { b: toBundle(sample()), plan: gabcExportPlan(sample()) };
    try {
      setLocale("it");
      expect(toBundle(sample())).toEqual(pt.b);
      expect(gabcExportPlan(sample())).toEqual(pt.plan);
    } finally { setLocale("pt-BR"); }
  });
  it("slug translitera ligaduras e acentos; vazio cai no fallback", () => {
    expect(slug("Rorate Cæli")).toBe("rorate-caeli");
    expect(slug("Ofício de Nossa Senhora")).toBe("oficio-de-nossa-senhora");
    expect(slug("???")).toBe("canto");
    expect(slug("", "grupo")).toBe("grupo");
  });
  it("onda legada com hash vazio adota o hash do texto ao abrir", () => {
    const p: NotkerProject = { ...sample(), root: [c("x", "X", { interpretation: { gabcBodyHash: "", factors: { "0:0": 1.2 } } })], activeId: "x" };
    const b = toBundle(p);
    const q = fromBundle(b.project_json, b.files, "/x.notker");
    const w = getActiveChant(q).interpretation!;
    expect(w.gabcBodyHash).toBe(gabcBodyHash(getActiveChant(q).content));
    expect(w.gabcBodyHash).not.toBe("");
    expect(w.factors).toEqual({ "0:0": 1.2 });
  });
});

describe("leitura tolerante: endurecimento final", () => {
  const mk = (o: object, files: Record<string, string>) =>
    fromBundle(JSON.stringify({ schema: 2, kind: "notker-project", ...o }), files, undefined);
  const flat = (p: ReturnType<typeof mk>): { id: string; content?: string }[] => {
    const out: { id: string; content?: string }[] = [];
    const rec = (ns: typeof p.root): void => ns.forEach((n) => (n.kind === "chant" ? out.push(n) : rec(n.children)));
    rec(p.root);
    return out;
  };
  it("id repetido em chants[] não perde o segundo: vira órfão na raiz com id novo", () => {
    const p = mk({
      tree: [{ chant: "x" }],
      chants: [{ id: "x", file: "gabc/a.gabc", title: "A" }, { id: "x", file: "gabc/b.gabc", title: "B" }],
    }, { "gabc/a.gabc": "AAA", "gabc/b.gabc": "BBB" });
    const cs = flat(p);
    expect(cs.map((c) => c.content)).toEqual(["AAA", "BBB"]);
    expect(new Set(cs.map((c) => c.id)).size).toBe(2);
  });
  it("arquivo '__proto__'/'constructor' vira conteúdo '' (string), nunca não-string", () => {
    const p = mk({
      tree: [{ chant: "a" }, { chant: "b" }],
      chants: [{ id: "a", file: "__proto__", title: "A" }, { id: "b", file: "constructor", title: "B" }],
    }, {});
    for (const c of flat(p)) expect(c.content).toBe("");
  });
  it("arquivo '../x' nunca produz caminho fora do plano de exportação", () => {
    const p = mk({ tree: [{ chant: "a" }], chants: [{ id: "a", file: "../x", title: "../../etc" }] }, { "../x": "Z" });
    for (const f of gabcExportPlan(p).files) { expect(f.path.includes("..")).toBe(false); expect(f.path.startsWith("/")).toBe(false); }
  });
  it("árvore só com grupos ganha canto esqueleto e activeId válido", () => {
    const p = mk({ tree: [{ group: "g", title: "G", children: [] }], chants: [], active: "g" }, {});
    const cs = flat(p);
    expect(cs.length).toBe(1);
    expect(p.activeId).toBe(cs[0].id);
  });
});

describe("formato — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("erros e padrões no idioma", () => {
    setLocale("en");
    expect(() => fromBundle(JSON.stringify({ schema: 3, kind: "notker-project" }), {}, undefined)).toThrow("This project was created by a newer version of Notker.");
    expect(() => fromBundle("{", {}, undefined)).toThrow("invalid project.json");
    expect(() => fromBundle("{}", {}, undefined)).toThrow("not a Notker project");
  });
});
