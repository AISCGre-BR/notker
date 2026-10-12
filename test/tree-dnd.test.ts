// test/tree-dnd.test.ts
import { describe, it, expect } from "vitest";
import { computeDrop, type DropRow } from "../src/project/tree-dnd";

const R = (id: string, kind: "group" | "chant", parentId: string | null, index: number, i: number, extra: Partial<DropRow> = {}): DropRow =>
  ({ id, kind, parentId, index, top: i * 30, height: 30, expanded: false, childCount: 0, ...extra });
/** a · n[ b · o[ c ] ] · d  (30 px por linha) */
const rows = [
  R("a", "chant", null, 0, 0),
  R("n", "group", null, 1, 1, { expanded: true, childCount: 2 }),
  R("b", "chant", "n", 0, 2),
  R("o", "group", "n", 1, 3, { expanded: true, childCount: 1 }),
  R("c", "chant", "o", 0, 4),
  R("d", "chant", null, 2, 5),
];
const free = () => false;

describe("computeDrop", () => {
  it("canto: metade de cima = antes, de baixo = depois", () => {
    expect(computeDrop(rows, 5, free)).toEqual({ parentId: null, index: 0, rowId: "a", where: "before" });
    expect(computeDrop(rows, 25, free)).toEqual({ parentId: null, index: 1, rowId: "a", where: "after" });
    expect(computeDrop(rows, 125, free)).toEqual({ parentId: "o", index: 0, rowId: "c", where: "before" });
  });
  it("grupo: faixa do meio = dentro (último filho); topo = antes; base de grupo aberto = 1º filho", () => {
    expect(computeDrop(rows, 45, free)).toEqual({ parentId: "n", index: 2, rowId: "n", where: "inside" });
    expect(computeDrop(rows, 32, free)).toEqual({ parentId: null, index: 1, rowId: "n", where: "before" });
    expect(computeDrop(rows, 58, free)).toEqual({ parentId: "n", index: 0, rowId: "n", where: "after" });
  });
  it("acima de tudo = antes da 1ª; abaixo de tudo = fim da raiz", () => {
    expect(computeDrop(rows, -10, free)).toEqual({ parentId: null, index: 0, rowId: "a", where: "before" });
    expect(computeDrop(rows, 400, free)).toEqual({ parentId: null, index: Infinity, rowId: "d", where: "end" });
    expect(computeDrop([], 10, free)).toBeNull();
  });
  it("destino proibido (dentro do próprio arrastado) → null", () => {
    expect(computeDrop(rows, 105, (pid) => pid === "o")).toBeNull();
    expect(computeDrop(rows, 135, (pid) => pid === "o")).toBeNull();
  });
});
