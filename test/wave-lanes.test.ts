import { describe, it, expect } from "vitest";
import { mapSystems, type SylBox, type NoteIdent } from "../src/preview/wave-lanes";

const note = (s: number, n: number, pitch = "f"): NoteIdent =>
  ({ syllableIndex: s, realSyllableIndex: s, noteInSyllable: n, pitch, alt: 0, factor: 1, divisioAfter: null });

describe("mapSystems", () => {
  it("uma sílaba de 1 nota → 1 sistema, x no centro da box", () => {
    const notes = [note(0, 0)];
    const boxes = new Map<number, SylBox[]>([[0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]]]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes).toHaveLength(1);
    expect(sys[0].notes[0].x).toBeCloseTo(20); // 10 + 0.5*20
  });

  it("duas sílabas no mesmo y → um sistema com duas notas em x crescente", () => {
    const notes = [note(0, 0), note(1, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]],
      [1, [{ syllableIndex: 1, x: 40, y: 6, width: 20, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(1);
    expect(sys[0].notes.map((n) => n.x)).toEqual([20, 50]);
  });

  it("faixas de y distintas → dois sistemas, ordenados de cima para baixo", () => {
    const notes = [note(0, 0), note(1, 0)];
    const boxes = new Map<number, SylBox[]>([
      [0, [{ syllableIndex: 0, x: 10, y: 5, width: 20, height: 10 }]],
      [1, [{ syllableIndex: 1, x: 10, y: 80, width: 20, height: 10 }]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
    expect(sys[0].notes[0].syllableIndex).toBe(0);
    expect(sys[1].notes[0].syllableIndex).toBe(1);
  });

  it("melisma com a sílaba partida em 2 boxes (quebra de linha) → 1 nota em cada sistema", () => {
    const notes = [note(0, 0), note(0, 1)];
    const boxes = new Map<number, SylBox[]>([
      [0, [
        { syllableIndex: 0, x: 90, y: 5, width: 10, height: 10 },   // fim da linha 1
        { syllableIndex: 0, x: 0, y: 80, width: 10, height: 10 },   // início da linha 2
      ]],
    ]);
    const sys = mapSystems(notes, boxes);
    expect(sys).toHaveLength(2);
    expect(sys[0].notes).toHaveLength(1);
    expect(sys[1].notes).toHaveLength(1);
  });
});
