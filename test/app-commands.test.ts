// test/app-commands.test.ts
import { describe, it, expect, vi } from "vitest";
import { createRegistry, keyOf, displayKey, gateCommands } from "../src/app/commands";

const key = (k: string, mods: Partial<KeyboardEventInit> = {}, target?: EventTarget) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
};

describe("keyOf / displayKey", () => {
  it("normaliza modificadores na ordem Ctrl+Alt+Shift e letras em maiúscula", () => {
    expect(keyOf(key("k", { ctrlKey: true }))).toBe("Ctrl+K");
    expect(keyOf(key("F", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+F");
    expect(keyOf(key("ArrowUp", { altKey: true }))).toBe("Alt+ArrowUp");
    expect(keyOf(key("F2"))).toBe("F2");
    expect(keyOf(key(" ", { ctrlKey: true }))).toBe("Ctrl+Space");
  });
  it("Cmd (meta) conta como Ctrl", () => {
    expect(keyOf(key("s", { metaKey: true }))).toBe("Ctrl+S");
  });
  it("exibição troca setas por símbolos", () => {
    expect(displayKey("Alt+ArrowUp")).toBe("Alt+↑");
  });
});

describe("registro", () => {
  it("run executa; id desconhecido lança; desabilitado não executa", async () => {
    const r = createRegistry();
    const a = vi.fn(), b = vi.fn();
    r.register([{ id: "a", label: "A", run: a }, { id: "b", label: "B", run: b, enabled: () => false }]);
    await r.run("a"); await r.run("b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    await expect(r.run("zzz")).rejects.toThrow(/zzz/);
  });
  it("rótulo dinâmico, atalho de exibição e tooltip", () => {
    const r = createRegistry();
    let on = false;
    r.register([{ id: "p", label: () => (on ? "Parar" : "Tocar"), run: () => {}, keys: ["Ctrl+Enter"] }]);
    expect(r.label("p")).toBe("Tocar");
    on = true;
    expect(r.label("p")).toBe("Parar");
    expect(r.tooltip("p")).toBe("Parar (Ctrl+Enter)");
  });
  it("handleKey executa o comando da tecla e previne o default", () => {
    const r = createRegistry();
    const pal = vi.fn();
    r.register([{ id: "neume.palette", label: "Paleta", run: pal, keys: ["F2", "Ctrl+K"] }]);
    const e = key("k", { ctrlKey: true });
    expect(r.handleKey(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(pal).toHaveBeenCalledTimes(1);
  });
  it("ignora evento já tratado (CodeMirror chamou preventDefault) — sem disparo duplo", () => {
    const r = createRegistry();
    const pal = vi.fn();
    r.register([{ id: "neume.palette", label: "Paleta", run: pal, keys: ["F2"] }]);
    const e = key("F2");
    e.preventDefault();
    expect(r.handleKey(e)).toBe(false);
    expect(pal).not.toHaveBeenCalled();
  });
  it("em <input>/<textarea>, só atalhos com Ctrl disparam", () => {
    const r = createRegistry();
    const pal = vi.fn(), save = vi.fn();
    r.register([
      { id: "neume.palette", label: "Paleta", run: pal, keys: ["F2"] },
      { id: "file.save", label: "Salvar", run: save, keys: ["Ctrl+S"] },
    ]);
    const input = document.createElement("input");
    expect(r.handleKey(key("F2", {}, input))).toBe(false);
    expect(r.handleKey(key("s", { ctrlKey: true }, input))).toBe(true);
    expect(pal).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("tecla repetida (e.repeat) só dispara com allowRepeat", () => {
    const r = createRegistry();
    const a = vi.fn(), b = vi.fn();
    r.register([
      { id: "a", label: "A", run: a, keys: ["Ctrl+K"] },
      { id: "b", label: "B", run: b, keys: ["Alt+ArrowUp"], allowRepeat: true },
    ]);
    expect(r.handleKey(key("k", { ctrlKey: true, repeat: true }))).toBe(false);
    expect(r.handleKey(key("ArrowUp", { altKey: true, repeat: true }))).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it("nada dispara com um menu aberto ([role=menu] no documento)", () => {
    const r = createRegistry();
    const a = vi.fn();
    r.register([{ id: "a", label: "A", run: a, keys: ["Ctrl+K"] }]);
    const m = document.createElement("div");
    m.setAttribute("role", "menu");
    document.body.appendChild(m);
    expect(r.handleKey(key("k", { ctrlKey: true }))).toBe(false);
    m.remove();
    expect(r.handleKey(key("k", { ctrlKey: true }))).toBe(true);
  });
  it("Ctrl+dígito casa pela tecla física (e.code) — layouts AZERTY", () => {
    expect(keyOf(key("&", { ctrlKey: true, code: "Digit1" }))).toBe("Ctrl+Digit1");
    expect(displayKey("Ctrl+Digit1")).toBe("Ctrl+1");
  });
  it("registrar id repetido substitui (não duplica)", () => {
    const r = createRegistry();
    r.register([{ id: "x", label: "1", run: () => {} }]);
    r.register([{ id: "x", label: "2", run: () => {} }]);
    expect(r.ids()).toEqual(["x"]);
    expect(r.label("x")).toBe("2");
  });
  it("onDidRun dispara após run() e após handleKey; unsubscribe funciona", async () => {
    const r = createRegistry();
    r.register([{ id: "a", label: "A", run: () => {}, keys: ["Ctrl+K"] }, { id: "off", label: "O", run: () => {}, enabled: () => false }]);
    const seen: string[] = [];
    const off = r.onDidRun((id) => seen.push(id));
    await r.run("a");
    r.handleKey(key("k", { ctrlKey: true }));
    await new Promise((res) => setTimeout(res, 0));
    await r.run("off"); // desabilitado: não executa, não notifica
    expect(seen).toEqual(["a", "a"]);
    off();
    await r.run("a");
    expect(seen).toHaveLength(2);
  });
});

describe("gateCommands", () => {
  it("fora da condição o comando não roda (teclado nem run); o enabled original continua valendo", async () => {
    const reg = createRegistry();
    const run = vi.fn();
    let open = false;
    let inner = true;
    reg.register([{ id: "file.save", label: "Salvar", run, keys: ["Ctrl+S"], enabled: () => inner }]);
    gateCommands(reg, ["file.save"], () => open);
    expect(reg.get("file.save")!.enabled!()).toBe(false);
    expect(reg.handleKey(key("s", { ctrlKey: true }))).toBe(false);
    await reg.run("file.save");
    expect(run).not.toHaveBeenCalled();
    open = true;
    expect(reg.handleKey(key("s", { ctrlKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    inner = false;
    expect(reg.get("file.save")!.enabled!()).toBe(false);
    expect(reg.shortcut("file.save")).toBe("Ctrl+S");
  });
  it("id desconhecido lança (erro de costura aparece no boot)", () => {
    expect(() => gateCommands(createRegistry(), ["nada"], () => true)).toThrow("comando desconhecido: nada");
  });
});

describe("Ctrl+P nunca abre a impressão nativa", () => {
  const ctrlP = (mods: Partial<KeyboardEventInit> = {}) => key("p", { ctrlKey: true, code: "KeyP", ...mods });
  const setup = (enabled: () => boolean = () => true) => {
    const r = createRegistry();
    const run = vi.fn();
    r.register([{ id: "file.exportPdf", label: "PDF", run, keys: ["Ctrl+P"], enabled }]);
    return { r, run };
  };
  it("comando desabilitado: previne e não executa", () => {
    const { r, run } = setup(() => false);
    const e = ctrlP();
    expect(r.handleKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it("menu aberto: previne e não executa", () => {
    const { r, run } = setup();
    document.body.innerHTML = '<div role="menu"></div>';
    const e = ctrlP();
    expect(r.handleKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(true);
    expect(run).not.toHaveBeenCalled();
    document.body.innerHTML = "";
  });
  it("repeat (tecla segurada): previne e não executa de novo", () => {
    const { r, run } = setup();
    const e = ctrlP({ repeat: true });
    expect(r.handleKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it("habilitado: executa e previne; Ctrl+Shift+P e Ctrl+Alt+P não são tocados", () => {
    const { r, run } = setup();
    const e = ctrlP();
    expect(r.handleKey(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r.handleKey(ctrlP({ shiftKey: true }))).toBe(false);
    const e2 = ctrlP({ altKey: true });
    r.handleKey(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});
