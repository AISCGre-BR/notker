import { describe, it, expect, beforeEach } from "vitest";
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
  it("tipo com contagem 0 fica desabilitado e desligado, e não liga ao clicar", async () => {
    const p = openStripDialog(host, { vertical: 0, horizontal: 2, mora: 0 });
    expect(toggles().map((b) => b.disabled)).toEqual([true, false, true]);
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
