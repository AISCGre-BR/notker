import { describe, it, expect, vi, beforeEach } from "vitest";

const fs = {
  exists: vi.fn(async (_p: string, _o?: unknown) => true),
  mkdir: vi.fn(async (_p: string, _o?: unknown) => {}),
  readTextFile: vi.fn(async (_p: string, _o?: unknown) => "conteúdo"),
  writeTextFile: vi.fn(async (_p: string, _t: string, _o?: unknown) => {}),
  rename: vi.fn(async (_a: string, _b: string, _o?: unknown) => {}),
  remove: vi.fn(async (_p: string, _o?: unknown) => {}),
};
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 14 },
  exists: (p: string, o?: unknown) => fs.exists(p, o),
  mkdir: (p: string, o?: unknown) => fs.mkdir(p, o),
  readTextFile: (p: string, o?: unknown) => fs.readTextFile(p, o),
  writeTextFile: (p: string, t: string, o?: unknown) => fs.writeTextFile(p, t, o),
  rename: (a: string, b: string, o?: unknown) => fs.rename(a, b, o),
  remove: (p: string, o?: unknown) => fs.remove(p, o),
}));

import { appDataSlot, existingPaths, RECENT_FILE, RECOVERY_FILE } from "../src/app/appdata-io";

const AD = { baseDir: 14 };
beforeEach(() => { vi.clearAllMocks(); });

