import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(async () => "/home/g/Missas/puer.pdf") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn(async () => {}) }));

import { pickPdfPath, writePdf } from "../src/files/pdf-io";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

describe("pdf-io", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("pickPdfPath: diálogo de salvar com filtro PDF e o nome sugerido; cancelado → null", async () => {
    expect(await pickPdfPath("puer-natus-est.pdf")).toBe("/home/g/Missas/puer.pdf");
    expect(save).toHaveBeenCalledWith({ filters: [{ name: "PDF", extensions: ["pdf"] }], defaultPath: "puer-natus-est.pdf" });
    vi.mocked(save).mockResolvedValueOnce(null);
    expect(await pickPdfPath("x.pdf")).toBeNull();
  });
  it("writePdf grava os bytes no caminho EXATO escolhido (o escopo do fs só tem esse)", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    await writePdf("/home/g/Missas/puer", bytes);
    expect(writeFile).toHaveBeenCalledWith("/home/g/Missas/puer", bytes);
  });
  it("capability: só fs:allow-write-file a mais (sem escopo amplo novo)", () => {
    const cap = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: unknown[] };
    const ids = cap.permissions.map((p) => (typeof p === "string" ? p : (p as { identifier: string }).identifier));
    expect(ids).toContain("fs:allow-write-file");
    expect(ids.filter((i) => /^fs:(scope|allow-(home|document|download|desktop))/.test(i))).toEqual([]);
  });
});
