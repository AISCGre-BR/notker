// test/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveUnsaved, askSaveChanges, type UnsavedGuard, type SaveChoice } from "../src/app/session";

function guard(answers: SaveChoice[], over: Partial<UnsavedGuard> = {}) {
  const errors: (string | undefined)[] = [];
  const g: UnsavedGuard = {
    isDirty: () => true,
    title: () => "Missa",
    save: vi.fn(async () => true),
    ask: vi.fn(async (_t: string, err?: string) => { errors.push(err); return answers.shift() ?? "cancel"; }),
    ...over,
  };
  return { g, errors };
}

describe("resolveUnsaved", () => {
  it("sem alterações segue sem perguntar", async () => {
    const { g } = guard([], { isDirty: () => false });
    expect(await resolveUnsaved(g)).toBe(true);
    expect(g.ask).not.toHaveBeenCalled();
  });
  it("Cancelar não segue; Não salvar segue sem salvar", async () => {
    const a = guard(["cancel"]);
    expect(await resolveUnsaved(a.g)).toBe(false);
    expect(a.g.save).not.toHaveBeenCalled();
    const b = guard(["discard"]);
    expect(await resolveUnsaved(b.g)).toBe(true);
    expect(b.g.save).not.toHaveBeenCalled();
  });
  it("Salvar segue se salvou; Salvar como cancelado não segue", async () => {
    const a = guard(["save"]);
    expect(await resolveUnsaved(a.g)).toBe(true);
    expect(a.g.ask).toHaveBeenCalledWith("Missa", undefined);
    const b = guard(["save"], { save: vi.fn(async () => false) });
    expect(await resolveUnsaved(b.g)).toBe(false);
  });
  it("erro ao salvar pergunta de novo com a mensagem; Não salvar ainda fecha", async () => {
    const { g, errors } = guard(["save", "discard"], { save: vi.fn(async () => { throw new Error("Permissão negada"); }) });
    expect(await resolveUnsaved(g)).toBe(true);
    expect(g.ask).toHaveBeenCalledTimes(2);
    expect(errors[1]).toContain("Permissão negada");
    expect(errors[1]).toContain("Não salvar");
  });
});

describe("askSaveChanges", () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="dialog-host" style="display:none"></div>';
    host = document.getElementById("dialog-host")!;
  });
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>(".sc-dialog__actions button")];

  it("título com o nome; Não salvar (perigo) à esquerda, Cancelar, Salvar preenchido", async () => {
    const pr = askSaveChanges(host, "Missa de Natal");
    expect(host.querySelector(".sc-dialog__title")!.textContent).toBe("Salvar alterações em “Missa de Natal”?");
    expect(buttons().map((b) => b.textContent)).toEqual(["Não salvar", "Cancelar", "Salvar"]);
    expect(buttons()[0].classList.contains("sc-btn--danger")).toBe(true);
    expect(buttons()[2].classList.contains("sc-btn--filled")).toBe(true);
    buttons()[0].click();
    expect(await pr).toBe("discard");
  });
  it("Enter = Salvar; Esc = Cancelar; o erro aparece no corpo", async () => {
    let pr = askSaveChanges(host, "M");
    host.querySelector<HTMLElement>(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(await pr).toBe("save");
    pr = askSaveChanges(host, "M", "Não foi possível salvar: disco cheio.");
    expect(host.querySelector(".sc-dialog__body")!.textContent).toBe("Não foi possível salvar: disco cheio.");
    host.querySelector<HTMLElement>(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await pr).toBe("cancel");
  });
});
