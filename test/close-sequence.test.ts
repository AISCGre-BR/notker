import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCloseSequence, type CloseDeps } from "../src/app/close-sequence";

let calls: string[];
let d: CloseDeps;
beforeEach(() => {
  calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  d = {
    awaitSaving: async () => { calls.push("saving"); },
    confirmGuide: async () => { calls.push("guide"); return true; },
    resolveUnsaved: async () => { calls.push("unsaved"); return true; },
    flushView: () => { calls.push("view"); },
    flushNames: async () => { calls.push("names"); },
    stopRecovery: () => { calls.push("stop"); },
    clearRecovery: async () => { calls.push("clear"); },
  };
});

describe("runCloseSequence", () => {
  it("caminho feliz: todos os passos, nesta ordem, e a janela fecha", async () => {
    expect(await runCloseSequence(d)).toEqual({ prevent: false });
    expect(calls).toEqual(["saving", "guide", "unsaved", "view", "names", "stop", "clear"]);
  });
  it("passo que lança: os seguintes rodam e a função resolve (a janela nunca prende)", async () => {
    d.flushView = () => { throw new Error("vista"); };
    d.flushNames = async () => { throw new Error("nomes"); };
    d.stopRecovery = () => { throw new Error("stop"); };
    expect(await runCloseSequence(d)).toEqual({ prevent: false });
    expect(calls).toEqual(["saving", "guide", "unsaved", "clear"]);
    expect(console.error).toHaveBeenCalledTimes(3);
  });
  it("clearRecovery rejeitando também resolve", async () => {
    d.clearRecovery = async () => { throw new Error("x"); };
    await expect(runCloseSequence(d)).resolves.toEqual({ prevent: false });
  });
  it("guarda falha (lança): fecha, mas o retrato de recuperação FICA", async () => {
    d.resolveUnsaved = async () => { throw new Error("guarda"); };
    expect(await runCloseSequence(d)).toEqual({ prevent: false });
    expect(calls).not.toContain("clear");
    expect(calls).toContain("stop");
  });
  it("usuário cancela as alterações: impede o fechamento e nada mais roda", async () => {
    d.resolveUnsaved = async () => false;
    expect(await runCloseSequence(d)).toEqual({ prevent: true });
    expect(calls).toEqual(["saving", "guide"]);
  });
  it("guia com rascunho: 'continuar editando' impede o fechamento", async () => {
    d.confirmGuide = async () => false;
    expect(await runCloseSequence(d)).toEqual({ prevent: true });
    expect(calls).toEqual(["saving"]);
  });
  it("erro na pergunta do guia: segue e fecha; erro em awaitSaving também", async () => {
    d.confirmGuide = async () => { throw new Error("g"); };
    d.awaitSaving = async () => { throw new Error("s"); };
    expect(await runCloseSequence(d)).toEqual({ prevent: false });
    expect(calls).toContain("unsaved");
  });
  it("sem confirmGuide (fora do guia) pula o passo", async () => {
    delete d.confirmGuide;
    await runCloseSequence(d);
    expect(calls).not.toContain("guide");
  });
});