describe("appDataSlot", () => {
  it("read: null se não existe; o texto se existe — sempre em AppData", async () => {
    fs.exists.mockResolvedValueOnce(false);
    expect(await appDataSlot(RECENT_FILE).read()).toBeNull();
    expect(fs.readTextFile).not.toHaveBeenCalled();
    expect(await appDataSlot(RECENT_FILE).read()).toBe("conteúdo");
    expect(fs.readTextFile).toHaveBeenCalledWith("recent.json", AD);
  });
  it("write: cria a pasta, grava .tmp e renomeia por cima (atômico)", async () => {
    await appDataSlot(RECOVERY_FILE).write("{}");
    expect(fs.mkdir).toHaveBeenCalledWith("recovery", { ...AD, recursive: true });
    expect(fs.writeTextFile).toHaveBeenCalledWith("recovery/session.json.tmp", "{}", AD);
    expect(fs.rename).toHaveBeenCalledWith("recovery/session.json.tmp", "recovery/session.json", { oldPathBaseDir: 14, newPathBaseDir: 14 });
    const order = [fs.mkdir, fs.writeTextFile, fs.rename].map((m) => m.mock.invocationCallOrder[0]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("write na raiz de AppData; falha do mkdir (pasta já existe) não impede gravar", async () => {
    fs.mkdir.mockRejectedValueOnce(new Error("existe"));
    await appDataSlot(RECENT_FILE).write("[]");
    expect(fs.mkdir).toHaveBeenCalledWith("", { ...AD, recursive: true });
    expect(fs.rename).toHaveBeenCalledWith("recent.json.tmp", "recent.json", { oldPathBaseDir: 14, newPathBaseDir: 14 });
  });
  it("erro de gravação propaga (quem chama decide)", async () => {
    fs.writeTextFile.mockRejectedValueOnce(new Error("disco cheio"));
    await expect(appDataSlot(RECENT_FILE).write("x")).rejects.toThrow("disco cheio");
    expect(fs.rename).not.toHaveBeenCalled();
  });
  it("remove: só se existe; apaga também o .tmp órfão", async () => {
    fs.exists.mockResolvedValue(false);
    await appDataSlot(RECOVERY_FILE).remove();
    expect(fs.remove).not.toHaveBeenCalled();
    fs.exists.mockResolvedValue(true);
    await appDataSlot(RECOVERY_FILE).remove();
    expect(fs.remove).toHaveBeenCalledWith("recovery/session.json", AD);
    expect(fs.remove).toHaveBeenCalledWith("recovery/session.json.tmp", AD);
  });
  it("duas gravações simultâneas no mesmo slot são serializadas (2ª só começa após o rename da 1ª)", async () => {
    let release!: () => void;
    fs.rename.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const a = appDataSlot(RECENT_FILE).write("A");
    const b = appDataSlot(RECENT_FILE).write("B");
    await new Promise((r) => setTimeout(r, 10));
    expect(fs.writeTextFile).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
    expect(fs.writeTextFile).toHaveBeenCalledTimes(2);
    expect(fs.writeTextFile.mock.calls[1][1]).toBe("B");
    expect(fs.rename.mock.invocationCallOrder[0]).toBeLessThan(fs.writeTextFile.mock.invocationCallOrder[1]);
  });
  it("falha da 1ª gravação não bloqueia a 2ª", async () => {
    fs.writeTextFile.mockRejectedValueOnce(new Error("disco cheio"));
    const a = appDataSlot(RECENT_FILE).write("A");
    const b = appDataSlot(RECENT_FILE).write("B");
    await expect(a).rejects.toThrow("disco cheio");
    await expect(b).resolves.toBeUndefined();
    expect(fs.rename).toHaveBeenCalledTimes(1);
  });
});

describe("remove na mesma cadeia das gravações", () => {
  it("write pendente + remove: o arquivo termina removido e o .tmp não é apagado no meio do write", async () => {
    let release!: () => void;
    fs.rename.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    fs.exists.mockResolvedValue(true);
    const slot = appDataSlot(RECOVERY_FILE);
    const w = slot.write("A");
    const r = slot.remove();
    await new Promise((x) => setTimeout(x, 10));
    expect(fs.remove).not.toHaveBeenCalled(); // espera o write terminar
    release();
    await Promise.all([w, r]);
    expect(fs.rename.mock.invocationCallOrder[0]).toBeLessThan(fs.remove.mock.invocationCallOrder[0]);
    expect(fs.remove).toHaveBeenCalledWith("recovery/session.json", AD);
  });
  it("write depois de remove só começa após o remove; falha do remove não trava a cadeia", async () => {
    fs.exists.mockResolvedValue(true);
    fs.remove.mockRejectedValueOnce(new Error("perm"));
    const slot = appDataSlot(RECENT_FILE);
    const r = slot.remove();
    const w = slot.write("B");
    await expect(r).rejects.toThrow("perm");
    await expect(w).resolves.toBeUndefined();
    expect(fs.writeTextFile).toHaveBeenCalledWith("recent.json.tmp", "B", AD);
  });
});

describe("existingPaths", () => {
  it("pergunta ao comando Rust existing_paths", async () => {
    invoke.mockResolvedValueOnce([true, false]);
    expect(await existingPaths(["/a.notker", "/b.notker"])).toEqual([true, false]);
    expect(invoke).toHaveBeenCalledWith("existing_paths", { paths: ["/a.notker", "/b.notker"] });
  });
});

describe("rotateSlot (vaga única de recuperação)", () => {
  it("renomeia session.json por cima de session.prev.json, pela fila dos dois arquivos", async () => {
    const { rotateSlot, RECOVERY_PREV_FILE } = await import("../src/app/appdata-io");
    expect(RECOVERY_PREV_FILE).toBe("recovery/session.prev.json");
    await rotateSlot(RECOVERY_FILE, RECOVERY_PREV_FILE);
    expect(fs.rename).toHaveBeenCalledWith("recovery/session.json", "recovery/session.prev.json", { oldPathBaseDir: 14, newPathBaseDir: 14 });
  });
  it("origem inexistente: nada a fazer, sem erro", async () => {
    const { rotateSlot, RECOVERY_PREV_FILE } = await import("../src/app/appdata-io");
    fs.exists.mockResolvedValueOnce(false);
    await rotateSlot(RECOVERY_FILE, RECOVERY_PREV_FILE);
    expect(fs.rename).not.toHaveBeenCalled();
  });
});
