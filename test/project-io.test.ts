import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/proj/cantos.notker"),
  save: vi.fn(async () => "/proj/out.gabc"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => "name: Solto;\n%%\n(c4) a"),
  writeTextFile: vi.fn(async () => {}),
}));

import { openProject, openProjectAt, saveProject, exportCurrentGabc, exportAllGabc } from "../src/files/project-io";
import { newProject, getActiveChant, newGroup, newChant, insertNode } from "../src/project/tree";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";

describe("project-io", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("openProjectAt lê o .notker pelo caminho (sem diálogo) e guarda o caminho", async () => {
    invoke.mockResolvedValueOnce({
      project_json: JSON.stringify({ schema: 2, kind: "notker-project", title: "Natal", family: "stgall", tree: [{ chant: "c1" }], chants: [{ id: "c1", file: "gabc/a-c1.gabc", title: "A" }] }),
      files: { "gabc/a-c1.gabc": "name: A;\n%%\n(c4) a" },
    });
    const p = await openProjectAt("/m/Natal.notker");
    expect(open).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("read_project", { path: "/m/Natal.notker" });
    expect(p.path).toBe("/m/Natal.notker");
    expect(p.title).toBe("Natal");
  });
  it("openProjectAt propaga o erro do Rust (arquivo sumiu)", async () => {
    invoke.mockRejectedValueOnce("No such file or directory (os error 2)");
    await expect(openProjectAt("/sumiu.notker")).rejects.toBe("No such file or directory (os error 2)");
  });
  it("openProject abre um .notker via comando read_project", async () => {
    invoke.mockResolvedValueOnce({
      project_json: JSON.stringify({
        schema: 1, kind: "notker-project", title: "Cantos", family: "laon",
        documents: [{ id: "d1", file: "gabc/001-a.gabc", title: "A" }], active: "d1",
      }),
      files: { "gabc/001-a.gabc": "name: A;\n%%\n(c4) a" },
    });
    const p = await openProject();
    expect(invoke).toHaveBeenCalledWith("read_project", { path: "/proj/cantos.notker" });
    expect(p!.path).toBe("/proj/cantos.notker");
    expect(getActiveChant(p!).content).toContain("name: A;");
  });

  it("saveProject chama write_project com o bundle", async () => {
    invoke.mockResolvedValueOnce(undefined);
    const p = { ...newProject({ family: "stgall", name: "Z" }), path: "/proj/z.notker" };
    await saveProject(p);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [cmd, args] = invoke.mock.calls[0];
    expect(cmd).toBe("write_project");
    expect((args as { path: string }).path).toBe("/proj/z.notker");
    expect((args as { project_json: string }).project_json).toContain("notker-project");
    expect((args as { project_json: string }).project_json).toContain('"schema": 2');
  });

  it("saveProject com saveAs pede caminho mesmo tendo um, e garante a extensão .notker", async () => {
    invoke.mockResolvedValueOnce(undefined);
    vi.mocked(save).mockResolvedValueOnce("/proj/novo" as never);
    const p = { ...newProject({ family: "stgall", name: "Z" }), path: "/proj/z.notker" };
    expect(await saveProject(p, { saveAs: true })).toBe("/proj/novo.notker");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Z.notker" }));
    expect((invoke.mock.calls[0][1] as { path: string }).path).toBe("/proj/novo.notker");
  });
  it("saveProject sem saveAs usa o caminho que já tem (sem diálogo)", async () => {
    invoke.mockResolvedValueOnce(undefined);
    await saveProject({ ...newProject({ family: "stgall", name: "Z" }), path: "/proj/z.notker" });
    expect(save).not.toHaveBeenCalled();
  });

  it("exportCurrentGabc escreve o conteúdo do doc ativo como .gabc puro", async () => {
    const p = newProject({ family: "stgall", name: "Z" });
    const out = await exportCurrentGabc(p);
    expect(save).toHaveBeenCalled();
    expect(out).toBe("/proj/out.gabc");
    expect(writeTextFile).toHaveBeenCalledWith("/proj/out.gabc", getActiveChant(p).content);
  });
  it("exportAllGabc espelha os grupos como subpastas (mkdir) com prefixo de ordem", async () => {
    vi.mocked(open).mockResolvedValueOnce("/out" as never);
    let p = newProject({ family: "stgall", name: "Kyrie" });
    const g = newGroup("Natal");
    p = insertNode(p, null, Infinity, g);
    p = insertNode(p, g.id, 0, newChant({ title: "Puer natus", content: "name: Puer;\n%%\n(c4) a" }));
    expect(await exportAllGabc(p)).toBe(2);
    expect(open).toHaveBeenCalledWith({ directory: true, recursive: true });
    expect(mkdir).toHaveBeenCalledWith("/out/02-natal", { recursive: true });
    expect(writeTextFile).toHaveBeenCalledWith("/out/01-kyrie.gabc", expect.stringContaining("name: Kyrie;"));
    expect(writeTextFile).toHaveBeenCalledWith("/out/02-natal/01-puer-natus.gabc", "name: Puer;\n%%\n(c4) a");
  });
  it("exportAllGabc sem pasta escolhida não grava nada", async () => {
    vi.mocked(open).mockResolvedValueOnce(null as never);
    expect(await exportAllGabc(newProject({ family: "stgall" }))).toBe(0);
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
