import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setLocale } from "../src/i18n";
import { openStripDialog } from "../src/gabc/strip-dialog";

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="dialog-host" style="display:none"></div>';
  host = document.getElementById("dialog-host")!;
});
const toggles = () => [...host.querySelectorAll<HTMLButtonElement>(".sc-seg button")];
const state = () => toggles().map((b) => b.getAttribute("aria-pressed"));
const btn = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;
const counts = { vertical: 3, horizontal: 2, mora: 5 };

describe("diálogo Remover episemas e puncta mora", () => {
  it("título, rótulos com contagens, todos ligados por padrão; sem radio/checkbox/select", async () => {
    const p = openStripDialog(host, counts);
    expect(host.querySelector(".sc-dialog__title")!.textContent).toBe("Remover episemas e puncta mora");
    expect(host.querySelector('input[type="radio"], input[type="checkbox"], select')).toBeNull();
    expect(toggles().map((b) => b.textContent)).toEqual(["Episemas verticais (3)", "Episemas horizontais (2)", "Puncta mora (5)"]);
    expect(state()).toEqual(["true", "true", "true"]);
    btn("Remover").click();
    await expect(p).resolves.toEqual({ vertical: true, horizontal: true, mora: true });
    expect(host.style.display).toBe("none");
  });
  it("botões são liga/desliga independentes", async () => {
    const p = openStripDialog(host, counts);
    toggles()[0].click();
    expect(state()).toEqual(["false", "true", "true"]);
    toggles()[2].click();
    toggles()[0].click();
    expect(state()).toEqual(["true", "true", "false"]);
    btn("Remover").click();
    await expect(p).resolves.toEqual({ vertical: true, horizontal: true, mora: false });
  });
  it("tipo com contagem 0 fica aria-disabled (focável, lido com (0)) e desligado, e não liga ao clicar", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 2, mora: 0 });
    expect(toggles().map((b) => b.disabled)).toEqual([false, false, false]);
    expect(toggles().map((b) => b.getAttribute("aria-disabled"))).toEqual(["true", null, "true"]);
    expect(toggles()[0].textContent).toBe("Episemas verticais (0)");
    toggles()[0].focus();
    expect(document.activeElement).toBe(toggles()[0]);
    expect(state()).toEqual(["false", "true", "false"]);
    toggles()[0].click();
    expect(state()).toEqual(["false", "true", "false"]);
    btn("Remover").click();
    await expect(p).resolves.toEqual({ vertical: false, horizontal: true, mora: false });
  });
  it("usa a última escolha da sessão (limitada pelas contagens)", async () => {
    const p = openStripDialog(host, counts, { vertical: false, horizontal: true, mora: false });
    expect(state()).toEqual(["false", "true", "false"]);
    btn("Remover").click();
    await expect(p).resolves.toEqual({ vertical: false, horizontal: true, mora: false });
  });
  it("Remover fica desabilitado com nada ligado (e reabilita ao ligar)", async () => {
    const p = openStripDialog(host, counts);
    toggles().forEach((b) => b.click());
    expect(btn("Remover").disabled).toBe(true);
    btn("Remover").click();
    expect(host.style.display).toBe("block");
    toggles()[1].click();
    expect(btn("Remover").disabled).toBe(false);
    btn("Cancelar").click();
    await expect(p).resolves.toBeNull();
  });
  it("tudo zerado: Remover desabilitado de início", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    expect(btn("Remover").disabled).toBe(true);
    btn("Cancelar").click();
    await p;
  });
  it("Esc cancela; Enter confirma só se houver algo ligado", async () => {
    const p = openStripDialog(host, counts);
    host.querySelector(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(p).resolves.toBeNull();
    const q = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    host.querySelector(".sc-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(host.style.display).toBe("block");
    btn("Cancelar").click();
    await q;
  });
});

const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

describe("diálogo Remover — foco e teclado (correção)", () => {
  it("tudo zerado: foco vai para Cancelar e Esc (no activeElement) cancela", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    expect(document.activeElement).toBe(btn("Cancelar"));
    key(document.activeElement!, "Escape");
    await expect(p).resolves.toBeNull();
  });
  it("`last` desligando tudo também move o foco para Cancelar", async () => {
    const p = openStripDialog(host, counts, { vertical: false, horizontal: false, mora: false });
    expect(document.activeElement).toBe(btn("Cancelar"));
    key(document.activeElement!, "Escape");
    await expect(p).resolves.toBeNull();
  });
  it("Enter com algo ligado confirma; Enter num botão do segmentado não é interceptado pela guarda", async () => {
    const p = openStripDialog(host, counts);
    key(host.querySelector(".sc-dialog")!, "Enter");
    await expect(p).resolves.toEqual({ vertical: true, horizontal: true, mora: true });
    const q = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    toggles()[0].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    btn("Cancelar").click();
    await q;
  });
  it("Enter com isComposing não é interceptado pela guarda", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    const ev = new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    host.querySelector(".sc-dialog")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    btn("Cancelar").click();
    await p;
  });
  it("abrir → Cancelar → reabrir no mesmo host: Enter confirma o diálogo novo", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 0, mora: 0 });
    btn("Cancelar").click();
    await p;
    const q = openStripDialog(host, counts);
    key(host.querySelector(".sc-dialog")!, "Enter");
    await expect(q).resolves.toEqual({ vertical: true, horizontal: true, mora: true });
  });
});

describe("acessibilidade do diálogo", () => {
  it("segmentado é um grupo rotulado \"Sinais a remover\"; o corpo descreve o diálogo", async () => {
    const p = openStripDialog(host, counts);
    const seg = host.querySelector(".sc-seg")!;
    expect(seg.getAttribute("role")).toBe("group");
    const lab = document.getElementById(seg.getAttribute("aria-labelledby")!)!;
    expect(lab.textContent).toBe("Sinais a remover");
    const dlg = host.querySelector(".sc-dialog")!;
    const desc = document.getElementById(dlg.getAttribute("aria-describedby")!)!;
    expect(desc.textContent).toContain("Escolha o que tirar");
    btn("Cancelar").click();
    await p;
  });
});

describe("escopo no texto do diálogo", () => {
  const body = () => host.querySelector(".sc-dialog__body, .sc-dialog__text")?.textContent ?? host.textContent!;
  it.each([
    ["pasted", "trecho colado"], ["imported", "canto importado"], ["selection", "trecho selecionado"], ["chant", "canto atual"],
  ] as const)("%s cita %s", async (scope, frase) => {
    const p = openStripDialog(host, counts, undefined, scope);
    expect(body()).toContain(frase);
    btn("Cancelar").click();
    await p;
  });
  it("sem escopo mantém 'canto atual'", async () => {
    const p = openStripDialog(host, counts);
    expect(body()).toContain("canto atual");
    btn("Cancelar").click();
    await p;
  });
});

describe("diálogo Remover — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("em italiano: textos do dicionário e a ação continua desabilitando sem nada ligado", async () => {
    setLocale("it");
    const p = openStripDialog(host, { vertical: 1, horizontal: 0, mora: 0 }, undefined, "pasted");
    expect(host.querySelector(".sc-dialog__title")!.textContent).toBe("Rimuovi episemi e puncta mora");
    expect(host.querySelector(".sc-dialog__body")!.textContent).toContain("passo incollato");
    expect(toggles().map((b) => b.textContent)).toEqual(["Episemi verticali (1)", "Episemi orizzontali (0)", "Puncta mora (0)"]);
    toggles()[0].click(); // desliga o único ligado
    expect(btn("Rimuovi").disabled).toBe(true);
    btn("Annulla").click();
    expect(await p).toBeNull();
  });
});
