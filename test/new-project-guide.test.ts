// test/new-project-guide.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mountNewProjectGuide, projectFromDraft, emptyDraft, hasDraft, type GuideDeps, type GuideHandle, type NewProjectDraft,
} from "../src/app/new-project-guide";
import { setLocale } from "../src/i18n";
import { getActiveChant, effectiveFamily, invariantErrors } from "../src/project/tree";

const makeDeps = () => ({
  onCreate: vi.fn((_d: NewProjectDraft) => {}),
  onCancel: vi.fn(() => {}),
  confirmDiscard: vi.fn(async () => true),
  pickGabc: vi.fn(async (): Promise<{ name: string; content: string } | null> => null),
});
let host: HTMLElement;
let deps: ReturnType<typeof makeDeps>;
let g: GuideHandle;
beforeEach(() => {
  document.body.innerHTML = '<section id="guide-host"></section><div id="dialog-host"></div>';
  host = document.getElementById("guide-host")!;
  deps = makeDeps();
  g = mountNewProjectGuide(host, deps satisfies GuideDeps);
  g.focus();
});
afterEach(() => { g.destroy(); });

const states = () => [...host.querySelectorAll(".notker-step")].map((li) => li.className.replace("notker-step is-", ""));
const cur = () => host.querySelector<HTMLElement>(".notker-step.is-current")!;
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
const key = (t: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const clickText = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!.click();
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("passos", () => {
  it("abre no passo 1 com o foco no título; os outros esperam com o número", () => {
    expect(states()).toEqual(["current", "todo", "todo"]);
    expect(document.activeElement).toBe(cur().querySelector("input"));
    expect([...host.querySelectorAll(".notker-step__circle")].map((c) => c.textContent)).toEqual(["1", "2", "3"]);
    expect(cur().getAttribute("aria-current")).toBe("step");
  });
  it("Enter no título avança; passo feito: ✓, resumo em serifa e Alterar", () => {
    type(cur().querySelector("input")!, "Missa de Natal");
    key(cur().querySelector("input")!, "Enter");
    expect(states()).toEqual(["done", "current", "todo"]);
    const done = host.querySelector(".notker-step.is-done")!;
    expect(done.querySelector(".notker-step__circle svg")).not.toBeNull();
    expect(done.querySelector(".notker-step__summary")!.textContent).toBe("Missa de Natal");
    expect(done.querySelector(".notker-step__change")!.textContent).toBe("Alterar");
  });
  it("Enter compondo acento (IME) não avança", () => {
    key(cur().querySelector("input")!, "Enter", { isComposing: true });
    expect(states()).toEqual(["current", "todo", "todo"]);
  });
  it("Enter com keyCode 229 (IME do WebKitGTK) não avança nem cria", () => {
    key(cur().querySelector("input")!, "Enter", { keyCode: 229 });
    expect(states()).toEqual(["current", "todo", "todo"]);
    clickText("Continuar"); clickText("Continuar");
    key(cur().querySelector("input")!, "Enter", { keyCode: 229 });
    expect(deps.onCreate).not.toHaveBeenCalled();
  });
  it("família em segmentado; ← → alternam; resumo 'Laon'", () => {
    clickText("Continuar");
    const [sg, ln] = [...cur().querySelectorAll<HTMLButtonElement>(".sc-seg button")];
    expect([sg.getAttribute("aria-pressed"), ln.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    expect(document.activeElement).toBe(sg);
    key(sg, "ArrowRight");
    expect(ln.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(ln);
    clickText("Continuar");
    expect(host.querySelectorAll(".notker-step__summary")[1].textContent).toBe("Laon");
    expect(host.querySelectorAll(".notker-step__summary")[0].textContent).toBe("Sem título");
  });
  it("Alterar volta ao passo com o valor preservado", () => {
    type(cur().querySelector("input")!, "Vésperas");
    clickText("Continuar");
    clickText("Continuar");
    host.querySelector<HTMLButtonElement>(".notker-step.is-done .notker-step__change")!.click();
    expect(states()).toEqual(["current", "todo", "todo"]);
    expect(cur().querySelector("input")!.value).toBe("Vésperas");
  });
  it("Criar projeto entrega o rascunho; nada é criado antes; Enter no nome também cria", () => {
    type(cur().querySelector("input")!, "Missa");
    clickText("Continuar");
    clickText("Continuar");
    expect(deps.onCreate).not.toHaveBeenCalled();
    const [name, office] = [...cur().querySelectorAll("input")];
    type(name, "Puer natus est");
    type(office, "Introitus");
    clickText("Criar projeto");
    expect(deps.onCreate).toHaveBeenCalledWith({ title: "Missa", family: "stgall", chantName: "Puer natus est", office: "Introitus", gabc: "" });
    key(name, "Enter");
    expect(deps.onCreate).toHaveBeenCalledTimes(2);
  });
  it("Importar .gabc preenche o texto e, sem nome, o nome do canto", async () => {
    deps.pickGabc.mockResolvedValueOnce({ name: "kyrie", content: "name: Kyrie XI;\n%%\n(c4) Ky(f)" });
    clickText("Continuar"); clickText("Continuar");
    clickText("Importar .gabc…");
    await tick();
    expect(cur().querySelector("textarea")!.value).toBe("name: Kyrie XI;\n%%\n(c4) Ky(f)");
    expect(cur().querySelector("input")!.value).toBe("Kyrie XI");
    expect(g.draft().gabc).toContain("Kyrie XI");
  });
  it("título com marcação aparece literal no resumo", () => {
    type(cur().querySelector("input")!, "<b>Natal</b>");
    clickText("Continuar");
    const sum = host.querySelector(".notker-step__summary")!;
    expect(sum.textContent).toBe("<b>Natal</b>");
    expect(sum.querySelector("b")).toBeNull();
  });
});

describe("cancelar", () => {
  it("Esc sem rascunho cancela direto", async () => {
    key(document.activeElement!, "Escape");
    await tick();
    expect(deps.confirmDiscard).not.toHaveBeenCalled();
    expect(deps.onCancel).toHaveBeenCalledTimes(1);
  });
  it("Esc com rascunho pergunta; 'não' fica no guia, 'sim' cancela", async () => {
    type(cur().querySelector("input")!, "Missa");
    deps.confirmDiscard.mockResolvedValueOnce(false);
    key(cur().querySelector("input")!, "Escape");
    await tick();
    expect(deps.onCancel).not.toHaveBeenCalled();
    key(cur().querySelector("input")!, "Escape");
    await tick();
    expect(deps.confirmDiscard).toHaveBeenCalledTimes(2);
    expect(deps.onCancel).toHaveBeenCalledTimes(1);
  });
  it("Esc compondo acento, já tratado, ou com diálogo aberto não cancela", async () => {
    key(document.body, "Escape", { isComposing: true });
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    document.getElementById("dialog-host")!.innerHTML = '<div role="dialog"></div>';
    key(document.body, "Escape");
    await tick();
    expect(deps.onCancel).not.toHaveBeenCalled();
  });
  it("Esc com keyCode 229 (IME) não cancela", async () => {
    key(document.body, "Escape", { keyCode: 229 });
    await tick();
    expect(deps.onCancel).not.toHaveBeenCalled();
  });
  it("botão Cancelar usa a mesma regra", async () => {
    type(cur().querySelector("input")!, "x");
    clickText("Cancelar");
    await tick();
    expect(deps.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(deps.onCancel).toHaveBeenCalledTimes(1);
  });
  it("destroy tira o ouvinte de Esc e esvazia o host", async () => {
    g.destroy();
    key(document.body, "Escape");
    await tick();
    expect(deps.onCancel).not.toHaveBeenCalled();
    expect(host.childElementCount).toBe(0);
  });
});

describe("projectFromDraft", () => {
  it("esqueleto com nome e ofício; família padrão do projeto; título", () => {
    const p = projectFromDraft({ ...emptyDraft(), title: " Missa de Natal ", family: "laon", chantName: "Puer", office: "Introitus" });
    expect(p.title).toBe("Missa de Natal");
    expect(getActiveChant(p)).toMatchObject({ title: "Puer", content: "name: Puer;\noffice-part: Introitus;\n%%\n(c4) " });
    expect(getActiveChant(p).family).toBeUndefined();
    expect(effectiveFamily(p, p.activeId)).toBe("laon");
    expect(invariantErrors(p)).toEqual([]);
  });
  it("gabc colado vale como está; sem nome, o canto usa o name: do gabc", () => {
    const gabc = "name: Kyrie XI;\n%%\n(c4) Ky(f)ri(g)e(h)";
    const p = projectFromDraft({ ...emptyDraft(), gabc, office: "ignorado" });
    expect(getActiveChant(p)).toMatchObject({ title: "Kyrie XI", content: gabc });
  });
  it("tudo vazio: 'Sem título' e canto 'Novo'", () => {
    const p = projectFromDraft(emptyDraft());
    expect(p.title).toBe("Sem título");
    expect(getActiveChant(p)).toMatchObject({ title: "Novo", content: "name: Novo;\n%%\n(c4) " });
    expect(p.path).toBeUndefined();
  });
  it("hasDraft ignora espaços e a família", () => {
    expect(hasDraft({ ...emptyDraft(), family: "laon", title: "  " })).toBe(false);
    expect(hasDraft({ ...emptyDraft(), gabc: "x" })).toBe(true);
  });
});

describe("guia — idiomas", () => {
  afterEach(() => setLocale("pt-BR"));
  it("passos, campos e botões em italiano; projeto sem título usa o padrão do idioma", () => {
    g.destroy();
    setLocale("it");
    g = mountNewProjectGuide(host, deps);
    expect([...host.querySelectorAll(".notker-step__label")].map((e) => e.textContent)).toEqual(["Progetto", "Famiglia predefinita", "Primo canto"]);
    const input = cur().querySelector("input")!;
    expect(input.getAttribute("aria-label")).toBe("Titolo del progetto");
    expect(input.placeholder).toBe("Messa di Natale");
    expect(host.querySelector(".notker-guide__cancel")!.textContent).toBe("Annulla");
    const p = projectFromDraft(emptyDraft());
    expect(p.title).toBe("Senza titolo");
    expect(getActiveChant(p).title).toBe("Nuovo");
  });
});
