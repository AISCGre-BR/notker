import { afterEach, describe, expect, it, vi } from "vitest";
import { REOPEN_KEY, switchLocale, takeReopen, writeReopen, type LocaleSwitchDeps } from "../src/app/locale-switch";
import { LOCALE_KEY, setLocale } from "../src/i18n";

afterEach(() => { setLocale("pt-BR"); localStorage.clear(); sessionStorage.clear(); });

const deps = (o: Partial<LocaleSwitchDeps> = {}) => {
  const calls: string[] = [];
  const d: LocaleSwitchDeps = {
    current: () => "pt-BR",
    close: vi.fn(async () => { calls.push("close"); return { prevent: false }; }),
    reopenTarget: vi.fn(() => { calls.push("target"); return { kind: "path", path: "/p/missa.notker" } as const; }),
    teardown: vi.fn(async () => { calls.push("teardown"); }),
    reload: vi.fn(() => { calls.push("reload"); }),
    ...o,
  };
  return { d, calls };
};

describe("trocar idioma", () => {
  it("mesmo idioma: nada acontece", async () => {
    const { d } = deps();
    expect(await switchLocale("pt-BR", d)).toBe(false);
    expect(d.close).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("cancelou o 'Salvar alterações?': idioma e janela intactos", async () => {
    const { d } = deps({ close: vi.fn(async () => ({ prevent: true })) });
    expect(await switchLocale("en", d)).toBe(false);
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();
    expect(sessionStorage.getItem(REOPEN_KEY)).toBeNull();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("seguiu: grava a preferência, guarda o que reabrir (depois do fechar), desmonta (LSP, ouvinte de fechar) e recarrega", async () => {
    const { d, calls } = deps();
    expect(await switchLocale("it", d)).toBe(true);
    expect(localStorage.getItem(LOCALE_KEY)).toBe("it");
    expect(calls).toEqual(["close", "target", "teardown", "reload"]);
    expect(takeReopen()).toEqual({ kind: "path", path: "/p/missa.notker" });
  });

  it("teardown que falha não impede a recarga", async () => {
    const { d } = deps({ teardown: vi.fn(async () => { throw new Error("x"); }) });
    expect(await switchLocale("en", d)).toBe(true);
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});

describe("reabrir depois da recarga", () => {
  it("lê uma vez só", () => {
    writeReopen({ kind: "example" });
    expect(takeReopen()).toEqual({ kind: "example" });
    expect(takeReopen()).toBeNull();
  });
  it("nada a reabrir apaga o anterior", () => {
    writeReopen({ kind: "example" });
    writeReopen(null);
    expect(takeReopen()).toBeNull();
  });
  it("lixo ou storage bloqueado = null", () => {
    sessionStorage.setItem(REOPEN_KEY, "{oops");
    expect(takeReopen()).toBeNull();
    sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ kind: "path", path: 3 }));
    expect(takeReopen()).toBeNull();
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
    try { expect(takeReopen()).toBeNull(); } finally { Storage.prototype.getItem = orig; }
  });
});
