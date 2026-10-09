import { describe, it, expect } from "vitest";
import { newDocumentDialog } from "../src/ui/new-dialog";

const mk = () => { const host = document.createElement("div"); document.body.appendChild(host); return host; };
const cancelBtn = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>(".sc-dialog__actions button")].find((b) => b.textContent === "Cancelar")!;
const okBtn = (host: HTMLElement) => host.querySelector<HTMLButtonElement>(".sc-dialog__actions .sc-btn--filled")!;

describe("diálogo Novo", () => {
  it("resolve com família e campos preenchidos ao confirmar (segmentado, sem radio)", async () => {
    const host = mk();
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    host.querySelectorAll<HTMLButtonElement>(".sc-seg button")[1].click();
    const inputs = host.querySelectorAll<HTMLInputElement>("input.sc-input");
    inputs[0].value = "Rorate";
    inputs[1].value = "Introitus";
    okBtn(host).click();
    expect(await p).toEqual({ family: "laon", name: "Rorate", office: "Introitus" });
    expect(host.querySelector(".sc-dialog")).toBeNull();
    expect(host.style.display).toBe("none");
  });

  it("não usa controles de formulário nativos (sem radio/checkbox/select)", () => {
    const host = mk();
    void newDocumentDialog(host, { title: "x" });
    expect(host.querySelector('input[type="radio"]')).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelectorAll(".sc-seg button").length).toBe(2);
  });

  it("default é St. Gall quando não se troca a família", async () => {
    const host = mk();
    const p = newDocumentDialog(host, { title: "x" });
    okBtn(host).click();
    expect(await p).toEqual({ family: "stgall" });
  });

  it("opts.family pré-seleciona a família", async () => {
    const host = mk();
    const p = newDocumentDialog(host, { title: "x", family: "laon" });
    okBtn(host).click();
    expect(await p).toEqual({ family: "laon" });
  });

  it("resolve null ao cancelar", async () => {
    const host = mk();
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    cancelBtn(host).click();
    expect(await p).toBeNull();
  });

  it("com warning e okLabel, mostra o aviso e o botão com rótulo customizado", async () => {
    const host = mk();
    const p = newDocumentDialog(host, {
      title: "Substituir projeto",
      warning: "O projeto atual será fechado.",
      okLabel: "Substituir",
    });
    expect(host.querySelector(".sc-dialog__body")!.textContent).toContain("O projeto atual será fechado.");
    expect(okBtn(host).textContent).toBe("Substituir");
    cancelBtn(host).click();
    await p;
  });

  it("sem warning/okLabel, não há corpo e o botão diz 'Criar'", async () => {
    const host = mk();
    const p = newDocumentDialog(host, { title: "Adicionar canto" });
    expect(host.querySelector(".sc-dialog__body")).toBeNull();
    expect(okBtn(host).textContent).toBe("Criar");
    cancelBtn(host).click();
    await p;
  });
});
