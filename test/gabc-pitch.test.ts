// test/gabc-pitch.test.ts
import { describe, it, expect } from "vitest";
import { pitchName, staffOffset } from "../src/gabc/gabc-pitch";

// Valores verificados contra notker-LEGACY/.../note_glyph.rs (gregorio CLI).
describe("gabc-pitch", () => {
  it("c4: j é o Dó (clave na linha 4)", () => {
    expect(pitchName("j", "c4")).toBe("do");
  });
  it("c4: h=Lá, i=Si, g=Sol, f=Fá, e=Mi, d=Ré", () => {
    expect(pitchName("h", "c4")).toBe("la");
    expect(pitchName("i", "c4")).toBe("si");
    expect(pitchName("g", "c4")).toBe("sol");
    expect(pitchName("f", "c4")).toBe("fa");
    expect(pitchName("e", "c4")).toBe("mi");
    expect(pitchName("d", "c4")).toBe("re");
  });
  it("c3: h é o Dó (clave na linha 3)", () => {
    expect(pitchName("h", "c3")).toBe("do");
  });
  it("c1: d é o Dó (clave na linha 1)", () => {
    expect(pitchName("d", "c1")).toBe("do");
  });
  it("f3: h é Fá e e é o Dó", () => {
    expect(pitchName("h", "f3")).toBe("fa");
    expect(pitchName("e", "f3")).toBe("do");
  });
  it("staffOffset cresce com a letra", () => {
    expect(staffOffset("i")).toBe(staffOffset("h") + 1);
  });
  it("sem clave assume c4", () => {
    expect(pitchName("j", null)).toBe("do");
  });
});
