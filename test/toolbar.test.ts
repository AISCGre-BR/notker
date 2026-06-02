import { describe, it, expect, vi } from "vitest";
import { createToolbar } from "../src/ui/toolbar";

describe("toolbar", () => {
  it("cada botão dispara o comando correspondente", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const host = document.createElement("div");
    createToolbar(host, { run, ids: () => ["openFile", "openSearch", "togglePreview"] } as any, [
      { id: "openFile", label: "Abrir" },
      { id: "openSearch", label: "Buscar" },
      { id: "togglePreview", label: "Preview" },
    ]);
    const btns = host.querySelectorAll("button.toolbar-btn");
    expect(btns.length).toBe(3);
    (btns[1] as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledWith("openSearch");
  });
});
