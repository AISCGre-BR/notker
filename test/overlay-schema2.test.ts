// test/overlay-schema2.test.ts — overlay de nomes schema 2 (sequências do usuário)
import { describe, it, expect } from "vitest";
import {
  emptyOverlay, parseOverlay, serializeOverlay, mergeOverlays, cloneOverlay,
  sequenceId, normalizeNabc, isSequenceId, parseSequenceId,
  addName, addNameToEntries, removeName, promoteName, setNote, setHidden,
  addSequence, removeSequence, restoreSequence, changeSequenceNabc, overlayCounts,
  FUTURE_OVERLAY_MESSAGE,
} from "../src/neume/overlay";
import { promoteToDefault } from "../src/overlay-ui/conflict";
import type { Overlay } from "../src/neume/types";

const T = "2026-10-09T12:00:00.000Z";
const withSeq = (): Overlay => addSequence(emptyOverlay(), "stgall", "pe!vi", T).overlay;
const SEQ = "seq:stgall:pe!vi";

describe("ids de sequência", () => {
  it("normaliza (trim e sem espaços internos) e é determinístico", () => {
    expect(normalizeNabc("  pe! vi \n")).toBe("pe!vi");
    expect(sequenceId("stgall", " pe!vi ")).toBe(SEQ);
    expect(sequenceId("laon", "un!cl")).toBe("seq:laon:un!cl");
    expect(isSequenceId(SEQ)).toBe(true);
    expect(isSequenceId("stgall:pe")).toBe(false);
    expect(parseSequenceId(SEQ)).toEqual({ family: "stgall", nabc: "pe!vi" });
    expect(parseSequenceId("seq:outra:pe")).toBeNull();
  });
});

describe("parseOverlay: schema 1 → 2", () => {
  const v1 = JSON.stringify({ schema: 1, kind: "notker-neume-overlay", entries: { "stgall:cl": { names: ["clive longo"], note: "n", hidden: true } } });
  it("migra sem perder nomes, nota e oculto; sequences vazio", () => {
    const o = parseOverlay(v1);
    expect(o.schema).toBe(2);
    expect(o.sequences).toEqual({});
    expect(o.entries["stgall:cl"]).toEqual({ names: ["clive longo"], note: "n", hidden: true });
  });
  it("grava sempre schema 2 e o round-trip é estável", () => {
    const o = parseOverlay(v1);
    const text = serializeOverlay(o);
    expect(JSON.parse(text).schema).toBe(2);
    expect(parseOverlay(text)).toEqual(o);
    const s = withSeq();
    expect(parseOverlay(serializeOverlay(s))).toEqual(s);
  });
  it("schema maior que 2 dá a mensagem de versão nova; kind errado é inválido", () => {
    expect(() => parseOverlay('{"schema":3,"kind":"notker-neume-overlay","entries":{}}')).toThrow(FUTURE_OVERLAY_MESSAGE);
    expect(() => parseOverlay('{"schema":2,"kind":"outro","entries":{}}')).toThrow("inválido");
    expect(() => parseOverlay('{"kind":"notker-neume-overlay","entries":{}}')).toThrow("inválido");
  });
  it("tolera lixo: nomes não-string, sequência sem família/nabc, chaves re-normalizadas e unidas", () => {
    const o = parseOverlay(JSON.stringify({
      schema: 2, kind: "notker-neume-overlay",
      entries: { "stgall:pe": { names: ["a", 3, "", "a"] }, "seq:stgall:x": { names: ["fora do lugar"] } },
      sequences: {
        "qualquer": { family: "stgall", nabc: "pe! vi", names: ["um"], created: T },
        "seq:stgall:pe!vi": { family: "stgall", nabc: "pe!vi", names: ["dois", "um"] },
        "ruim1": { family: "grego", nabc: "pe" },
        "ruim2": { family: "laon" },
        "ruim3": { family: "laon", nabc: "   " },
      },
    }));
    expect(o.entries["stgall:pe"].names).toEqual(["a"]);
    expect(o.entries["seq:stgall:x"]).toBeUndefined();
    expect(Object.keys(o.sequences)).toEqual([SEQ]);
    expect(o.sequences[SEQ].names).toEqual(["um", "dois"]);
    expect(o.sequences[SEQ].created).toBe(T);
  });
  it("chave __proto__ não polui nem quebra", () => {
    const o = parseOverlay('{"schema":2,"kind":"notker-neume-overlay","entries":{"__proto__":{"names":["x"]}},"sequences":{}}');
    expect(({} as Record<string, unknown>).names).toBeUndefined();
    expect(Object.getPrototypeOf(o.entries)).toBe(Object.prototype);
    expect(Object.keys(o.entries)).toEqual([]);
    expect(Object.keys(o.sequences)).toEqual([]);
  });
});

