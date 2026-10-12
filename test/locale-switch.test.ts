import { afterEach, describe, expect, it, vi } from "vitest";
import { REOPEN_KEY, performReopen, resolveReopenTarget, stopWithTimeout, teardownForReload, switchLocale, takeReopen, writeReopen, type LocaleSwitchDeps } from "../src/app/locale-switch";
import { LOCALE_KEY, setLocale } from "../src/i18n";

afterEach(() => { setLocale("pt-BR"); localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); });

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
    expect(localStorage.getItem(REOPEN_KEY)).toBeNull();
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
  it("guarda em localStorage (sobrevive à recarga do webview), lê e apaga", () => {
    writeReopen({ kind: "gabc", path: "/p/a.gabc" });
    expect(sessionStorage.getItem(REOPEN_KEY)).toBeNull();
    expect(localStorage.getItem(REOPEN_KEY)).not.toBeNull();
    expect(takeReopen()).toEqual({ kind: "gabc", path: "/p/a.gabc" });
    expect(localStorage.getItem(REOPEN_KEY)).toBeNull();
  });
  it("lixo ou storage bloqueado = null", () => {
    localStorage.setItem(REOPEN_KEY, "{oops");
    expect(takeReopen()).toBeNull();
    localStorage.setItem(REOPEN_KEY, JSON.stringify({ kind: "path", path: 3 }));
    expect(takeReopen()).toBeNull();
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
    try { expect(takeReopen()).toBeNull(); } finally { Storage.prototype.getItem = orig; }
  });
});

describe("o que reabrir", () => {
  const base = { projectOpen: true, path: undefined as string | undefined, gabcPath: undefined as string | undefined, exampleOpen: false, dirty: false };
  it("projeto salvo: o caminho (mesmo sujo: o Não salvar volta ao salvo)", () => {
    expect(resolveReopenTarget({ ...base, path: "/p/m.notker", dirty: true })).toEqual({ kind: "path", path: "/p/m.notker" });
  });
  it("exemplo", () => { expect(resolveReopenTarget({ ...base, exampleOpen: true })).toEqual({ kind: "example" }); });
  it(".gabc aberto direto e não sujo", () => {
    expect(resolveReopenTarget({ ...base, gabcPath: "/p/a.gabc" })).toEqual({ kind: "gabc", path: "/p/a.gabc" });
  });
  it(".gabc sujo (o usuário disse Não salvar): tela inicial", () => {
    expect(resolveReopenTarget({ ...base, gabcPath: "/p/a.gabc", dirty: true })).toBeNull();
  });
  it("novo não salvo e tela inicial: nada", () => {
    expect(resolveReopenTarget(base)).toBeNull();
    expect(resolveReopenTarget({ ...base, projectOpen: false, path: "/p/m.notker" })).toBeNull();
  });
});

describe("executar a reabertura", () => {
  const mk = () => ({ openPath: vi.fn(async () => {}), openGabc: vi.fn(async () => {}), openExample: vi.fn(async () => {}) });
  it("despacha por tipo", async () => {
    const d = mk();
    await performReopen({ kind: "path", path: "/a.notker" }, d);
    await performReopen({ kind: "gabc", path: "/a.gabc" }, d);
    await performReopen({ kind: "example" }, d);
    await performReopen(null, d);
    expect(d.openPath).toHaveBeenCalledWith("/a.notker");
    expect(d.openGabc).toHaveBeenCalledWith("/a.gabc");
    expect(d.openExample).toHaveBeenCalledTimes(1);
  });
});

describe("desmontar antes de recarregar", () => {
  it("espera a promessa do ouvinte de fechar (sem janela de tempo) e o desfaz", async () => {
    const unlisten = vi.fn();
    let resolve!: (u: () => void) => void;
    const p = new Promise<() => void>((r) => { resolve = r; });
    const order: string[] = [];
    const done = teardownForReload({ closeListener: p, stop: async () => { order.push("stop"); } }).then(() => order.push("done"));
    await Promise.resolve();
    expect(order).toEqual([]); // ainda esperando o registro do ouvinte
    resolve(unlisten);
    await done;
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["stop", "done"]);
  });
  it("registro do ouvinte que falhou não impede o resto", async () => {
    const stop = vi.fn(async () => {});
    await teardownForReload({ closeListener: Promise.reject(new Error("x")), stop });
    expect(stop).toHaveBeenCalled();
  });
  it("stop que nunca resolve: a recarga acontece mesmo assim (2 s)", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const { d } = deps({ teardown: () => teardownForReload({ closeListener: null, stop: () => new Promise<void>(() => {}) }), reload });
    const r = switchLocale("en", d);
    await vi.advanceTimersByTimeAsync(2100);
    expect(await r).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("stopWithTimeout devolve ao estourar", async () => {
    vi.useFakeTimers();
    const r = stopWithTimeout(() => new Promise<void>(() => {}), 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(r).resolves.toBeUndefined();
  });
});
