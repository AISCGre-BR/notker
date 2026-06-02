import { describe, it, expect, vi } from "vitest";
import { createOverlayPanel } from "../src/overlay-ui/panel";
import type { EffectiveEntry } from "../src/neume/types";

function eff(id: string, name: string, names: string[]): EffectiveEntry {
  return {
    id, family: "stgall", code: name, nabc: name, nabcValid: true, base: name, name,
    qualifiers: [], letters: [], terms: [name], meaning: "",
    svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 },
    displayNames: names, hidden: false,
  };
}

describe("painel de overlay", () => {
  it("lista entradas com miniatura e nomes; salvar emite o overlay editado", () => {
    const host = document.createElement("div");
    const onSave = vi.fn();
    const panel = createOverlayPanel(host, {
      entries: () => [eff("stgall:cl", "clivis", ["clive longo", "clivis"])],
      onSave,
    });
    panel.open();
    expect(host.querySelector(".overlay-panel")).not.toBeNull();
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.textContent).toContain("clivis");
    panel.addName("stgall:cl", "clive curto");
    host.querySelector<HTMLButtonElement>(".overlay-save")!.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    const ov = onSave.mock.calls[0][0];
    expect(ov.entries["stgall:cl"].names).toContain("clive curto");
  });
});
