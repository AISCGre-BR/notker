import { describe, it, expect } from "vitest";
import { newDocumentDialog } from "../src/ui/new-dialog";

describe("diálogo Novo", () => {
  it("resolve com família e campos preenchidos ao confirmar (toggle, sem radio)", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    // família começa em stgall; escolhe Laon pelo botão-toggle
    host.querySelector<HTMLButtonElement>('[data-fam="laon"]')!.click();
    host.querySelector<HTMLInputElement>(".newdlg-name")!.value = "Rorate";
    host.querySelector<HTMLInputElement>(".newdlg-office")!.value = "Introitus";
    host.querySelector<HTMLButtonElement>(".newdlg-ok")!.click();
    const r = await p;
    expect(r).toEqual({ family: "laon", name: "Rorate", office: "Introitus" });
    expect(host.querySelector(".newdlg")).toBeNull(); // fechou
  });

  it("não usa controles de formulário nativos (sem radio/checkbox/select)", () => {
    const host = document.createElement("div");
    newDocumentDialog(host, { title: "x" });
    expect(host.querySelector('input[type="radio"]')).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelectorAll(".newdlg-fam-btn").length).toBe(2);
  });

  it("default é St. Gallen quando não se troca a família", async () => {
    const host = document.createElement("div");
    const p = newDocumentDialog(host, { title: "x" });
    host.querySelector<HTMLButtonElement>(".newdlg-ok")!.click();
    expect(await p).toEqual({ family: "stgall" });
  });

  it("resolve null ao cancelar", async () => {
    const host = document.createElement("div");
    const p = newDocumentDialog(host, { title: "Novo projeto" });
    host.querySelector<HTMLButtonElement>(".newdlg-cancel")!.click();
    expect(await p).toBeNull();
  });
});
