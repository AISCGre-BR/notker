import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/tmp/a.gabc"),
  save: vi.fn(async () => "/tmp/b.gabc"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async () => "name: X;\n%%\n(c4)"),
  writeTextFile: vi.fn(async () => {}),
}));
import { openGabc, saveGabc, saveAsGabc } from "../src/files/file-io";
import { writeTextFile } from "@tauri-apps/plugin-fs";

describe("file-io", () => {
  it("openGabc devolve {path, content}", async () => {
    expect(await openGabc()).toEqual({ path: "/tmp/a.gabc", content: "name: X;\n%%\n(c4)" });
  });
  it("saveGabc escreve no path informado", async () => {
    await saveGabc("/tmp/b.gabc", "conteúdo");
    expect(writeTextFile).toHaveBeenCalledWith("/tmp/b.gabc", "conteúdo");
  });
  it("saveAsGabc abre diálogo, escreve e devolve o path", async () => {
    expect(await saveAsGabc("c")).toBe("/tmp/b.gabc");
    expect(writeTextFile).toHaveBeenCalledWith("/tmp/b.gabc", "c");
  });
});
