import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadTheme, applyTheme, setTheme, THEME_KEY } from "../src/app/theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe("tema", () => {
  it("padrão é 'system' e não força data-theme", () => {
    expect(loadTheme()).toBe("system");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it("light/dark gravam data-theme no <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("setTheme persiste e loadTheme relê", () => {
    setTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(loadTheme()).toBe("dark");
  });
  it("valor inválido no storage cai para 'system'", () => {
    localStorage.setItem(THEME_KEY, "azul");
    expect(loadTheme()).toBe("system");
  });
  it("storage que lança não quebra: load = 'system', set só aplica", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(loadTheme()).toBe("system");
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
