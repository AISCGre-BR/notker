// test/dirty.test.ts
import { describe, it, expect } from "vitest";
import { projectFingerprint, createDirtyTracker } from "../src/app/dirty";
import {
  type GroupNode, newProject, newChant, newGroup, insertNode, setActive, setCollapsed, updateChant,
  renameNode, setChantFamily, moveSibling, flattenChants,
} from "../src/project/tree";
import { toBundle, fromBundle } from "../src/project/format";

const base = () => {
  let p = newProject({ family: "stgall", name: "A" });
  const g: GroupNode = newGroup("Natal");
  p = insertNode(p, null, Infinity, g);
  p = insertNode(p, g.id, 0, newChant({ title: "B" }));
  return { p, g, b: flattenChants(p)[1] };
};

describe("impressão digital do projeto", () => {
  it("não muda com canto ativo, grupo recolhido ou caminho", () => {
    const { p, g, b } = base();
    const f = projectFingerprint(p);
    expect(projectFingerprint(setActive(p, b.id))).toBe(f);
    expect(projectFingerprint(setCollapsed(p, g.id, true))).toBe(f);
    expect(projectFingerprint({ ...p, path: "/x.notker" })).toBe(f);
  });
  it("muda com texto, título, família, estrutura e onda", () => {
    const { p, g, b } = base();
    const f = projectFingerprint(p);
    expect(projectFingerprint(updateChant(p, b.id, { content: "x" }))).not.toBe(f);
    expect(projectFingerprint(renameNode(p, g.id, "Páscoa"))).not.toBe(f);
    expect(projectFingerprint(setChantFamily(p, b.id, "laon"))).not.toBe(f);
    expect(projectFingerprint(moveSibling(p, g.id, -1))).not.toBe(f);
    expect(projectFingerprint({ ...p, title: "Outro" })).not.toBe(f);
    expect(projectFingerprint(updateChant(p, b.id, { interpretation: { gabcBodyHash: "h", factors: { "0:0": 1.2 } } }))).not.toBe(f);
  });
  it("onda sem fatores conta como sem onda", () => {
    const { p, b } = base();
    expect(projectFingerprint(updateChant(p, b.id, { interpretation: { gabcBodyHash: "h", factors: {} } }))).toBe(projectFingerprint(p));
  });
  it("ida e volta pelo .notker não suja (abrir e fechar sem editar não pergunta)", () => {
    const { p } = base();
    const b = toBundle(p);
    expect(projectFingerprint(fromBundle(b.project_json, b.files, "/x.notker"))).toBe(projectFingerprint(p));
  });
});

describe("rastreador", () => {
  it("limpo após marcar; editar suja; voltar ao texto salvo limpa", () => {
    const { p, b } = base();
    const t = createDirtyTracker();
    expect(t.isDirty(p)).toBe(true);           // nunca marcado
    t.markSaved(p);
    expect(t.isDirty(p)).toBe(false);
    const edited = updateChant(p, b.id, { content: b.content + "x" });
    expect(t.isDirty(edited)).toBe(true);
    expect(t.isDirty(updateChant(edited, b.id, { content: b.content }))).toBe(false);
    t.markSaved(edited);
    expect(t.isDirty(edited)).toBe(false);
  });
});
