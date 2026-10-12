import { afterEach, describe, expect, it } from "vitest";
import {
  DICTIONARIES, LOCALES, LOCALE_KEY, LOCALE_NAMES, detectLocale, formatDate, getLocale, initLocale,
  loadLocalePref, paramsOf, saveLocalePref, setLocale, t, tn,
} from "../src/i18n";

afterEach(() => {
  setLocale("pt-BR");
  try { localStorage.clear(); } catch { /* jsdom sempre tem */ }
});

describe("dicionários", () => {
  const keysOf = (l: (typeof LOCALES)[number]) => Object.keys(DICTIONARIES[l]).sort();

  it("os três idiomas têm exatamente as mesmas chaves", () => {
    expect(keysOf("en")).toEqual(keysOf("pt-BR"));
    expect(keysOf("it")).toEqual(keysOf("pt-BR"));
  });

  it("cada chave usa os mesmos {params} nos três idiomas", () => {
    for (const k of keysOf("pt-BR") as (keyof (typeof DICTIONARIES)["pt-BR"])[]) {
      const p = paramsOf(DICTIONARIES["pt-BR"][k]);
      expect(paramsOf(DICTIONARIES.en[k]), `en ${k}`).toEqual(p);
      expect(paramsOf(DICTIONARIES.it[k]), `it ${k}`).toEqual(p);
    }
  });

  it("nenhum texto vazio e todo plural tem .one e .other", () => {
    for (const l of LOCALES) {
      for (const [k, v] of Object.entries(DICTIONARIES[l])) expect(v.trim(), `${l} ${k}`).not.toBe("");
    }
    const keys = keysOf("pt-BR");
    for (const k of keys.filter((k) => k.endsWith(".one"))) expect(keys).toContain(k.replace(/\.one$/, ".other"));
    for (const k of keys.filter((k) => k.endsWith(".other"))) expect(keys).toContain(k.replace(/\.other$/, ".one"));
  });

  it("rótulos dos idiomas sempre no próprio idioma", () => {
    expect(LOCALE_NAMES).toEqual({ "pt-BR": "Português", en: "English", it: "Italiano" });
  });
});

describe("t / tn", () => {
  it("pt-BR é o padrão (antes de initLocale)", () => {
    expect(getLocale()).toBe("pt-BR");
    expect(t("common.save")).toBe("Salvar");
  });

  it("interpola {params} e formata números no idioma", () => {
    expect(t("pdf.done", { file: "a.pdf" })).toBe("PDF exportado: a.pdf.");
    expect(t("catalog.showing", { shown: 150, total: 1189 })).toBe("mostrando 150 de 1.189");
    setLocale("en");
    expect(t("catalog.showing", { shown: 150, total: 1189 })).toBe("showing 150 of 1,189");
  });

  it("parâmetro ausente fica visível, sem quebrar", () => {
    expect(t("pdf.done")).toBe("PDF exportado: {file}.");
  });

  it("plural: n === 1 → .one; senão .other", () => {
    expect(tn("export.chants", 1)).toBe("1 canto exportado.");
    expect(tn("export.chants", 3)).toBe("3 cantos exportados.");
    setLocale("it");
    expect(tn("tree.deleteGroupConfirm", 2, { title: "Kyrie" })).toBe("Eliminare «Kyrie» e i 2 canti al suo interno?");
  });

  it("troca de idioma muda as próximas chamadas", () => {
    setLocale("en");
    expect(t("cmd.file.saveAs")).toBe("Save As…");
    setLocale("it");
    expect(t("cmd.file.saveAs")).toBe("Salva con nome…");
  });

  it("datas no idioma escolhido", () => {
    const d = new Date(2026, 3, 27);
    expect(formatDate(d, { day: "numeric", month: "long" })).toBe("27 de abril");
    setLocale("en");
    expect(formatDate(d, { day: "numeric", month: "long" })).toBe("April 27");
    setLocale("it");
    expect(formatDate(d, { day: "numeric", month: "long" })).toBe("27 aprile");
  });
});

describe("idioma inicial", () => {
  it.each([
    ["pt-BR", "pt-BR"], ["pt-PT", "pt-BR"], ["pt", "pt-BR"], ["PT_br", "pt-BR"],
    ["it-IT", "it"], ["it", "it"], ["it-CH", "it"],
    ["en-US", "en"], ["en", "en"], ["fr-FR", "en"], ["de", "en"], ["", "en"], [undefined, "en"],
  ])("navigator.language %s → %s", (lang, want) => {
    expect(detectLocale(lang)).toBe(want);
  });

  it("initLocale: sem preferência, segue o sistema e marca <html lang>", () => {
    expect(initLocale({ language: "it-IT" })).toBe("it");
    expect(getLocale()).toBe("it");
    expect(document.documentElement.lang).toBe("it");
  });

  it("initLocale: a escolha gravada vence o sistema", () => {
    saveLocalePref("en");
    expect(localStorage.getItem(LOCALE_KEY)).toBe("en");
    expect(initLocale({ language: "pt-BR" })).toBe("en");
  });

  it("preferência inválida ou storage bloqueado = sistema", () => {
    localStorage.setItem(LOCALE_KEY, "fr");
    expect(loadLocalePref()).toBeNull();
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("bloqueado"); };
    try {
      expect(loadLocalePref()).toBeNull();
      expect(initLocale({ language: "pt-BR" })).toBe("pt-BR");
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
