import { describe, it, expect } from "vitest";
import { createThumbTracker } from "../src/app/thumb-tracker";

describe("createThumbTracker", () => {
  it("caminho/conteúdo desconhecidos: mudou (gera)", () => {
    expect(createThumbTracker().changed("/a.notker", "(c4) A(g)")).toBe(true);
  });
  it("mesmo conteúdo já fotografado: não mudou; conteúdo novo: mudou", () => {
    const t = createThumbTracker();
    t.remember("/a.notker", "(c4) A(g)");
    expect(t.changed("/a.notker", "(c4) A(g)")).toBe(false);
    expect(t.changed("/a.notker", "(c4) A(h)")).toBe(true);
  });
  it("é por caminho; Salvar como em outro caminho gera de novo", () => {
    const t = createThumbTracker();
    t.remember("/a.notker", "x");
    expect(t.changed("/b.notker", "x")).toBe(true);
  });
  it("forget esquece o caminho", () => {
    const t = createThumbTracker();
    t.remember("/a.notker", "x");
    t.forget("/a.notker");
    expect(t.changed("/a.notker", "x")).toBe(true);
  });
});
