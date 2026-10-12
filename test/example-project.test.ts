import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { buildExampleBundle, buildExampleProject, EXAMPLE_TITLE } from "../src/project/example-build";
import { loadExampleProject } from "../src/project/example";
import { flattenChants, getActiveChant, updateChant, invariantErrors } from "../src/project/tree";

const samples = readdirSync("samples").filter((f) => f.endsWith(".gabc")).sort()
  .map((file) => ({ file, content: readFileSync(`samples/${file}`, "utf8") }));

describe("projeto de exemplo", () => {
  it("o JSON embutido é exatamente o que o script gera (se falhar: npm run example)", () => {
    const committed = JSON.parse(readFileSync("src/assets/example-project.json", "utf8"));
    expect(committed).toEqual(buildExampleBundle(samples));
  });
  it("abre sem caminho, com os 4 cantos em árvore e os .gabc puros", () => {
    const p = loadExampleProject();
    expect(p.path).toBeUndefined();
    expect(p.title).toBe(EXAMPLE_TITLE);
    expect(p.family).toBe("stgall");
    expect(p.root.map((n) => n.kind)).toEqual(["chant", "chant", "group"]);
    expect(flattenChants(p).map((c) => c.title)).toEqual(["Pópulus Sion", "Kyrie", "Factus est", "Dies sanctificatus"]);
    expect(flattenChants(p).map((c) => c.content)).toEqual(samples.map((s) => s.content));
    expect(getActiveChant(p).title).toBe("Pópulus Sion");
    expect(invariantErrors(p)).toEqual([]);
  });
  it("cada abertura é um projeto novo: editar um não muda o próximo", () => {
    const a = loadExampleProject();
    updateChant(a, a.activeId, { content: "x" });
    a.title = "Mudado";
    const b = loadExampleProject();
    expect(b.title).toBe(EXAMPLE_TITLE);
    expect(getActiveChant(b).content).toBe(samples[0].content);
  });
  it("sample ausente → erro claro", () => {
    expect(() => buildExampleProject(samples.slice(1))).toThrow("sample ausente: 01-minimo.gabc");
  });
});
