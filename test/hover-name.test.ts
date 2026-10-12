// test/hover-name.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { buildEntryRow, buildPartLabel, buildUnknownInfo, ofFamily, familyLookup } from "../src/neume/hover-nabc";
import { nameNeume } from "../src/neume/naming";
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
  it("nome duplicado (sem caixa) não é acrescentado ao rótulo", () => {
    const onName = vi.fn();
    const row = buildEntryRow(e, true, onName);
    document.body.appendChild(row);
    row.querySelector<HTMLButtonElement>(".neume-name-btn")!.click();
    const f = row.querySelector<HTMLInputElement>(".neume-name-input")!;
    f.value = "CLIVIS";
    kd(f, "Enter");
    expect(onName).toHaveBeenCalled();
    expect(row.querySelector("strong")!.textContent).toBe("clivis");
  });
  it("separador de partes usa tokens, não cores fixas", () => {
    const src = readFileSync("src/neume/hover-nabc.ts", "utf8");
    expect(src).not.toMatch(/#ccc|#666/);
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

describe("hover — sequências do usuário e tela de nomes", () => {
  it("sequência do usuário com nome mostra 'Seu nome: …' (texto literal)", () => {
    const seq = { ...e, id: "seq:stgall:cl!vi", userSequence: true, userNames: ["<b>x</b>"], displayNames: ["<b>x</b>"] } as unknown as EffectiveEntry;
    const row = buildEntryRow(seq, true);
    expect(row.querySelector(".neume-tip-name")!.textContent).toBe("Seu nome: <b>x</b>");
    expect(row.querySelector("b")).toBeNull();
  });
  it("glifo do catálogo continua mostrando o nome de exibição", () => {
    expect(buildEntryRow(e, true).querySelector(".neume-tip-name")!.textContent).toBe("clivis");
  });
  it("com onOpen, o botão 'Abrir na tela de nomes' chama com id/família/cadeia", () => {
    const onOpen = vi.fn();
    const row = buildEntryRow(e, true, undefined, onOpen);
    const b = row.querySelector<HTMLButtonElement>(".neume-open-names")!;
    expect(b.textContent).toBe("Abrir na tela de nomes");
    b.click();
    expect(onOpen).toHaveBeenCalledWith({ id: "stgall:cl", family: "stgall", nabc: "cl" });
  });
  it("sem onOpen, não há botão", () => {
    expect(buildEntryRow(e, true).querySelector(".neume-open-names")).toBeNull();
  });
});

describe("hover — só a família do canto", () => {
  const lao: EffectiveEntry = { ...e, id: "laon:cl", family: "laon" };
  it("ofFamily descarta a outra família (lista vazia = cai no nome sistemático)", () => {
    expect(ofFamily([lao, e], "stgall").map((x) => x.id)).toEqual(["stgall:cl"]);
    expect(ofFamily([lao, e], "laon").map((x) => x.id)).toEqual(["laon:cl"]);
    expect(ofFamily([lao], "stgall")).toEqual([]);
  });
  it("token que só existe na outra família: lookup vazio (cai no ramo 'fora do catálogo') e nome sistemático da família ativa", () => {
    const all = (n: string) => (n === "cl" ? [lao] : []);
    const stg = familyLookup(all, "stgall");
    expect(stg("cl")).toEqual([]);
    expect(familyLookup(all, "laon")("cl").map((x) => x.id)).toEqual(["laon:cl"]);
    expect(nameNeume("cl", "stgall").systematic).toBeTruthy();
  });
});
