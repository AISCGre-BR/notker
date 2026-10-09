import { describe, it, expect } from "vitest";
import {
  newProject, ephemeralFromGabc, effectiveFamily, getActiveDoc,
  withActiveContent, setActive, setDocFamily, addDoc, removeDoc, moveDoc, insertDocAt,
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

    // remover o ATIVO reatribui o activeId ao primeiro restante
    let q = newProject({ family: "stgall", name: "X" });
    const xId = q.activeId;
    q = addDoc(q, { title: "Y", content: "name: Y;\n%%\n(c4) y" });
    q = removeDoc(q, xId); // remove o ativo (X)
    expect(q.docs).toHaveLength(1);
    expect(q.activeId).toBe(q.docs[0].id);
    expect(q.docs[0].title).toBe("Y");
  });

  it("withActiveContent atualiza o conteúdo do doc ativo", () => {
    let p = newProject({ family: "stgall" });
    p = withActiveContent(p, "name: Novo;\n%%\n(c4) c d e");
    expect(getActiveDoc(p).content).toContain("c d e");
  });

  it("toBundle transliterada ligaduras latinas no nome do arquivo", () => {
    const p = newProject({ family: "stgall", name: "Rorate Cæli" });
    const meta = JSON.parse(toBundle(p).project_json);
    expect(meta.documents[0].file).toContain("rorate-caeli");
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

describe("interpretation (onda) no bundle", () => {
  it("I1. toBundle grava interpretation/<file>.json para docs com onda; fromBundle restaura", () => {
    // Cria projeto com 1 doc e atribui interpretation com fatores não-vazios
    let p = newProject({ family: "stgall", name: "Rorate" });
    const docId = p.activeId;
    // Injeta interpretation diretamente no doc (simula o que captureEditorIntoProject faz)
    p = {
      ...p,
      docs: p.docs.map((d) =>
        d.id === docId
          ? { ...d, interpretation: { gabcBodyHash: "cafe1234", factors: { "0:1": 1.6 } } }
          : d,
      ),
    };

    const bundle = toBundle(p);

    // Espera que haja exatamente uma chave interpretation/ nos files
    const interpKeys = Object.keys(bundle.files).filter((k) => k.startsWith("interpretation/"));
    expect(interpKeys).toHaveLength(1);

    // O nome deve ser o mesmo slug do gabc com .json no lugar de .gabc
    const gabcKey = Object.keys(bundle.files).find((k) => k.startsWith("gabc/"))!;
    const baseName = gabcKey.replace(/^gabc\//, "").replace(/\.gabc$/, "");
    expect(interpKeys[0]).toBe(`interpretation/${baseName}.json`);

    // O conteúdo JSON deve ter os campos esperados
    const parsed = JSON.parse(bundle.files[interpKeys[0]]);
    expect(parsed.gabcBodyHash).toBe("cafe1234");
    expect(parsed.factors["0:1"]).toBe(1.6);

    // fromBundle restaura interpretation corretamente
    const p2 = fromBundle(bundle.project_json, bundle.files, undefined);
    expect(getActiveDoc(p2).interpretation?.factors["0:1"]).toBe(1.6);
    expect(getActiveDoc(p2).interpretation?.gabcBodyHash).toBe("cafe1234");
  });

  it("I2. doc SEM onda não gera arquivo de interpretação; bundle antigo (sem o arquivo) carrega com interpretation undefined", () => {
    // toBundle de doc sem interpretation → nenhuma chave interpretation/ em files
    const p = newProject({ family: "stgall", name: "Rorate" });
    const bundle = toBundle(p);
    const interpKeys = Object.keys(bundle.files).filter((k) => k.startsWith("interpretation/"));
    expect(interpKeys).toHaveLength(0);

    // fromBundle de bundle SEM arquivos interpretation/ → docs[*].interpretation undefined
    const p2 = fromBundle(bundle.project_json, bundle.files, undefined);
    expect(getActiveDoc(p2).interpretation).toBeUndefined();

    // Robustez: JSON inválido no arquivo interpretation → interpretation undefined (não quebra)
    const bundleWithInvalidJson = { ...bundle, files: { ...bundle.files } };
    const gabcKey = Object.keys(bundle.files).find((k) => k.startsWith("gabc/"))!;
    const baseName = gabcKey.replace(/^gabc\//, "").replace(/\.gabc$/, "");
    bundleWithInvalidJson.files[`interpretation/${baseName}.json`] = "{ invalid json !!!";
    const p3 = fromBundle(bundleWithInvalidJson.project_json, bundleWithInvalidJson.files, undefined);
    expect(getActiveDoc(p3).interpretation).toBeUndefined();
  });

  it("moveDoc sobe, desce e não sai das pontas", () => {
    let p = newProject({ family: "stgall", name: "A" });
    p = addDoc(p, { title: "B", content: "" });
    p = addDoc(p, { title: "C", content: "" });
    const ids = () => p.docs.map((d) => d.title).join("");
    const [a, , c] = p.docs.map((d) => d.id);
    p = moveDoc(p, c, -1); expect(ids()).toBe("ACB");
    p = moveDoc(p, c, -1); expect(ids()).toBe("CAB");
    p = moveDoc(p, c, -1); expect(ids()).toBe("CAB");
    p = moveDoc(p, a, 1); expect(ids()).toBe("CBA");
    p = moveDoc(p, a, 1); expect(ids()).toBe("CBA");
  });
});

describe("insertDocAt", () => {
  const mk = () => {
    let p = newProject({ family: "stgall", name: "A" });
    p = addDoc(p, { title: "B", content: "b" });
    p = addDoc(p, { title: "C", content: "c" });
    return p;
  };
  it("reinsere no índice original, preservando o conteúdo atual dos outros", () => {
    let p = mk();
    const removed = p.docs[1];
    p = removeDoc(p, removed.id);
    p = withActiveContent(p, "editado");
    const r = insertDocAt(p, removed, 1);
    expect(r.docs.map((d) => d.title)).toEqual(["A", "B", "C"]);
    expect(r.docs[0].content).toBe("editado");
  });
  it("índice acima do tamanho vai ao fim; abaixo de 0 ao início", () => {
    const p = mk();
    const d = { id: "x", title: "X", content: "" };
    expect(insertDocAt(p, d, 99).docs.at(-1)!.id).toBe("x");
    expect(insertDocAt(p, d, -5).docs[0].id).toBe("x");
  });
});

