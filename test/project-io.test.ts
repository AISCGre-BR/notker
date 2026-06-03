import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/proj/cantos.notker"),
  save: vi.fn(async () => "/proj/out.gabc"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async () => "name: Solto;\n%%\n(c4) a"),
  writeTextFile: vi.fn(async () => {}),
}));

import { openProject, saveProject, exportCurrentGabc } from "../src/files/project-io";
import { newProject, getActiveDoc } from "../src/project/model";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";

describe("project-io", () => {
  beforeEach(() => { invoke.mockClear(); });
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
    expect(getActiveDoc(p!).content).toContain("name: A;");
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
  });

  it("exportCurrentGabc escreve o conteúdo do doc ativo como .gabc puro", async () => {
    const p = newProject({ family: "stgall", name: "Z" });
    const out = await exportCurrentGabc(p);
    expect(save).toHaveBeenCalled();
    expect(out).toBe("/proj/out.gabc");
    expect(writeTextFile).toHaveBeenCalledWith("/proj/out.gabc", getActiveDoc(p).content);
  });
});
