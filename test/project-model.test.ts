import { describe, it, expect } from "vitest";
import {
  newProject, ephemeralFromGabc, effectiveFamily, getActiveDoc,
  withActiveContent, setActive, setDocFamily, addDoc, removeDoc,
  toBundle, fromBundle,
} from "../src/project/model";

describe("modelo de projeto", () => {
  it("newProject cria 1 doc ativo com a família e cabeçalhos pedidos", () => {
    const p = newProject({ family: "laon", name: "Rorate", office: "Introitus" });
    expect(p.kind).toBe("notker-project");
    expect(p.family).toBe("laon");
    expect(p.docs).toHaveLength(1);
    const d = getActiveDoc(p);
    expect(d.title).toBe("Rorate");
    expect(d.content).toContain("name: Rorate;");
    expect(d.content).toContain("office-part: Introitus;");
    expect(d.content).toContain("%%");
    expect(effectiveFamily(p, p.activeId)).toBe("laon"); // sem override → default
  });

  it("ephemeralFromGabc tira o título do cabeçalho name: e fica sem path", () => {
    const p = ephemeralFromGabc("name: Ad te;\n%%\n(c4) a", "qualquer.gabc");
    expect(p.path).toBeUndefined();
    expect(p.docs).toHaveLength(1);
    expect(getActiveDoc(p).title).toBe("Ad te");
    expect(effectiveFamily(p, p.activeId)).toBe("stgall"); // default
  });

  it("setDocFamily aplica override por documento", () => {
    let p = newProject({ family: "stgall" });
    p = setDocFamily(p, p.activeId, "laon");
    expect(effectiveFamily(p, p.activeId)).toBe("laon");
    expect(p.family).toBe("stgall"); // default do projeto não muda
  });

  it("addDoc/removeDoc/setActive gerenciam a lista", () => {
    let p = newProject({ family: "stgall", name: "A" });
    const firstId = p.activeId;
    p = addDoc(p, { title: "B", content: "name: B;\n%%\n(c4) b" });
    expect(p.docs).toHaveLength(2);
    const bId = p.docs[1].id;
    p = setActive(p, bId);
    expect(getActiveDoc(p).title).toBe("B");
    p = removeDoc(p, firstId);
    expect(p.docs).toHaveLength(1);
    expect(p.activeId).toBe(bId); // remover o não-ativo mantém ativo
  });

  it("withActiveContent atualiza o conteúdo do doc ativo", () => {
    let p = newProject({ family: "stgall" });
    p = withActiveContent(p, "name: Novo;\n%%\n(c4) c d e");
    expect(getActiveDoc(p).content).toContain("c d e");
  });

  it("toBundle/fromBundle faz roundtrip; project.json não carrega conteúdo", () => {
    let p = newProject({ family: "laon", name: "Rorate" });
    p = setDocFamily(p, p.activeId, "stgall");
    const bundle = toBundle(p);
    const meta = JSON.parse(bundle.project_json);
    expect(meta.kind).toBe("notker-project");
    expect(meta.documents[0].family).toBe("stgall");
    expect(meta.documents[0].content).toBeUndefined(); // conteúdo só nos arquivos
    const file = meta.documents[0].file as string;
    expect(file).toMatch(/^gabc\/.+\.gabc$/);
    expect(bundle.files[file]).toContain("name: Rorate;");

    const p2 = fromBundle(bundle.project_json, bundle.files, "/x/y.notker");
    expect(p2.path).toBe("/x/y.notker");
    expect(getActiveDoc(p2).content).toContain("name: Rorate;");
    expect(effectiveFamily(p2, p2.activeId)).toBe("stgall");
  });
});
