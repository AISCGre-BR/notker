import { describe, it, expect, vi } from "vitest";
import { createCommands } from "../src/ui/commands";

describe("registro de comandos", () => {
  it("expõe ações nomeadas e dispara o handler ligado", async () => {
    const openFile = vi.fn();
    const cmds = createCommands({
      openFile, saveFile: vi.fn(), format: vi.fn(), exportOverlay: vi.fn(),
      importOverlay: vi.fn(), toggleFamily: vi.fn(), openSearch: vi.fn(),
      openOverlayPanel: vi.fn(), togglePreview: vi.fn(), toggleSplit: vi.fn(),
    });
    expect(cmds.ids()).toContain("openFile");
    await cmds.run("openFile");
    expect(openFile).toHaveBeenCalledTimes(1);
  });
  it("run de id inexistente lança", async () => {
    const cmds = createCommands({} as any);
    await expect(cmds.run("naoExiste")).rejects.toThrow();
  });
});
