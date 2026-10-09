// test/hover-name.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildEntryRow, buildPartLabel, buildUnknownInfo } from "../src/neume/hover-nabc";
import type { EffectiveEntry } from "../src/neume/types";

const e: EffectiveEntry = {
  id: "stgall:cl", family: "stgall", code: "cl", nabc: "cl", nabcValid: true, base: "cl", name: "clivis",
  qualifiers: [], letters: [], terms: ["cl", "clivis"], meaning: "",
  svg: { path: "M0 0h10v10H0z", viewBox: "0 0 10 10", advance: 10 }, displayNames: ["clivis"], hidden: false,
};
const kd = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};

describe("hover — Nomear…", () => {
  it("sem onName, não oferece Nomear…", () => {
    expect(buildEntryRow(e, true).querySelector(".neume-name-btn")).toBeNull();
  });
  it("Nomear… → campo inline → Enter grava e mostra o nome", async () => {
    const onName = vi.fn();
    const row = buildEntryRow(e, true, onName);
    document.body.appendChild(row);
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    const f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    expect(document.activeElement).toBe(f);
    f.value = " flexa ";
    kd(f, "Enter");
    await Promise.resolve();
    expect(onName).toHaveBeenCalledWith(["stgall:cl"], "flexa");
    expect(row.textContent).toContain("flexa");
    expect(row.querySelector(".neume-name-input")).toBeNull();
  });
  it("Esc cancela; vazio não grava", () => {
    const onName = vi.fn();
    const row = buildEntryRow(e, true, onName);
    document.body.appendChild(row);
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    let f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    kd(f, "Escape");
    expect(row.querySelector(".neume-name-btn")).not.toBeNull();
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    const before = row.textContent;
    f.value = "  ";
    kd(f, "Enter");
    expect(onName).not.toHaveBeenCalled();
    expect(row.textContent).toBe(before);
    expect(row.querySelector(".neume-name-input")).not.toBeNull();
  });
  it("Enter durante composição (IME) é ignorado", () => {
    const onName = vi.fn();
    const row = buildEntryRow(e, true, onName);
    document.body.appendChild(row);
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    const f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    f.value = "flexa";
    kd(f, "Enter", { isComposing: true });
    expect(onName).not.toHaveBeenCalled();
    expect(row.querySelector(".neume-name-input")).not.toBeNull();
  });
  it("campo isola click/mousedown/keydown do que está por baixo", () => {
    const row = buildEntryRow(e, true, vi.fn());
    const outer = vi.fn();
    const host = document.createElement("div");
    for (const t of ["click", "mousedown", "keydown"]) host.addEventListener(t, outer);
    host.appendChild(row);
    document.body.appendChild(host);
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    outer.mockClear();
    const f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    f.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    f.click();
    kd(f, "a");
    expect(outer).not.toHaveBeenCalled();
  });

  it("partes: nome do usuário com HTML vira texto literal", () => {
    const evil = { ...e, displayNames: ["<img src=x onerror=alert(1)>"] };
    const el = buildPartLabel(evil);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("strong")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(el.querySelector("em")).not.toBeNull();
  });
  it("fora do catálogo: token/nomes/letras/fonte com HTML viram texto", () => {
    const el = buildUnknownInfo("<b>x</b>", ["<i>n1</i>", "<u>n2</u>"], "stgall", ["<s>l</s>"], "<a>src</a>");
    expect(el.querySelector("i, u, s, a")).toBeNull();
    expect(el.querySelectorAll("b").length).toBe(1); // só o <b> legítimo das letras
    expect(el.querySelector("code")!.textContent).toBe("<b>x</b>");
    expect(el.textContent).toContain("<i>n1</i> · <u>n2</u>");
    expect(el.textContent).toContain("fonte: <a>src</a>");
    expect(el.textContent).toContain("<s>l</s>");
  });
});
