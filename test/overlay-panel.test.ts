import { describe, it, expect, vi } from "vitest";
import { createOverlayPanel } from "../src/overlay-ui/panel";
import type { EffectiveEntry, Provenance } from "../src/neume/types";

function eff(id: string, name: string, names: string[], extra?: Partial<EffectiveEntry>): EffectiveEntry {
  return {
    id, family: "stgall", code: name, nabc: name, nabcValid: true, base: name, name,
    qualifiers: [], letters: [], terms: [name], meaning: "",
    svg: { path: "M0Z", viewBox: "0 0 1 1", advance: 1 },
    displayNames: names, hidden: false,
    ...extra,
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

  it("renderiza um input.overlay-search no topo do painel", () => {
    const host = document.createElement("div");
    const panel = createOverlayPanel(host, {
      entries: () => [eff("stgall:cl", "clivis", ["clivis"])],
      onSave: vi.fn(),
    });
    panel.open();
    expect(host.querySelector("input.overlay-search")).not.toBeNull();
  });

  it("digitar no input de busca filtra as linhas exibidas", () => {
    const host = document.createElement("div");
    const entries = [
      eff("stgall:cl", "clivis", ["clivis"]),
      eff("stgall:po", "podatus", ["podatus"]),
    ];
    const panel = createOverlayPanel(host, {
      entries: () => entries,
      onSave: vi.fn(),
    });
    panel.open();
    // antes de filtrar: 2 linhas
    expect(host.querySelectorAll(".overlay-row").length).toBe(2);

    const input = host.querySelector<HTMLInputElement>("input.overlay-search")!;
    input.value = "podatus";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // após filtrar por "podatus": apenas 1 linha
    expect(host.querySelectorAll(".overlay-row").length).toBe(1);
    expect(host.textContent).toContain("podatus");
    expect(host.textContent).not.toContain("clivis");
  });

  it("entry com synthetic:true renderiza .overlay-synthetic-badge", () => {
    const host = document.createElement("div");
    const panel = createOverlayPanel(host, {
      entries: () => [eff("stgall:cl!po", "cl!po", ["cl!po"], { synthetic: true })],
      onSave: vi.fn(),
    });
    panel.open();
    expect(host.querySelector(".overlay-synthetic-badge")).not.toBeNull();
    expect(host.querySelector(".overlay-synthetic-badge")!.textContent).toBe("seq");
  });

  it("clicar em .overlay-export chama onExport", () => {
    const host = document.createElement("div");
    const onExport = vi.fn();
    const panel = createOverlayPanel(host, {
      entries: () => [eff("stgall:cl", "clivis", ["clivis"])],
      onSave: vi.fn(),
      onExport,
    });
    panel.open();
    const btn = host.querySelector<HTMLButtonElement>(".overlay-export");
    expect(btn).not.toBeNull();
    btn!.click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("entry com provenance põe title com a fonte no label", () => {
    const prov: Provenance = {
      source: "Cardine, Semiologia Gregoriana, pp.12–15",
      via: "GregorioNabcRef v6.2.0",
      family: "stgall",
      row: "clivis",
    };
    const host = document.createElement("div");
    const panel = createOverlayPanel(host, {
      entries: () => [eff("stgall:cl", "clivis", ["clivis"], { provenance: [prov] })],
      onSave: vi.fn(),
    });
    panel.open();
    const label = host.querySelector<HTMLSpanElement>(".overlay-row span");
    expect(label).not.toBeNull();
    expect(label!.title).toContain("Cardine");
  });
});