describe("sequências", () => {
  it("addSequence cria uma vez; repetida (mesmo após normalizar) devolve existed", () => {
    const a = addSequence(emptyOverlay(), "stgall", " pe!vi ", T);
    expect(a.id).toBe(SEQ);
    expect(a.existed).toBe(false);
    expect(a.overlay.sequences[SEQ]).toEqual({ family: "stgall", nabc: "pe!vi", created: T });
    const b = addSequence(a.overlay, "stgall", "pe! vi", "outra data");
    expect(b.existed).toBe(true);
    expect(b.overlay).toBe(a.overlay);
    expect(addSequence(a.overlay, "laon", "pe!vi", T).existed).toBe(false); // outra família = outra sequência
    expect(() => addSequence(emptyOverlay(), "stgall", "  ", T)).toThrow();
  });
  it("nomes: add/remove/promover/nota/oculto funcionam com id de sequência", () => {
    let o = addName(withSeq(), SEQ, "pes com virga");
    o = addName(o, SEQ, "segundo");
    expect(o.sequences[SEQ].names).toEqual(["pes com virga", "segundo"]);
    o = promoteName(o, SEQ, "segundo");
    expect(o.sequences[SEQ].names).toEqual(["segundo", "pes com virga"]);
    expect(promoteToDefault(o, SEQ, "pes com virga").sequences[SEQ].names![0]).toBe("pes com virga");
    o = removeName(o, SEQ, "segundo");
    o = removeName(o, SEQ, "pes com virga");
    expect(o.sequences[SEQ].names).toBeUndefined();
    o = setNote(setHidden(o, SEQ, true), SEQ, " nota ");
    expect(o.sequences[SEQ]).toMatchObject({ hidden: true, note: "nota", family: "stgall", nabc: "pe!vi" });
    expect(Object.keys(o.entries)).toEqual([]); // nada vazou para entries
  });
  it("nome em sequência inexistente não cria nada; addNameToEntries diz changed=false", () => {
    const o = emptyOverlay();
    expect(addName(o, "seq:stgall:zz", "x")).toBe(o);
    expect(addNameToEntries(o, [{ id: "seq:stgall:zz", displayNames: [] }], "x").changed).toBe(false);
  });
  it("funções sem mudança devolvem o MESMO objeto", () => {
    const o = addName(withSeq(), SEQ, "a");
    expect(addName(o, SEQ, "a")).toBe(o);
    expect(removeName(o, SEQ, "b")).toBe(o);
    expect(promoteName(o, SEQ, "a")).toBe(o);
    expect(setHidden(o, SEQ, false)).toBe(o);
    expect(setNote(o, SEQ, "")).toBe(o);
  });
  it("remover e desfazer devolvem a sequência com nomes; se o id voltou, une", () => {
    const o = addName(withSeq(), SEQ, "a");
    const r = removeSequence(o, SEQ);
    expect(r.removed).toMatchObject({ nabc: "pe!vi", names: ["a"] });
    expect(r.overlay.sequences[SEQ]).toBeUndefined();
    expect(restoreSequence(r.overlay, SEQ, r.removed!)).toEqual(o);
    const recreated = addName(addSequence(r.overlay, "stgall", "pe!vi", T).overlay, SEQ, "b");
    expect(restoreSequence(recreated, SEQ, r.removed!).sequences[SEQ].names).toEqual(["b", "a"]);
    expect(removeSequence(o, "seq:stgall:nada").overlay).toBe(o);
  });
  it("trocar a cadeia muda o id; colisão com outra sequência não muda nada", () => {
    let o = addName(withSeq(), SEQ, "a");
    const c = changeSequenceNabc(o, SEQ, "pe!vi!cl");
    expect(c.id).toBe("seq:stgall:pe!vi!cl");
    expect(c.overlay.sequences[SEQ]).toBeUndefined();
    expect(c.overlay.sequences[c.id]).toMatchObject({ nabc: "pe!vi!cl", names: ["a"], created: T });
    o = addSequence(c.overlay, "stgall", "cl", T).overlay;
    const k = changeSequenceNabc(o, c.id, " cl ");
    expect(k.collision).toBe("seq:stgall:cl");
    expect(k.overlay).toBe(o);
    expect(changeSequenceNabc(o, c.id, "pe!vi!cl").overlay).toBe(o);
  });
});

describe("merge, clone, contagem", () => {
  it("mergeOverlays une sequences sem duplicar nomes nem perder as de um lado só", () => {
    const a = addName(withSeq(), SEQ, "a");
    let b = addName(withSeq(), SEQ, "b");
    b = addName(addSequence(b, "laon", "un!cl", T).overlay, "seq:laon:un!cl", "z");
    b = addName(b, "stgall:pe", "podatus");
    const m = mergeOverlays(a, b);
    expect(m.sequences[SEQ].names).toEqual(["a", "b"]);
    expect(m.sequences["seq:laon:un!cl"].names).toEqual(["z"]);
    expect(m.entries["stgall:pe"].names).toEqual(["podatus"]);
    expect(a.sequences[SEQ].names).toEqual(["a"]); // entradas intactas
  });
  it("merge com overlay migrado do schema 1 preserva tudo", () => {
    const v1 = parseOverlay('{"schema":1,"kind":"notker-neume-overlay","entries":{"stgall:cl":{"names":["x"]}}}');
    const m = mergeOverlays(addName(withSeq(), SEQ, "a"), v1);
    expect(m.entries["stgall:cl"].names).toEqual(["x"]);
    expect(m.sequences[SEQ].names).toEqual(["a"]);
  });
  it("cloneOverlay é profundo nos dois mapas", () => {
    const o = addName(addName(withSeq(), SEQ, "a"), "stgall:pe", "p");
    const c = cloneOverlay(o);
    expect(c).toEqual(o);
    c.sequences[SEQ].names!.push("mut");
    c.entries["stgall:pe"].names!.push("mut");
    expect(o.sequences[SEQ].names).toEqual(["a"]);
    expect(o.entries["stgall:pe"].names).toEqual(["p"]);
  });
  it("overlayCounts conta itens nomeados e sequências", () => {
    const o = addName(addName(withSeq(), SEQ, "a"), "stgall:pe", "p");
    expect(overlayCounts(o)).toEqual({ named: 1, sequences: 1 });
  });
});
